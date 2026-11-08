import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import Database from 'better-sqlite3';
import { initializeDatabase } from '../database/init.js';
import {
  createTransaction,
  getTransactionById,
  getTransactionByIdempotencyKey,
  retryTransaction,
  TRANSACTION_STATES
} from '../services/transactionService.js';
import {
  registerRecoveryTransaction,
  reconcileRecoveryTransaction
} from '../services/recoveryService.js';

describe('RETRY BUTTON BEHAVIOUR & DUPLICATE DEBIT DEFENSE TESTS', () => {
  let db;

  beforeEach(() => {
    db = new Database(':memory:');
    initializeDatabase(db);
  });

  // Test 1: Retry blocked for OUTCOME_UNKNOWN
  it('1. Retry is strictly BLOCKED when transaction state is OUTCOME_UNKNOWN', () => {
    const initialCount = db.prepare('SELECT COUNT(*) as count FROM transactions').get().count;

    const key = `IDEMP-UNKNOWN-${Date.now()}`;
    const tx = createTransaction({
      id: 'TXN-UNKNOWN-001',
      idempotencyKey: key,
      amount: 850.00,
      currency: 'INR',
      recipient: 'merchant-food@hdfc',
      recipientName: 'Food Court',
      channel: 'UPI_ONLINE',
      state: TRANSACTION_STATES.OUTCOME_UNKNOWN,
      safeToRetry: false,
    }, db);

    assert.strictEqual(tx.state, 'OUTCOME_UNKNOWN');
    assert.strictEqual(tx.safeToRetry, false);

    // Attempt to retry
    assert.throws(
      () => {
        retryTransaction(tx.id, {
          newIdempotencyKey: `IDEMP-RETRY-${Date.now()}`
        }, db);
      },
      (err) => {
        assert.strictEqual(err.status, 409);
        assert.strictEqual(err.code, 'RETRY_BLOCKED_OUTCOME_UNKNOWN');
        assert.strictEqual(
          err.message,
          'Payment outcome is unknown. Please use Smart Reconcile before attempting another payment.'
        );
        return true;
      }
    );

    // Verify row count remains initialCount + 1 (no extra transaction created)
    const count = db.prepare('SELECT COUNT(*) as count FROM transactions').get().count;
    assert.strictEqual(count, initialCount + 1);

    const record = getTransactionById(tx.id, db);
    assert.strictEqual(record.state, 'OUTCOME_UNKNOWN');
  });

  // Test 2: Retry blocked for PENDING_VERIFICATION
  it('2. Retry is strictly BLOCKED when transaction state is PENDING_VERIFICATION', () => {
    const initialCount = db.prepare('SELECT COUNT(*) as count FROM transactions').get().count;

    const key = `IDEMP-PENDING-${Date.now()}`;
    const tx = createTransaction({
      id: 'TXN-PENDING-002',
      idempotencyKey: key,
      amount: 450.00,
      currency: 'INR',
      recipient: 'metro-ticket@axis',
      recipientName: 'Metro Ticket Kiosk',
      channel: 'UPI_ONLINE',
      state: TRANSACTION_STATES.PENDING_VERIFICATION,
      safeToRetry: false,
    }, db);

    assert.strictEqual(tx.state, 'PENDING_VERIFICATION');

    // Attempt to retry
    assert.throws(
      () => {
        retryTransaction(tx.id, {
          newIdempotencyKey: `IDEMP-RETRY-${Date.now()}`
        }, db);
      },
      (err) => {
        assert.strictEqual(err.status, 409);
        assert.strictEqual(err.code, 'RETRY_BLOCKED_PENDING');
        assert.strictEqual(
          err.message,
          'Payment verification is pending. Please use Smart Reconcile before attempting another payment.'
        );
        return true;
      }
    );

    // Verify no new transaction was created
    const count = db.prepare('SELECT COUNT(*) as count FROM transactions').get().count;
    assert.strictEqual(count, initialCount + 1);
  });

  // Test 3: Retry blocked for CONFIRMED (Zero duplicate debits invariant)
  it('3. Retry is strictly BLOCKED for CONFIRMED transactions to prevent duplicate debits', () => {
    const initialCount = db.prepare('SELECT COUNT(*) as count FROM transactions').get().count;

    const key = `IDEMP-CONFIRMED-${Date.now()}`;
    const tx = createTransaction({
      id: 'TXN-CONFIRMED-003',
      idempotencyKey: key,
      amount: 1500.00,
      currency: 'INR',
      recipient: 'supermarket@sbi',
      recipientName: 'Supermarket',
      channel: 'UPI_ONLINE',
      state: TRANSACTION_STATES.CONFIRMED,
      safeToRetry: false,
    }, db);

    assert.throws(
      () => {
        retryTransaction(tx.id, {
          newIdempotencyKey: `IDEMP-RETRY-${Date.now()}`
        }, db);
      },
      (err) => {
        assert.strictEqual(err.status, 409);
        assert.strictEqual(err.code, 'RETRY_BLOCKED_CONFIRMED');
        return true;
      }
    );

    const count = db.prepare('SELECT COUNT(*) as count FROM transactions').get().count;
    assert.strictEqual(count, initialCount + 1);
  });

  // Test 4: Retry allowed ONLY after Smart Reconcile confirms original transaction FAILED
  it('4. Retry is permitted after Smart Reconcile confirms FAILED, using a NEW idempotency key', async () => {
    const initialCount = db.prepare('SELECT COUNT(*) as count FROM transactions').get().count;

    const originalKey = `IDEMP-CRASH-DROP-${Date.now()}`;
    const regResult = registerRecoveryTransaction({
      id: 'TXN-CRASH-004',
      idempotencyKey: originalKey,
      amount: 650.00,
      currency: 'INR',
      recipient: 'crash-merchant@test',
      recipientName: 'Crash Merchant',
      channel: 'CRASH_SIMULATION',
      isSimulation: true,
      simulatedOutcome: 'NO_DEBIT',
    }, db);

    assert.strictEqual(regResult.transaction.state, 'OUTCOME_UNKNOWN');

    // Attempting retry prior to reconciliation fails
    assert.throws(
      () => {
        retryTransaction(regResult.transaction.id, {
          newIdempotencyKey: `IDEMP-PREMATURE-${Date.now()}`
        }, db);
      },
      (err) => {
        assert.strictEqual(err.status, 409);
        assert.strictEqual(err.code, 'RETRY_BLOCKED_OUTCOME_UNKNOWN');
        return true;
      }
    );

    // Run Smart Reconcile: Queries simulated bank ledger
    const reconcileResult = await reconcileRecoveryTransaction(regResult.transaction.idempotencyKey, db);
    assert.strictEqual(reconcileResult.reconciliationResult.resolvedState, 'FAILED');
    assert.strictEqual(reconcileResult.reconciliationResult.safeToRetry, true);
    assert.strictEqual(reconcileResult.transaction.state, 'FAILED');

    // Attempting retry with the OLD idempotency key must be REJECTED
    assert.throws(
      () => {
        retryTransaction(regResult.transaction.id, {
          newIdempotencyKey: originalKey // Reusing old key
        }, db);
      },
      (err) => {
        assert.strictEqual(err.status, 400);
        assert.strictEqual(err.code, 'NEW_IDEMPOTENCY_KEY_REQUIRED');
        return true;
      }
    );

    // Attempting retry with a fresh NEW idempotency key SUCCEEDS
    const freshKey = `IDEMP-FRESH-KEY-${Date.now()}`;
    const retryResult = retryTransaction(regResult.transaction.id, {
      newIdempotencyKey: freshKey,
      amount: 650.00,
    }, db);

    assert.ok(retryResult.success);
    assert.strictEqual(retryResult.transaction.idempotencyKey, freshKey);
    assert.strictEqual(retryResult.originalTransactionId, regResult.transaction.id);
    assert.strictEqual(retryResult.transaction.state, 'PENDING_VERIFICATION');

    // Verify both records exist distinctly in database
    const totalCountAfter = db.prepare('SELECT COUNT(*) as count FROM transactions').get().count;
    assert.strictEqual(totalCountAfter, initialCount + 2);

    const origRecord = getTransactionById(regResult.transaction.id, db);
    assert.strictEqual(origRecord.state, 'FAILED');

    const freshRecord = getTransactionByIdempotencyKey(freshKey, db);
    assert.strictEqual(freshRecord.state, 'PENDING_VERIFICATION');
  });

  // Test 5: Reused new idempotency key is rejected
  it('5. Submitting an already used new idempotency key for retry is rejected', () => {
    const key1 = `IDEMP-KEY-1-${Date.now()}`;
    const key2 = `IDEMP-KEY-2-${Date.now()}`;

    // Create an existing txn with key2
    createTransaction({
      id: 'TXN-EXISTING',
      idempotencyKey: key2,
      amount: 100.00,
      recipient: 'user@bank',
      state: TRANSACTION_STATES.CONFIRMED,
    }, db);

    // Create failed txn with key1
    const failedTx = createTransaction({
      id: 'TXN-FAILED',
      idempotencyKey: key1,
      amount: 200.00,
      recipient: 'user@bank',
      state: TRANSACTION_STATES.FAILED,
      safeToRetry: true,
    }, db);

    // Attempt to retry with key2 which is already used
    assert.throws(
      () => {
        retryTransaction(failedTx.id, { newIdempotencyKey: key2 }, db);
      },
      (err) => {
        assert.strictEqual(err.status, 409);
        assert.strictEqual(err.code, 'IDEMPOTENCY_KEY_ALREADY_USED');
        return true;
      }
    );
  });
});
