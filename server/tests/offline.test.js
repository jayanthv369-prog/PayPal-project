import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import Database from 'better-sqlite3';
import { initializeDatabase } from '../database/init.js';
import {
  signOfflinePayload,
  createAndSignOfflinePassport,
  verifyOfflinePassport,
  getOfflinePassports,
  getMerchantJournal,
} from '../services/cryptoSigner.js';

describe('OFFLINE PAYMENT PASSPORT & SECURITY TESTS', () => {
  let db;

  beforeEach(() => {
    db = new Database(':memory:');
    initializeDatabase(db);
  });

  it('generates and verifies a valid offline payment passport', () => {
    const passport = createAndSignOfflinePassport({
      amount: 350.00,
      recipientId: 'metro-kiosk@axis',
      recipientName: 'Metro Transit Kiosk',
      senderId: 'user-ananya@paybastion',
      expiryMinutes: 15,
    }, db);

    assert.ok(passport.authId);
    assert.ok(passport.signature);
    assert.strictEqual(passport.amount, 350.00);
    assert.strictEqual(passport.status, 'SETTLEMENT_PENDING');

    const verifyResult = verifyOfflinePassport(passport, db);
    assert.strictEqual(verifyResult.valid, true);
    assert.strictEqual(verifyResult.code, 'OFFLINE_AUTHORIZED_PENDING_SETTLEMENT');
    assert.strictEqual(verifyResult.isFinalSettlement, false, 'Offline auth must NEVER be marked final settlement');
    assert.strictEqual(verifyResult.settlementStatus, 'SETTLEMENT_PENDING');
  });

  it('rejects an expired passport token', () => {
    const expiredPayload = {
      authId: 'AUTH-TEST-EXPIRED-01',
      senderId: 'user-ananya@paybastion',
      recipientId: 'metro-kiosk@axis',
      amount: 200.00,
      currency: 'INR',
      nonce: 'nonce-exp-test-01',
      expiresAt: new Date(Date.now() - 5 * 60000).toISOString(), // Expired 5 mins ago
      signature: 'dummy-signature',
    };

    const res = verifyOfflinePassport(expiredPayload, db);
    assert.strictEqual(res.valid, false);
    assert.strictEqual(res.code, 'AUTHORIZATION_EXPIRED');
  });

  it('rejects a modified / tampered payload', () => {
    const passport = createAndSignOfflinePassport({
      amount: 250.00,
      recipientId: 'transit-kiosk@axis',
    }, db);

    // Tamper with amount
    const tamperedPayload = { ...passport, amount: 999.00 };

    const res = verifyOfflinePassport(tamperedPayload, db);
    assert.strictEqual(res.valid, false);
    assert.strictEqual(res.code, 'SIGNATURE_MISMATCH');
  });

  it('rejects invalid or forged cryptographic signatures', () => {
    const passport = createAndSignOfflinePassport({
      amount: 150.00,
      recipientId: 'metro-kiosk@axis',
    }, db);

    const forgedPayload = {
      ...passport,
      signature: '0000111122223333444455556666777788889999aaaabbbbccccddddeeeeffff',
    };

    const res = verifyOfflinePassport(forgedPayload, db);
    assert.strictEqual(res.valid, false);
    assert.strictEqual(res.code, 'SIGNATURE_MISMATCH');
  });

  it('rejects authorization amounts exceeding ₹2,000 ceiling', () => {
    assert.throws(() => {
      createAndSignOfflinePassport({
        amount: 2500.00, // Exceeds 2000
        recipientId: 'store@axis',
      }, db);
    }, /ceiling is capped at ₹2,000/i);

    // Test direct verification rejection of > 2000 payload
    const overLimit = {
      authId: 'AUTH-OVER-LIMIT',
      senderId: 'user@paybastion',
      recipientId: 'store@axis',
      amount: 2001.00,
      currency: 'INR',
      nonce: 'nonce-over-limit-1',
      expiresAt: new Date(Date.now() + 10 * 60000).toISOString(),
      signature: 'abcdef',
    };
    const res = verifyOfflinePassport(overLimit, db);
    assert.strictEqual(res.valid, false);
    assert.strictEqual(res.code, 'LIMIT_EXCEEDED');
  });

  it('detects and blocks replay attack when nonce is submitted twice', () => {
    const passport = createAndSignOfflinePassport({
      amount: 450.00,
      recipientId: 'kiosk@axis',
    }, db);

    // First scan: should succeed
    const firstScan = verifyOfflinePassport(passport, db);
    assert.strictEqual(firstScan.valid, true);

    // Second scan (replay attack): must be detected and rejected
    const secondScan = verifyOfflinePassport(passport, db);
    assert.strictEqual(secondScan.valid, false);
    assert.strictEqual(secondScan.code, 'REPLAY_ATTACK_DETECTED');
    assert.ok(secondScan.message.includes('ALREADY redeemed'));
  });

  it('persists merchant journal entries on successful verification', () => {
    const passport = createAndSignOfflinePassport({
      amount: 300.00,
      recipientId: 'metro-vendor@axis',
    }, db);

    verifyOfflinePassport(passport, db);

    const journal = getMerchantJournal(db);
    assert.ok(journal.length >= 1);
    const entry = journal.find(j => j.authId === passport.authId);
    assert.ok(entry);
    assert.strictEqual(entry.settlementStatus, 'SETTLEMENT_PENDING');
  });
});
