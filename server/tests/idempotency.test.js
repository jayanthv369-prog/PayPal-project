import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import Database from 'better-sqlite3';
import { initializeDatabase } from '../database/init.js';
import {
  createTransaction,
  getTransactionById,
  getTransactionByIdempotencyKey,
  TRANSACTION_STATES
} from '../services/transactionService.js';
import {
  registerRecoveryTransaction,
  reconcileRecoveryTransaction
} from '../services/recoveryService.js';

describe('IDEMPOTENCY & CONCURRENCY RESILIENCE TESTS', () => {
  let db;

  beforeEach(() => {
    db = new Database(':memory:');
    initializeDatabase(db);
  });

  // Requirement 9.1: First transaction creation
  it('1. First transaction creation succeeds and persists in database', () => {
    const key = `IDEMP-FIRST-${Date.now()}`;
    const tx = createTransaction({
      id: 'TXN-001',
      idempotencyKey: key,
      amount: 499.50,
      currency: 'INR',
      recipient: 'grocery-store@okaxis',
      recipientName: 'City Grocery Store',
      channel: 'UPI_ONLINE',
      state: TRANSACTION_STATES.PENDING_VERIFICATION,
    }, db);

    assert.ok(tx);
    assert.strictEqual(tx.id, 'TXN-001');
    assert.strictEqual(tx.idempotencyKey, key);
    assert.strictEqual(tx.amount, 499.50);
    assert.strictEqual(tx.currency, 'INR');
    assert.strictEqual(tx.recipient, 'grocery-store@okaxis');
    assert.strictEqual(tx.state, 'PENDING_VERIFICATION');

    // Verify row in database
    const dbRecord = getTransactionById('TXN-001', db);
    assert.ok(dbRecord);
    assert.strictEqual(dbRecord.idempotencyKey, key);
    assert.strictEqual(dbRecord.amount, 499.50);
  });

  // Requirement 9.2: Repeated request with the same idempotency key
  it('2. Repeated request with the same idempotency key returns existing transaction without duplicate insertion', () => {
    const key = 'IDEMP-RETRY-TEST-002';

    // First attempt
    const firstTx = createTransaction({
      id: 'TXN-ORIGINAL',
      idempotencyKey: key,
      amount: 1250.00,
      recipient: 'merchant-alpha@icici',
      recipientName: 'Merchant Alpha',
      channel: 'UPI_ONLINE',
      state: TRANSACTION_STATES.CONFIRMED,
      providerReference: 'UTR-ORIGINAL-9821',
    }, db);

    assert.strictEqual(firstTx.id, 'TXN-ORIGINAL');
    assert.strictEqual(firstTx.amount, 1250.00);
    assert.strictEqual(firstTx.state, 'CONFIRMED');

    // Repeated attempt (simulating client retry after network hesitation)
    const secondTx = createTransaction({
      id: 'TXN-DUPLICATE-ATTEMPT',
      idempotencyKey: key,
      amount: 9999.00, // Different amount attempted
      recipient: 'attacker@evil',
      recipientName: 'Malicious Overwrite',
      channel: 'UPI_ONLINE',
      state: TRANSACTION_STATES.FAILED,
    }, db);

    // Invariant checks
    assert.ok(secondTx, 'Must return transaction successfully');
    assert.strictEqual(secondTx._isExisting, true, 'Must indicate this was an existing record');
    assert.strictEqual(secondTx.id, 'TXN-ORIGINAL', 'Must return original transaction ID');
    assert.strictEqual(secondTx.amount, 1250.00, 'Original amount must be preserved (ZERO duplicate debit)');
    assert.strictEqual(secondTx.recipient, 'merchant-alpha@icici', 'Original recipient must be preserved');
    assert.strictEqual(secondTx.state, 'CONFIRMED', 'Original state must remain CONFIRMED');
    assert.strictEqual(secondTx.providerReference, 'UTR-ORIGINAL-9821');

    // Database verification: Exactly 1 record exists
    const allRecords = db.prepare('SELECT * FROM transactions WHERE idempotency_key = ?').all(key);
    assert.strictEqual(allRecords.length, 1, 'Only one transaction may exist per idempotency key');
  });

  // Requirement 9.3: Concurrent requests with the same key
  it('3. Concurrent requests with the same key resolve safely without unique constraint errors', async () => {
    const key = 'IDEMP-CONCURRENT-BURST';
    const numConcurrent = 10;

    // Dispatch 10 concurrent requests simultaneously with the same idempotency key
    const promises = Array.from({ length: numConcurrent }, (_, i) => {
      return new Promise((resolve) => {
        // Stagger slightly or execute simultaneously
        const tx = createTransaction({
          id: `TXN-CONC-${i}`,
          idempotencyKey: key,
          amount: 750.00,
          recipient: 'cloud-server@paybastion',
          recipientName: 'Cloud Infrastructure',
          channel: 'UPI_ONLINE',
          state: TRANSACTION_STATES.OUTCOME_UNKNOWN,
        }, db);
        resolve(tx);
      });
    });

    const results = await Promise.all(promises);

    // All 10 concurrent requests must succeed (no uncaught SqliteError)
    assert.strictEqual(results.length, numConcurrent);

    // Every single concurrent result must reference the SAME transaction ID and amount
    const primaryId = results[0].id;
    for (const res of results) {
      assert.ok(res, 'Every concurrent caller receives a valid transaction');
      assert.strictEqual(res.id, primaryId, 'Every concurrent caller receives identical transaction ID');
      assert.strictEqual(res.amount, 750.00, 'Amount must be consistent');
    }

    // Database integrity: Exactly 1 row in transactions and 1 row in idempotency_keys
    const txRows = db.prepare('SELECT * FROM transactions WHERE idempotency_key = ?').all(key);
    assert.strictEqual(txRows.length, 1, 'Database must contain exactly 1 transaction for this key');

    const idempRows = db.prepare('SELECT * FROM idempotency_keys WHERE key = ?').all(key);
    assert.strictEqual(idempRows.length, 1, 'Database must contain exactly 1 idempotency key record');
  });

  // Requirement 9.4: New transaction with a different key
  it('4. New transaction with a different key creates a separate transaction successfully', () => {
    const key1 = 'IDEMP-TX-ALPHA';
    const key2 = 'IDEMP-TX-BETA';

    const tx1 = createTransaction({
      id: 'TXN-ALPHA',
      idempotencyKey: key1,
      amount: 100.00,
      recipient: 'alice@bank',
      channel: 'UPI_ONLINE',
      state: TRANSACTION_STATES.CONFIRMED,
    }, db);

    const tx2 = createTransaction({
      id: 'TXN-BETA',
      idempotencyKey: key2,
      amount: 200.00,
      recipient: 'bob@bank',
      channel: 'UPI_ONLINE',
      state: TRANSACTION_STATES.CONFIRMED,
    }, db);

    assert.notStrictEqual(tx1.id, tx2.id);
    assert.notStrictEqual(tx1.idempotencyKey, tx2.idempotencyKey);
    assert.strictEqual(tx1.amount, 100.00);
    assert.strictEqual(tx2.amount, 200.00);

    const totalCount = db.prepare('SELECT COUNT(*) as count FROM transactions').get().count;
    assert.ok(totalCount >= 2);
  });

  // Requirement 9.5: Smart reconciliation after an unknown payment outcome
  it('5. Smart reconciliation after an unknown payment outcome verifies with provider and prevents duplicate debit', async () => {
    const key = 'IDEMP-RECON-WORKFLOW';

    // Step A: Register in-flight transaction with OUTCOME_UNKNOWN
    const reg = registerRecoveryTransaction({
      idempotencyKey: key,
      amount: 1500.00,
      recipient: 'metro-supermarket@icici',
      recipientName: 'Metro Supermarket',
      channel: 'UPI_ONLINE',
      state: TRANSACTION_STATES.OUTCOME_UNKNOWN,
    }, db);

    assert.strictEqual(reg.status, 'REGISTERED');
    assert.strictEqual(reg.transaction.state, 'OUTCOME_UNKNOWN');
    assert.strictEqual(reg.transaction.safeToRetry, false, 'Uncertain transaction must NEVER be marked safe to retry');

    // Step B: Re-submission attempt with same key while in OUTCOME_UNKNOWN is blocked
    const duplicateReg = registerRecoveryTransaction({
      idempotencyKey: key,
      amount: 1500.00,
      recipient: 'metro-supermarket@icici',
    }, db);
    assert.strictEqual(duplicateReg.status, 'EXISTING');
    assert.strictEqual(duplicateReg.duplicatePrevented, true);

    // Step C: Run Smart Reconciliation with provider SUCCESS inquiry
    const rec = await reconcileRecoveryTransaction({
      idempotencyKey: key,
      simulatedOutcome: 'SUCCESS',
    }, db);

    assert.strictEqual(rec.success, true);
    assert.strictEqual(rec.reconciliationResult.resolvedState, 'CONFIRMED');
    assert.strictEqual(rec.reconciliationResult.duplicatePrevented, true);
    assert.strictEqual(rec.reconciliationResult.safeToRetry, false, 'Confirmed transaction must NOT be retried');
    assert.ok(rec.transaction.providerReference, 'Must assign provider reference');

    // Step D: Re-query transaction to verify persistent database state
    const settledTx = getTransactionByIdempotencyKey(key, db);
    assert.strictEqual(settledTx.state, 'CONFIRMED');
    assert.strictEqual(settledTx.amount, 1500.00);

    // Step E: Subsequent payment retry attempt with same key returns existing CONFIRMED transaction
    const retryAttempt = createTransaction({
      idempotencyKey: key,
      amount: 1500.00,
      recipient: 'metro-supermarket@icici',
    }, db);
    assert.strictEqual(retryAttempt.id, settledTx.id);
    assert.strictEqual(retryAttempt.state, 'CONFIRMED');
    assert.strictEqual(retryAttempt._isExisting, true);

    // Step F: Test explicitly rejected payment outcome
    const failKey = 'IDEMP-RECON-FAIL-WORKFLOW';
    registerRecoveryTransaction({
      idempotencyKey: failKey,
      amount: 800.00,
      recipient: 'kiosk@kotak',
      state: TRANSACTION_STATES.OUTCOME_UNKNOWN,
    }, db);

    const recFail = await reconcileRecoveryTransaction({
      idempotencyKey: failKey,
      simulatedOutcome: 'FAILED',
    }, db);

    assert.strictEqual(recFail.reconciliationResult.resolvedState, 'FAILED');
    assert.strictEqual(recFail.reconciliationResult.safeToRetry, true, 'Explicitly declined payment may be retried');
  });
});
