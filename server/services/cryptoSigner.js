import crypto from 'crypto';
import { getDatabase } from '../config/database.js';
import { createTransaction, getTransactionById } from './transactionService.js';
import { OfflinePassport, OFFLINE_PASSPORT_STATES } from '../models/OfflinePassport.js';
import { MerchantJournal } from '../models/MerchantJournal.js';
import { AuditLog } from '../models/AuditLog.js';
import { isDBConnected } from '../config/database.js';

let dynamicRandomSecret = null;

export function getMasterSecret() {
  if (process.env.OFFLINE_PASSPORT_SECRET && process.env.OFFLINE_PASSPORT_SECRET !== 'paybastion_master_auth_secret_k9x2m4p8z1') {
    return process.env.OFFLINE_PASSPORT_SECRET;
  }
  if (!dynamicRandomSecret) {
    dynamicRandomSecret = crypto.randomBytes(32).toString('hex');
  }
  return dynamicRandomSecret;
}

/**
 * Generate HMAC-SHA256 signature for offline authorization payload
 */
export function signOfflinePayload(payload) {
  const secret = getMasterSecret();
  const serialized = [
    payload.authId,
    payload.senderId,
    payload.recipientId,
    payload.amount,
    payload.currency || 'INR',
    payload.nonce,
    payload.expiresAt,
  ].join('|');

  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(serialized);
  return hmac.digest('hex');
}

/**
 * Create and sign a complete offline payment passport synchronously
 */
export function createAndSignOfflinePassport({
  amount,
  recipientId = 'namma-metro-kiosk@axis',
  recipientName = 'Transit / Kiosk',
  senderId = 'user-ananya@paybastion',
  expiryMinutes = 15,
  currency = 'INR',
  userId = null,
}, db = null) {
  const database = db || getDatabase();

  const numAmount = parseFloat(amount);
  if (isNaN(numAmount) || numAmount <= 0) {
    throw new Error('Valid positive amount is required');
  }

  // Security rule: Maximum authorization amount is ₹2,000
  if (numAmount > 2000) {
    throw new Error('Offline single-authorization ceiling is capped at ₹2,000 for safety');
  }

  // Security rule: Maximum authorization TTL is 15 minutes
  const ttl = Math.min(15, Math.max(1, parseInt(expiryMinutes, 10) || 15));

  const authId = `AUTH-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
  const nonce = crypto.randomUUID ? crypto.randomUUID() : `nonce-${Math.random().toString(36).substring(2, 12)}-${Date.now()}`;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttl * 60000).toISOString();
  const createdAt = now.toISOString();

  const rawPayload = {
    authId,
    senderId,
    recipientId,
    recipientName,
    amount: numAmount,
    currency,
    nonce,
    createdAt,
    expiresAt,
    version: 'PayBastion-v1.0-Offline',
    status: 'SETTLEMENT_PENDING',
    settlementStatus: 'SETTLEMENT_PENDING',
    isFinalSettlement: false,
  };

  const signature = signOfflinePayload(rawPayload);
  rawPayload.signature = signature;

  // Persist to SQLite
  const insertPassport = database.prepare(`
    INSERT INTO offline_passports (
      auth_id, sender_id, recipient_id, recipient_name,
      amount, currency, nonce, signature, created_at, expires_at, status
    ) VALUES (
      ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?, ?
    )
  `);

  const txId = authId;
  const insertTx = database.transaction(() => {
    insertPassport.run(
      authId,
      senderId,
      recipientId,
      recipientName,
      numAmount,
      currency,
      nonce,
      signature,
      createdAt,
      expiresAt,
      'SETTLEMENT_PENDING'
    );

    createTransaction({
      id: txId,
      idempotencyKey: `IDEMP-${authId}`,
      amount: numAmount,
      currency,
      sender: senderId,
      recipient: recipientId,
      recipientName,
      category: 'Offline Transit / Retail',
      channel: 'OFFLINE_PASSPORT',
      state: 'OFFLINE_AUTHORIZATION',
      confidenceScore: 88,
      createdAt,
      safeToRetry: false,
      settlementPending: true,
      nonce,
      signature,
      userExplanation: 'Offline cryptographically signed authorization generated. Funds held pending merchant batch sync.',
      technicalDiagnosis: `HMAC-SHA256 signature generated. Nonce ${nonce.substring(0, 10)}... protected.`,
      logs: [
        {
          timestamp: createdAt,
          event: 'OFFLINE_AUTH_CREATED',
          detail: `Authorized ${currency} ${numAmount} with ${ttl}m TTL (Nonce: ${nonce.substring(0, 8)}...).`,
        },
      ],
    }, database);
  });

  insertTx();

  // Persist to MongoDB in background
  if (isDBConnected()) {
    OfflinePassport.create({
      userId,
      passportId: authId,
      senderId,
      recipient: recipientId,
      recipientName,
      amount: numAmount,
      currency,
      nonce,
      expiresAt: new Date(expiresAt),
      signature,
      status: OFFLINE_PASSPORT_STATES.AUTHORIZED,
      settlementStatus: 'SETTLEMENT_PENDING',
      isFinalSettlement: false,
    }).catch(() => {});

    AuditLog.create({
      userId,
      action: 'OFFLINE_PASSPORT_CREATED',
      resourceId: authId,
      details: { amount: numAmount, nonce, expiresAt },
    }).catch(() => {});
  }

  return rawPayload;
}

/**
 * Verify an offline authorization QR payload with persistent nonce tracking synchronously
 */
export function verifyOfflinePassport(passportData, db = null) {
  const database = db || getDatabase();

  const {
    authId,
    senderId,
    recipientId,
    recipientName = 'Merchant Kiosk',
    amount,
    currency = 'INR',
    nonce,
    expiresAt,
    signature,
  } = passportData || {};

  const now = Date.now();

  // 1. Structure validation
  if (!authId || !senderId || !recipientId || amount === undefined || amount === null || !nonce || !expiresAt || !signature) {
    return {
      valid: false,
      code: 'MALFORMED_PAYLOAD',
      title: 'Malformed Payload',
      message: 'Missing required cryptographic fields in offline authorization payload.',
    };
  }

  const numericAmount = parseFloat(amount);
  if (isNaN(numericAmount) || numericAmount <= 0) {
    return {
      valid: false,
      code: 'INVALID_AMOUNT',
      title: 'Invalid Amount',
      message: 'Amount must be a positive finite number.',
    };
  }

  // 2. Amount Limit Check (Maximum: ₹2,000)
  if (numericAmount > 2000) {
    return {
      valid: false,
      code: 'LIMIT_EXCEEDED',
      title: 'Amount Ceiling Exceeded',
      message: `Offline authorization amount ₹${numericAmount} exceeds maximum offline ceiling of ₹2,000 for zero-connectivity safety.`,
    };
  }

  // 3. Expiry Check
  const expiryTime = new Date(expiresAt).getTime();
  if (isNaN(expiryTime)) {
    return {
      valid: false,
      code: 'INVALID_EXPIRY',
      title: 'Invalid Expiration Date',
      message: 'Expiration timestamp is malformed.',
    };
  }

  if (now > expiryTime) {
    const expiredSecondsAgo = Math.max(1, Math.round((now - expiryTime) / 1000));
    return {
      valid: false,
      code: 'AUTHORIZATION_EXPIRED',
      title: 'Authorization Expired',
      message: `Offline passport authorization expired ${expiredSecondsAgo}s ago. Expired tokens cannot be honored for delayed settlement.`,
      expiredAt: expiresAt,
      scannedAt: new Date().toISOString(),
    };
  }

  // 4. Replay Attack Prevention (Check persistent redeemed_nonces table)
  const existingNonce = database.prepare('SELECT * FROM redeemed_nonces WHERE nonce = ?').get(nonce);
  if (existingNonce) {
    return {
      valid: false,
      code: 'REPLAY_ATTACK_DETECTED',
      title: 'CRITICAL: Replay Attack Prevented',
      message: `CRITICAL SECURITY ALERT: This offline authorization token (Nonce: ${nonce.substring(0, 16)}...) was ALREADY redeemed on ${existingNonce.redeemed_at}. Replay attempts are blocked.`,
      originalSettledAt: existingNonce.redeemed_at,
      scannedAt: new Date().toISOString(),
    };
  }

  // 5. Verify HMAC-SHA256 Signature with timing-safe comparison
  const expectedSignature = signOfflinePayload({
    authId,
    senderId,
    recipientId,
    amount: numericAmount,
    currency,
    nonce,
    expiresAt,
  });

  let isValidSignature = false;
  try {
    const sigBuf = Buffer.from(signature, 'hex');
    const expectedBuf = Buffer.from(expectedSignature, 'hex');
    if (sigBuf.length === expectedBuf.length) {
      isValidSignature = crypto.timingSafeEqual(sigBuf, expectedBuf);
    }
  } catch (err) {
    isValidSignature = false;
  }

  if (!isValidSignature) {
    return {
      valid: false,
      code: 'SIGNATURE_MISMATCH',
      title: 'Signature Tampered',
      message: 'Cryptographic signature is invalid! The offline payload was tampered with or issued by an untrusted key.',
    };
  }

  // 6. Atomic Redemption & Merchant Journal Recording
  const terminalHoldId = `MERCHANT-HOLD-${Date.now().toString(36).toUpperCase()}`;
  const journalId = `JOURNAL-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
  const scannedAt = new Date().toISOString();

  const insertRedeemedNonce = database.prepare(`
    INSERT INTO redeemed_nonces (nonce, auth_id, redeemed_by, amount, currency, redeemed_at, journal_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const insertJournal = database.prepare(`
    INSERT INTO merchant_journal (
      journal_id, auth_id, terminal_hold_id, sender_id, recipient_id, recipient_name,
      amount, currency, nonce, scanned_at, settlement_status, signature
    ) VALUES (
      ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?
    )
  `);

  const insertAudit = database.prepare(`
    INSERT INTO audit_logs (entity_type, entity_id, event, detail, timestamp)
    VALUES ('OFFLINE_AUTH', ?, 'OFFLINE_NONCE_REDEEMED', ?, ?)
  `);

  const updatePassportStatus = database.prepare(`
    UPDATE offline_passports
    SET status = 'ACCEPTED_QUEUED_BATCH'
    WHERE auth_id = ?
  `);

  const redemptionTx = database.transaction(() => {
    insertRedeemedNonce.run(
      nonce,
      authId,
      recipientId,
      numericAmount,
      currency,
      scannedAt,
      journalId
    );

    insertJournal.run(
      journalId,
      authId,
      terminalHoldId,
      senderId,
      recipientId,
      recipientName,
      numericAmount,
      currency,
      nonce,
      scannedAt,
      'SETTLEMENT_PENDING',
      signature
    );

    insertAudit.run(
      authId,
      `Redeemed nonce ${nonce.substring(0, 10)}... by merchant ${recipientId}. Queued in journal ${terminalHoldId}.`,
      scannedAt
    );

    updatePassportStatus.run(authId);
  });

  redemptionTx();

  // Also persist to MongoDB in background
  if (isDBConnected()) {
    MerchantJournal.create({
      journalId,
      authId,
      terminalHoldId,
      senderId,
      recipientId,
      recipientName,
      amount: numericAmount,
      currency,
      nonce,
      scannedAt: new Date(scannedAt),
      settlementStatus: 'SETTLEMENT_PENDING',
      signature,
    }).catch(() => {});

    OfflinePassport.findOneAndUpdate(
      { passportId: authId },
      { status: OFFLINE_PASSPORT_STATES.ACCEPTED_FOR_SETTLEMENT, settlementStatus: 'SETTLEMENT_PENDING' }
    ).catch(() => {});
  }

  const journalEntry = {
    journalId,
    authId,
    terminalHoldId,
    senderId,
    recipientId,
    recipientName,
    amount: numericAmount,
    currency,
    nonce,
    scannedAt,
    settlementStatus: 'SETTLEMENT_PENDING',
    signature,
  };

  return {
    valid: true,
    code: 'OFFLINE_AUTHORIZED_PENDING_SETTLEMENT',
    title: 'Offline Authorization Accepted',
    message: 'Cryptographic signature verified. Token queued in merchant ledger for batch settlement upon reconnect.',
    isFinalSettlement: false, // Critical invariant: offline auth is never final settlement!
    settlementStatus: 'SETTLEMENT_PENDING',
    terminalHoldId,
    verifiedAt: scannedAt,
    recipient: recipientId,
    amount: numericAmount,
    currency,
    journalEntry,
  };
}

/**
 * List all offline passports
 */
export function getOfflinePassports(db = null) {
  const database = db || getDatabase();
  const rows = database.prepare('SELECT * FROM offline_passports ORDER BY created_at DESC').all();
  return rows.map(r => ({
    authId: r.auth_id,
    senderId: r.sender_id,
    recipientId: r.recipient_id,
    recipientName: r.recipient_name,
    amount: Number(r.amount),
    currency: r.currency,
    nonce: r.nonce,
    signature: r.signature,
    createdAt: r.created_at,
    expiresAt: r.expires_at,
    status: r.status,
  }));
}

/**
 * List all merchant journal entries
 */
export function getMerchantJournal(db = null) {
  const database = db || getDatabase();
  const rows = database.prepare('SELECT * FROM merchant_journal ORDER BY scanned_at DESC').all();
  return rows.map(r => ({
    journalId: r.journal_id,
    authId: r.auth_id,
    terminalHoldId: r.terminal_hold_id,
    senderId: r.sender_id,
    recipientId: r.recipient_id,
    recipientName: r.recipient_name,
    amount: Number(r.amount),
    currency: r.currency,
    nonce: r.nonce,
    scannedAt: r.scanned_at,
    settlementStatus: r.settlement_status,
    signature: r.signature,
  }));
}

/**
 * Reset replay cache (For testing)
 */
export function resetReplayCache(db = null) {
  const database = db || getDatabase();
  database.transaction(() => {
    database.prepare('DELETE FROM redeemed_nonces').run();
    database.prepare('DELETE FROM merchant_journal').run();
  })();

  if (isDBConnected()) {
    MerchantJournal.deleteMany({}).catch(() => {});
  }

  return { success: true, count: 0, message: 'Replay cache and merchant journal cleared.' };
}

export default {
  getMasterSecret,
  signOfflinePayload,
  createAndSignOfflinePassport,
  verifyOfflinePassport,
  getOfflinePassports,
  getMerchantJournal,
  resetReplayCache,
};
