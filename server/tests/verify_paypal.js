import Database from 'better-sqlite3';
import assert from 'node:assert';
import dotenv from 'dotenv';
dotenv.config();

import { initializeDatabase } from '../database/init.js';
import {
  createPayPalOrder,
  capturePayPalOrder,
  getPayPalOrderStatus,
  isPayPalConfigured,
} from '../services/paypalClient.js';
import { getTransactionById } from '../services/transactionService.js';

const db = new Database(':memory:');
initializeDatabase(db);

console.log('--- 1. Testing PayPal Configuration Check ---');
const configured = isPayPalConfigured();
console.log('PayPal Configured:', configured);

console.log('--- 2. Testing Sandbox / Demo Order Creation ---');
const order = await createPayPalOrder({
  amount: '18.50',
  currency: 'USD',
  description: 'Verification Order',
}, db);

assert.strictEqual(order.success, true);
assert.strictEqual(typeof order.orderId, 'string');
assert.strictEqual(order.amount, 18.50);
assert.strictEqual(order.status, 'CREATED');

// Check that order is registered in local transactions table
const localTx = getTransactionById(`PP-${order.orderId}`, db);
assert.ok(localTx, 'Order must be registered in local database');
assert.strictEqual(localTx.state, 'PENDING_VERIFICATION');
assert.strictEqual(localTx.amount, 18.50);
console.log('✅ Order created and registered in database with state PENDING_VERIFICATION:', order.orderId);

console.log('--- 3. Testing Order Capture & Verification ---');
const capture = await capturePayPalOrder(order.orderId, db);
assert.strictEqual(capture.success, true);
assert.strictEqual(capture.status, 'COMPLETED');
assert.ok(capture.captureId);

// Check that transaction state transitioned to CONFIRMED
const confirmedTx = getTransactionById(`PP-${order.orderId}`, db);
assert.strictEqual(confirmedTx.state, 'CONFIRMED');
assert.strictEqual(confirmedTx.reconciliationStatus, 'RECONCILED');
console.log('✅ Order captured and confirmed in database:', capture.captureId);

console.log('--- 4. Testing Duplicate Capture Idempotency Protection ---');
const dupCapture = await capturePayPalOrder(order.orderId, db);
assert.strictEqual(dupCapture.success, true);
assert.strictEqual(dupCapture.duplicatePrevented, true);
assert.strictEqual(dupCapture.alreadyCaptured, true);
console.log('✅ Duplicate capture prevented safely.');

console.log('--- 5. Testing Rejection of Unregistered Order ID ---');
await assert.rejects(async () => {
  await capturePayPalOrder('MALICIOUS-UNREGISTERED-ORDER-999', db);
}, /not associated with a registered local transaction/i);
console.log('✅ Arbitrary unregistered capture attempt rejected.');

console.log('🎉 ALL PAYPAL INTEGRATION CHECKS PASSED PERFECTLY!');
