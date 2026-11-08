import Database from 'better-sqlite3';
import assert from 'node:assert';
import dotenv from 'dotenv';
dotenv.config();
import { initializeDatabase } from '../database/init.js';
import {
  createAndSignOfflinePassport,
  verifyOfflinePassport,
  getMasterSecret,
} from '../services/cryptoSigner.js';

const db = new Database(':memory:');
initializeDatabase(db);

console.log('--- 1. Testing Strong Random Secret ---');
const secret = getMasterSecret();
assert.ok(secret);
assert.notStrictEqual(secret, 'paybastion_master_auth_secret_k9x2m4p8z1', 'Must not use example secret in application');
assert.ok(secret.length >= 32, 'Secret must be at least 256 bits');
console.log('✅ Strong offline secret verified:', secret.substring(0, 10) + '... (length: ' + secret.length + ')');

console.log('--- 2. Testing Valid QR Authorization ---');
const validPassport = createAndSignOfflinePassport({
  amount: 450.00,
  recipientId: 'metro-kiosk@axis',
  recipientName: 'Metro Transit Kiosk',
  senderId: 'user-ananya@paybastion',
  expiryMinutes: 15,
}, db);

const verifyValid = verifyOfflinePassport(validPassport, db);
assert.strictEqual(verifyValid.valid, true);
assert.strictEqual(verifyValid.code, 'OFFLINE_AUTHORIZED_PENDING_SETTLEMENT');
assert.strictEqual(verifyValid.isFinalSettlement, false, 'Offline token is NEVER proof of completed payment');
assert.strictEqual(verifyValid.settlementStatus, 'SETTLEMENT_PENDING');
console.log('✅ Valid QR verified with SETTLEMENT_PENDING status.');

console.log('--- 3. Testing Tampered QR Payload ---');
const freshPassport = createAndSignOfflinePassport({
  amount: 250.00,
  recipientId: 'metro-kiosk@axis',
}, db);
const tampered = { ...freshPassport, amount: 999.00 }; // Amount modified after signing
const verifyTampered = verifyOfflinePassport(tampered, db);
assert.strictEqual(verifyTampered.valid, false);
assert.strictEqual(verifyTampered.code, 'SIGNATURE_MISMATCH');
console.log('✅ Tampered payload correctly rejected with SIGNATURE_MISMATCH.');

console.log('--- 4. Testing Expired QR Authorization ---');
const expired = {
  authId: 'AUTH-EXPIRED-AUDIT',
  senderId: 'user-ananya@paybastion',
  recipientId: 'metro-kiosk@axis',
  amount: 150.00,
  currency: 'INR',
  nonce: 'nonce-exp-audit-1',
  createdAt: new Date(Date.now() - 20 * 60000).toISOString(),
  expiresAt: new Date(Date.now() - 5 * 60000).toISOString(), // Expired 5 mins ago
  signature: 'invalid_sig',
};
const verifyExpired = verifyOfflinePassport(expired, db);
assert.strictEqual(verifyExpired.valid, false);
assert.strictEqual(verifyExpired.code, 'AUTHORIZATION_EXPIRED');
console.log('✅ Expired token correctly rejected with AUTHORIZATION_EXPIRED.');

console.log('--- 5. Testing Reused Nonce (Replay Attack) ---');
// validPassport was already verified in step 2. Attempting second verification:
const verifyReplay = verifyOfflinePassport(validPassport, db);
assert.strictEqual(verifyReplay.valid, false);
assert.strictEqual(verifyReplay.code, 'REPLAY_ATTACK_DETECTED');
console.log('✅ Replay attack correctly intercepted and rejected with REPLAY_ATTACK_DETECTED.');

console.log('--- 6. Testing Concurrent Redemption Attempts ---');
// Create a new passport
const concurrentPassport = createAndSignOfflinePassport({
  amount: 200.00,
  recipientId: 'kiosk-2@axis',
}, db);

// Execute 5 simulated concurrent attempts with identical payload
const results = [];
for (let i = 0; i < 5; i++) {
  results.push(verifyOfflinePassport(concurrentPassport, db));
}

const successCount = results.filter(r => r.valid).length;
const replayBlockedCount = results.filter(r => r.code === 'REPLAY_ATTACK_DETECTED').length;

assert.strictEqual(successCount, 1, 'Exactly one concurrent attempt must succeed');
assert.strictEqual(replayBlockedCount, 4, 'Remaining concurrent attempts must be blocked as replay');
console.log('✅ Concurrent redemptions handled atomically: 1 accepted, 4 blocked.');

console.log('--- 7. Testing Amount Exceeding ₹2,000 Ceiling ---');
assert.throws(() => {
  createAndSignOfflinePassport({
    amount: 2001.00,
    recipientId: 'kiosk@axis',
  }, db);
}, /ceiling is capped at ₹2,000/i);

const overLimitPayload = {
  authId: 'AUTH-OVER-LIMIT-2',
  senderId: 'user@paybastion',
  recipientId: 'kiosk@axis',
  amount: 2500.00,
  currency: 'INR',
  nonce: 'nonce-over-limit-audit',
  expiresAt: new Date(Date.now() + 10 * 60000).toISOString(),
  signature: 'dummy',
};
const verifyOverLimit = verifyOfflinePassport(overLimitPayload, db);
assert.strictEqual(verifyOverLimit.valid, false);
assert.strictEqual(verifyOverLimit.code, 'LIMIT_EXCEEDED');
console.log('✅ Amount ceiling of ₹2,000 strictly enforced on creation and verification.');

console.log('🎉 ALL OFFLINE SECURITY TESTS PASSED PERFECTLY!');
