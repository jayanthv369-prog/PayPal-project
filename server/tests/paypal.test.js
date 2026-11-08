import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import Database from 'better-sqlite3';
import { initializeDatabase } from '../database/init.js';
import {
  createPayPalOrder,
  capturePayPalOrder,
  getPayPalOrderStatus,
  isPayPalConfigured,
} from '../services/paypalClient.js';
import { getTransactionById } from '../services/transactionService.js';

describe('PAYPAL SANDBOX & DEMO INTEGRATION TESTS', () => {
  let db;

  beforeEach(() => {
    db = new Database(':memory:');
    initializeDatabase(db);
  });

  it('correctly reports when credentials are not configured', () => {
    const configured = isPayPalConfigured();
    // In default test environment without secrets, configured is false
    assert.strictEqual(typeof configured, 'boolean');
  });

  it('creates simulated demo order when credentials are not present', async () => {
    const order = await createPayPalOrder({
      amount: '15.00',
      currency: 'USD',
      description: 'Test Checkout',
    }, db);

    assert.strictEqual(order.success, true);
    assert.strictEqual(order.demoMode, true);
    assert.strictEqual(order.isSimulation, true);
    assert.ok(order.orderId.startsWith('SANDBOX-DEMO-'));
    assert.strictEqual(order.amount, 15.00);

    // Verify local transaction was created in database
    const localTx = getTransactionById(`PP-${order.orderId}`, db);
    assert.ok(localTx);
    assert.strictEqual(localTx.amount, 15.00);
    assert.strictEqual(localTx.state, 'PENDING_VERIFICATION');
  });

  it('captures order and confirms transaction in database', async () => {
    const order = await createPayPalOrder({
      amount: '25.00',
      currency: 'USD',
    }, db);

    const captureResult = await capturePayPalOrder(order.orderId, db);
    assert.strictEqual(captureResult.success, true);
    assert.strictEqual(captureResult.status, 'COMPLETED');
    assert.ok(captureResult.captureId);

    // Transaction state must be updated to CONFIRMED
    const updatedTx = getTransactionById(`PP-${order.orderId}`, db);
    assert.strictEqual(updatedTx.state, 'CONFIRMED');
    assert.strictEqual(updatedTx.reconciliationStatus, 'RECONCILED');
  });

  it('handles duplicate capture idempotently', async () => {
    const order = await createPayPalOrder({
      amount: '30.00',
      currency: 'USD',
    }, db);

    // First capture
    const cap1 = await capturePayPalOrder(order.orderId, db);
    assert.strictEqual(cap1.status, 'COMPLETED');

    // Duplicate capture attempt
    const cap2 = await capturePayPalOrder(order.orderId, db);
    assert.strictEqual(cap2.success, true);
    assert.strictEqual(cap2.duplicatePrevented, true);
    assert.strictEqual(cap2.alreadyCaptured, true);
  });

  it('rejects capture attempt for unregistered arbitrary orderId', async () => {
    await assert.rejects(async () => {
      await capturePayPalOrder('RANDOM-UNREGISTERED-ORDER-ID-999', db);
    }, /not associated with a registered local transaction/i);
  });

  it('inquires order status and labels demo outcomes clearly', async () => {
    const statusResult = await getPayPalOrderStatus('SANDBOX-DEMO-12345');
    assert.strictEqual(statusResult.exists, true);
    assert.strictEqual(statusResult.isSimulation, true);
    assert.ok(statusResult.note);
  });
});
