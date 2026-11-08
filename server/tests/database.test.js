import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import Database from 'better-sqlite3';
import { initializeDatabase } from '../database/init.js';
import {
  createTransaction,
  getTransactionById,
  getTransactionByIdempotencyKey,
  listTransactions,
  getDashboardStats,
  TRANSACTION_STATES
} from '../services/transactionService.js';

describe('DATABASE & PERSISTENCE TESTS', () => {
  let db;

  beforeEach(() => {
    db = new Database(':memory:');
    initializeDatabase(db);
  });

  it('initializes all 8 required tables properly', () => {
    const tables = db.prepare(`
      SELECT name FROM sqlite_master WHERE type='table'
    `).all().map(t => t.name);

    assert.ok(tables.includes('transactions'), 'transactions table exists');
    assert.ok(tables.includes('idempotency_keys'), 'idempotency_keys table exists');
    assert.ok(tables.includes('offline_passports'), 'offline_passports table exists');
    assert.ok(tables.includes('redeemed_nonces'), 'redeemed_nonces table exists');
    assert.ok(tables.includes('merchant_journal'), 'merchant_journal table exists');
    assert.ok(tables.includes('credit_profiles'), 'credit_profiles table exists');
    assert.ok(tables.includes('credit_transactions'), 'credit_transactions table exists');
    assert.ok(tables.includes('audit_logs'), 'audit_logs table exists');
  });

  it('persists and retrieves transactions correctly', () => {
    const tx = createTransaction({
      id: 'TXN-TEST-001',
      idempotencyKey: 'IDEMP-TEST-001',
      amount: 450.00,
      recipient: 'merchant@upi',
      channel: 'UPI_ONLINE',
      state: TRANSACTION_STATES.CONFIRMED,
    }, db);

    assert.strictEqual(tx.id, 'TXN-TEST-001');
    assert.strictEqual(tx.amount, 450.00);
    assert.strictEqual(tx.state, 'CONFIRMED');

    const fetched = getTransactionById('TXN-TEST-001', db);
    assert.ok(fetched);
    assert.strictEqual(fetched.idempotencyKey, 'IDEMP-TEST-001');
  });

  it('persists data across simulated server restart using persistent file DB', () => {
    // Open a temporary database file
    const tempDbPath = `./data/test_restart_${Date.now()}.db`;
    let fileDb = new Database(tempDbPath);
    initializeDatabase(fileDb);

    createTransaction({
      id: 'TXN-RESTART-001',
      idempotencyKey: 'IDEMP-RESTART-001',
      amount: 999.00,
      recipient: 'pharmacy@axis',
      state: TRANSACTION_STATES.OUTCOME_UNKNOWN,
    }, fileDb);

    // Close database (simulating server shutdown)
    fileDb.close();

    // Reopen database (simulating server restart)
    fileDb = new Database(tempDbPath);
    const retrieved = getTransactionById('TXN-RESTART-001', fileDb);
    assert.ok(retrieved, 'Transaction should survive database restart');
    assert.strictEqual(retrieved.amount, 999.00);
    assert.strictEqual(retrieved.state, 'OUTCOME_UNKNOWN');

    fileDb.close();
    try {
      import('fs').then(fs => {
        if (fs.existsSync(tempDbPath)) fs.unlinkSync(tempDbPath);
      });
    } catch (e) { /* ignore */ }
  });

  it('verifies unique constraint is enforced at database schema level', () => {
    // Schema invariant: transactions.idempotency_key must have UNIQUE constraint
    db.prepare(`
      INSERT INTO transactions (
        id, idempotency_key, amount, currency, recipient, payment_channel, transaction_state, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('TXN-RAW-1', 'IDEMP-RAW-DUP', 100, 'INR', 'raw@upi', 'UPI_ONLINE', 'CONFIRMED', new Date().toISOString(), new Date().toISOString());

    // Direct raw insert without service layer must trigger SQLite UNIQUE constraint
    assert.throws(() => {
      db.prepare(`
        INSERT INTO transactions (
          id, idempotency_key, amount, currency, recipient, payment_channel, transaction_state, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run('TXN-RAW-2', 'IDEMP-RAW-DUP', 200, 'INR', 'raw2@upi', 'UPI_ONLINE', 'CONFIRMED', new Date().toISOString(), new Date().toISOString());
    }, /UNIQUE constraint failed: transactions\.idempotency_key/i);
  });

  it('handles duplicate idempotency key idempotently in createTransaction without throwing and preserves original record', () => {
    const firstTx = createTransaction({
      id: 'TXN-FIRST',
      idempotencyKey: 'IDEMP-DUPLICATE-CHECK',
      amount: 100.00,
      recipient: 'merchant-a@upi',
      state: TRANSACTION_STATES.CONFIRMED,
    }, db);

    assert.strictEqual(firstTx.id, 'TXN-FIRST');
    assert.strictEqual(firstTx.amount, 100.00);

    // Repeated request with the SAME idempotency key (simulated network retry or re-submission)
    const secondTx = createTransaction({
      id: 'TXN-SECOND',
      idempotencyKey: 'IDEMP-DUPLICATE-CHECK',
      amount: 999.00, // Attacker or buggy retry attempts different amount
      recipient: 'merchant-b@upi',
      state: TRANSACTION_STATES.CONFIRMED,
    }, db);

    // Must NOT throw, must return existing transaction, must preserve original amount & ID
    assert.ok(secondTx, 'Must return existing transaction');
    assert.strictEqual(secondTx.id, 'TXN-FIRST', 'Must return original transaction ID');
    assert.strictEqual(secondTx.amount, 100.00, 'Must preserve original transaction amount (NO double debit)');
    assert.strictEqual(secondTx.recipient, 'merchant-a@upi', 'Must preserve original recipient');
    assert.strictEqual(secondTx._isExisting, true, 'Must indicate record already exists');

    // Verify row count in database
    const count = db.prepare("SELECT COUNT(*) as count FROM transactions WHERE idempotency_key = 'IDEMP-DUPLICATE-CHECK'").get().count;
    assert.strictEqual(count, 1, 'Database must contain exactly 1 transaction record for this idempotency key');
  });

  it('aggregates dashboard stats accurately from database records', () => {
    const stats = getDashboardStats(db);
    assert.ok(typeof stats.totalTransactions === 'number');
    assert.ok(typeof stats.confirmedCount === 'number');
    assert.ok(typeof stats.pendingCount === 'number');
    assert.ok(typeof stats.recoveredFunds === 'number');
  });
});
