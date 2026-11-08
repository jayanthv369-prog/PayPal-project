import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import Database from 'better-sqlite3';
import { initializeDatabase } from '../database/init.js';
import {
  registerRecoveryTransaction,
  reconcileRecoveryTransaction,
  getPendingRecoveryTransactions,
} from '../services/recoveryService.js';
import { TRANSACTION_STATES } from '../services/transactionService.js';

describe('SMART RECOVERY ENGINE TESTS', () => {
  let db;

  beforeEach(() => {
    db = new Database(':memory:');
    initializeDatabase(db);
  });

  it('registers in-flight transaction with idempotency lock', () => {
    const reg = registerRecoveryTransaction({
      idempotencyKey: 'IDEMP-REC-TEST-1',
      amount: 450.00,
      recipient: 'merchant@upi',
      channel: 'UPI_ONLINE',
    }, db);

    assert.strictEqual(reg.status, 'REGISTERED');
    assert.strictEqual(reg.transaction.state, TRANSACTION_STATES.OUTCOME_UNKNOWN);
    assert.strictEqual(reg.transaction.idempotencyKey, 'IDEMP-REC-TEST-1');
  });

  it('prevents duplicate transaction registration with existing idempotency key', () => {
    const reg1 = registerRecoveryTransaction({
      idempotencyKey: 'IDEMP-REC-DUP',
      amount: 450.00,
      recipient: 'merchant@upi',
    }, db);
    assert.strictEqual(reg1.status, 'REGISTERED');

    const reg2 = registerRecoveryTransaction({
      idempotencyKey: 'IDEMP-REC-DUP',
      amount: 999.00, // Attempted second submit with different amount
      recipient: 'merchant@upi',
    }, db);

    assert.strictEqual(reg2.status, 'EXISTING');
    assert.strictEqual(reg2.duplicatePrevented, true);
    assert.strictEqual(reg2.transaction.amount, 450.00, 'Original amount must be retained');
  });

  it('reconciles confirmed payment without duplicate debit', async () => {
    registerRecoveryTransaction({
      idempotencyKey: 'IDEMP-RECON-SUCCESS',
      amount: 780.00,
      recipient: 'hospital@axis',
    }, db);

    const rec = await reconcileRecoveryTransaction({
      idempotencyKey: 'IDEMP-RECON-SUCCESS',
      simulatedOutcome: 'SUCCESS',
    }, db);

    assert.strictEqual(rec.success, true);
    assert.strictEqual(rec.reconciliationResult.resolvedState, 'CONFIRMED');
    assert.strictEqual(rec.reconciliationResult.duplicatePrevented, true);
    assert.strictEqual(rec.reconciliationResult.safeToRetry, false);
    assert.ok(rec.transaction.providerReference);
  });

  it('reconciles explicitly rejected payment and safely releases lock', async () => {
    registerRecoveryTransaction({
      idempotencyKey: 'IDEMP-RECON-FAIL',
      amount: 5000.00,
      recipient: 'electronics@hdfc',
    }, db);

    const rec = await reconcileRecoveryTransaction({
      idempotencyKey: 'IDEMP-RECON-FAIL',
      simulatedOutcome: 'REJECTED',
    }, db);

    assert.strictEqual(rec.success, true);
    assert.strictEqual(rec.reconciliationResult.resolvedState, 'FAILED');
    assert.strictEqual(rec.reconciliationResult.safeToRetry, true, 'Must allow retry on verified failure');
  });

  it('handles indeterminate / unknown provider outcome honestly without assuming success', async () => {
    registerRecoveryTransaction({
      idempotencyKey: 'IDEMP-RECON-UNKNOWN',
      amount: 350.00,
      recipient: 'cafe@kotak',
    }, db);

    // Reconcile with NO simulated outcome and NO paypal credentials:
    // System must return honest UNKNOWN and never assume SUCCESS!
    const rec = await reconcileRecoveryTransaction({
      idempotencyKey: 'IDEMP-RECON-UNKNOWN',
      provider: 'UPI_GATEWAY',
    }, db);

    assert.strictEqual(rec.success, true);
    assert.notStrictEqual(rec.reconciliationResult.resolvedState, 'CONFIRMED', 'Must never assume success!');
    assert.strictEqual(rec.reconciliationResult.safeToRetry, false, 'Must keep retry locked on unknown outcome');
  });

  it('handles repeated reconciliation idempotently without duplicate charges', async () => {
    registerRecoveryTransaction({
      idempotencyKey: 'IDEMP-RECON-REPEAT',
      amount: 250.00,
      recipient: 'kiosk@axis',
    }, db);

    const rec1 = await reconcileRecoveryTransaction({
      idempotencyKey: 'IDEMP-RECON-REPEAT',
      simulatedOutcome: 'SUCCESS',
    }, db);
    assert.strictEqual(rec1.reconciliationResult.resolvedState, 'CONFIRMED');

    // Repeated reconciliation attempt
    const rec2 = await reconcileRecoveryTransaction({
      idempotencyKey: 'IDEMP-RECON-REPEAT',
      simulatedOutcome: 'SUCCESS',
    }, db);
    assert.strictEqual(rec2.reconciliationResult.resolvedState, 'CONFIRMED');
    assert.strictEqual(rec2.transaction.state, 'CONFIRMED');
  });

  it('lists pending transactions needing reconciliation', () => {
    registerRecoveryTransaction({
      idempotencyKey: 'IDEMP-PENDING-1',
      amount: 100.00,
      recipient: 'store@upi',
      state: TRANSACTION_STATES.OUTCOME_UNKNOWN,
    }, db);

    const pending = getPendingRecoveryTransactions(db);
    assert.ok(pending.length >= 1);
    assert.ok(pending.some(p => p.idempotencyKey === 'IDEMP-PENDING-1'));
  });

  describe('DETERMINISTIC SIMULATED LEDGER OUTCOMES & IS_SIMULATION CONSISTENCY', () => {
    it('reconciles simulated transaction with confirmed debit (SUCCESS) and verifies isSimulation consistency', async () => {
      // Create simulated transaction simulating Scenario 2 (timeout ACK after debit)
      const reg = registerRecoveryTransaction({
        idempotencyKey: 'IDEMP-CRASH-02-CONFIRMED',
        amount: 1200.00,
        recipient: 'metro@axis',
        channel: 'CRASH_SIMULATION',
        isSimulation: true,
        scenarioId: 'SCENARIO_2_TIMEOUT_ACK',
        simulatedOutcome: 'SUCCESS',
      }, db);
      assert.strictEqual(reg.transaction.isSimulation, true);

      // Reconcile WITHOUT passing simulatedOutcome in request body (testing deterministic ledger lookup)
      const rec = await reconcileRecoveryTransaction({
        idempotencyKey: 'IDEMP-CRASH-02-CONFIRMED',
      }, db);

      assert.strictEqual(rec.success, true);
      assert.strictEqual(rec.reconciliationResult.resolvedState, 'CONFIRMED');
      assert.strictEqual(rec.transaction.state, 'CONFIRMED');
      assert.strictEqual(rec.reconciliationResult.safeToRetry, false);
      assert.strictEqual(rec.reconciliationResult.duplicatePrevented, true);
      // Both isSimulation flags must be consistently true
      assert.strictEqual(rec.transaction.isSimulation, true, 'transaction.isSimulation must be true');
      assert.strictEqual(rec.reconciliationResult.isSimulation, true, 'reconciliationResult.isSimulation must be true');
      assert.ok(rec.transaction.providerReference);
    });

    it('reconciles simulated transaction with confirmed no debit (FAILED), allows retry with NEW key, blocks retry with OLD key', async () => {
      // Create simulated transaction simulating Crash Lab Scenario 1 (network drop before debit)
      const reg = registerRecoveryTransaction({
        idempotencyKey: 'IDEMP-CRASH-01-NODEBIT',
        amount: 650.00,
        recipient: 'merchant@kotak',
        channel: 'CRASH_SIMULATION',
        isSimulation: true,
        scenarioId: 'SCENARIO_1_NETWORK_DROP',
        simulatedOutcome: 'NO_DEBIT',
      }, db);
      assert.strictEqual(reg.transaction.isSimulation, true);
      assert.strictEqual(reg.transaction.state, 'OUTCOME_UNKNOWN');

      // Reconcile WITHOUT passing simulatedOutcome in request body
      // System must query the simulated ledger, verify zero debit occurred, and safely mark FAILED
      const rec = await reconcileRecoveryTransaction({
        idempotencyKey: 'IDEMP-CRASH-01-NODEBIT',
      }, db);

      assert.strictEqual(rec.success, true);
      assert.strictEqual(rec.reconciliationResult.resolvedState, 'FAILED');
      assert.strictEqual(rec.transaction.state, 'FAILED');
      assert.strictEqual(rec.reconciliationResult.safeToRetry, true, 'Must allow retry since no funds were debited');
      assert.strictEqual(rec.reconciliationResult.duplicatePrevented, false);
      // Consistency check: both must be true
      assert.strictEqual(rec.transaction.isSimulation, true, 'transaction.isSimulation must be true');
      assert.strictEqual(rec.reconciliationResult.isSimulation, true, 'reconciliationResult.isSimulation must be true');

      // Verify idempotency lock was released in database
      const idempRow = db.prepare('SELECT status FROM idempotency_keys WHERE key = ?').get('IDEMP-CRASH-01-NODEBIT');
      assert.strictEqual(idempRow.status, 'RESOLVED');

      // A) Submitting a retry with the OLD key returns existing FAILED record (zero duplicate debit)
      const oldKeyRetry = registerRecoveryTransaction({
        idempotencyKey: 'IDEMP-CRASH-01-NODEBIT',
        amount: 650.00,
        recipient: 'merchant@kotak',
      }, db);
      assert.strictEqual(oldKeyRetry.status, 'EXISTING');
      assert.strictEqual(oldKeyRetry.duplicatePrevented, true);
      assert.strictEqual(oldKeyRetry.transaction.state, 'FAILED');

      // B) Initiating a retry with a NEW idempotency key succeeds cleanly
      const newKey = 'IDEMP-CRASH-01-RETRY-FRESH';
      const freshRetry = registerRecoveryTransaction({
        idempotencyKey: newKey,
        amount: 650.00,
        recipient: 'merchant@kotak',
      }, db);
      assert.strictEqual(freshRetry.status, 'REGISTERED');
      assert.strictEqual(freshRetry.duplicatePrevented, false);
      assert.strictEqual(freshRetry.transaction.idempotencyKey, newKey);
    });

    it('reconciles simulated transaction with indeterminate status and safely retains OUTCOME_UNKNOWN and lock', async () => {
      // Create simulated transaction with indeterminate / unknown simulated outcome
      const reg = registerRecoveryTransaction({
        idempotencyKey: 'IDEMP-SIM-INDETERMINATE-99',
        amount: 500.00,
        recipient: 'pharmacy@axis',
        channel: 'CRASH_SIMULATION',
        isSimulation: true,
        simulatedOutcome: 'UNKNOWN',
      }, db);
      assert.strictEqual(reg.transaction.isSimulation, true);

      // Reconcile WITHOUT passing simulatedOutcome in request body
      const rec = await reconcileRecoveryTransaction({
        idempotencyKey: 'IDEMP-SIM-INDETERMINATE-99',
      }, db);

      assert.strictEqual(rec.success, true);
      assert.strictEqual(rec.reconciliationResult.resolvedState, 'OUTCOME_UNKNOWN');
      assert.strictEqual(rec.transaction.state, 'OUTCOME_UNKNOWN');
      assert.strictEqual(rec.reconciliationResult.safeToRetry, false, 'Must keep retry locked when status is indeterminate');
      // Both isSimulation flags must be consistently true
      assert.strictEqual(rec.transaction.isSimulation, true, 'transaction.isSimulation must be true');
      assert.strictEqual(rec.reconciliationResult.isSimulation, true, 'reconciliationResult.isSimulation must be true');

      // Verify lock remains active in database
      const idempRow = db.prepare('SELECT status FROM idempotency_keys WHERE key = ?').get('IDEMP-SIM-INDETERMINATE-99');
      assert.strictEqual(idempRow.status, 'LOCKED');
    });
  });
});
