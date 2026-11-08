import Database from 'better-sqlite3';
import assert from 'node:assert';
import { initializeDatabase } from '../database/init.js';
import {
  registerRecoveryTransaction,
  reconcileRecoveryTransaction,
} from '../services/recoveryService.js';
import { getTransactionByIdempotencyKey } from '../services/transactionService.js';

const db = new Database(':memory:');
initializeDatabase(db);

console.log('--- 1. Testing Duplicate Transaction Registration ---');
const reg1 = registerRecoveryTransaction({
  idempotencyKey: 'IDEMP-AUDIT-DUP',
  amount: 450.00,
  recipient: 'groceries@icici',
  channel: 'UPI_ONLINE',
}, db);
assert.strictEqual(reg1.status, 'REGISTERED');

const reg2 = registerRecoveryTransaction({
  idempotencyKey: 'IDEMP-AUDIT-DUP',
  amount: 999.00, // Attacker attempts second registration
  recipient: 'groceries@icici',
}, db);
assert.strictEqual(reg2.status, 'EXISTING');
assert.strictEqual(reg2.duplicatePrevented, true);
assert.strictEqual(reg2.transaction.amount, 450.00, 'Original amount must be strictly preserved');
console.log('✅ Duplicate registration prevented successfully.');

console.log('--- 2. Testing Successful Provider Confirmation ---');
registerRecoveryTransaction({
  idempotencyKey: 'IDEMP-AUDIT-SUCCESS',
  amount: 1200.00,
  recipient: 'supermarket@icici',
}, db);

const reconSuccess = await reconcileRecoveryTransaction({
  idempotencyKey: 'IDEMP-AUDIT-SUCCESS',
  simulatedOutcome: 'SUCCESS',
}, db);
assert.strictEqual(reconSuccess.reconciliationResult.resolvedState, 'CONFIRMED');
assert.strictEqual(reconSuccess.reconciliationResult.safeToRetry, false);
assert.strictEqual(reconSuccess.reconciliationResult.duplicatePrevented, true);
assert.ok(reconSuccess.transaction.providerReference);
console.log('✅ Provider confirmation verified: State=CONFIRMED, safeToRetry=false.');

console.log('--- 3. Testing Failed Provider Response ---');
registerRecoveryTransaction({
  idempotencyKey: 'IDEMP-AUDIT-FAIL',
  amount: 3000.00,
  recipient: 'electronics@hdfc',
}, db);

const reconFail = await reconcileRecoveryTransaction({
  idempotencyKey: 'IDEMP-AUDIT-FAIL',
  simulatedOutcome: 'FAILED',
}, db);
assert.strictEqual(reconFail.reconciliationResult.resolvedState, 'FAILED');
assert.strictEqual(reconFail.reconciliationResult.safeToRetry, true);
console.log('✅ Failed provider response verified: State=FAILED, safeToRetry=true.');

console.log('--- 4. Testing Unknown Payment Outcome & Invariant Check ---');
registerRecoveryTransaction({
  idempotencyKey: 'IDEMP-AUDIT-UNKNOWN',
  amount: 850.00,
  recipient: 'quickmart@sbi',
}, db);

// Non-simulated inquiry where upstream switch cannot provide ACK:
const reconUnknown = await reconcileRecoveryTransaction({
  idempotencyKey: 'IDEMP-AUDIT-UNKNOWN',
  provider: 'UPI_GATEWAY',
}, db);
assert.strictEqual(reconUnknown.reconciliationResult.resolvedState, 'OUTCOME_UNKNOWN');
assert.strictEqual(reconUnknown.reconciliationResult.safeToRetry, false, 'INVARIANT: Uncertain payment must NEVER allow retry!');
assert.strictEqual(reconUnknown.reconciliationResult.duplicatePrevented, false);
console.log('✅ Unknown outcome verified: State=OUTCOME_UNKNOWN, safeToRetry=false (Retry locked).');

console.log('--- 5. Testing Repeated Reconciliation ---');
const reconRepeat = await reconcileRecoveryTransaction({
  idempotencyKey: 'IDEMP-AUDIT-SUCCESS',
  simulatedOutcome: 'SUCCESS',
}, db);
assert.strictEqual(reconRepeat.reconciliationResult.resolvedState, 'CONFIRMED');
assert.strictEqual(reconRepeat.transaction.state, 'CONFIRMED');
console.log('✅ Repeated reconciliation verified: zero duplicate debit.');

console.log('🎉 ALL SMART RECOVERY CHECKS PASSED PERFECTLY!');
