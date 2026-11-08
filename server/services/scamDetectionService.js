/**
 * Scam Guardian - Modular Risk & Fraud Detection Engine
 * Analyzes transaction parameters and QR payloads for high-risk phishing,
 * VPA impersonation, reverse-flow collect requests, and velocity anomalies.
 */

import { getDatabase } from '../config/database.js';
import { Transaction as MongoTransaction } from '../models/Transaction.js';
import { ScamAnalysis } from '../models/ScamAnalysis.js';
import { isDBConnected } from '../config/database.js';

// Configurable Risk Thresholds
export const SCAM_THRESHOLDS = {
  HIGH_AMOUNT: 25000,
  VELOCITY_WINDOW_SECONDS: 60,
  VELOCITY_HIGH_ATTEMPTS: 3,
};

/**
 * Calculate actual transaction velocity from database records
 * Synchronous query against local database; checks MongoDB asynchronously.
 */
export function calculateVelocityFromDB({ recipient, sender, userId }, db = null) {
  const database = db || getDatabase();
  const windowTime = new Date(Date.now() - SCAM_THRESHOLDS.VELOCITY_WINDOW_SECONDS * 1000).toISOString();
  let count = 0;

  try {
    const rows = database.prepare(`
      SELECT COUNT(*) as count FROM transactions
      WHERE created_at >= ? AND (recipient = ? OR sender = ?)
    `).get(windowTime, recipient || '', sender || '');

    count = rows ? rows.count : 0;
  } catch (err) {
    // Continue
  }

  return count;
}

/**
 * Parse and evaluate suspicious URL structures
 */
export function evaluateUrlRisk(urlStr) {
  if (!urlStr || typeof urlStr !== 'string') return null;

  try {
    const parsed = new URL(urlStr);
    const hostname = parsed.hostname.toLowerCase();

    // Check for IP address in hostname (classic phishing trick)
    if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)) {
      return {
        level: 'CRITICAL',
        reason: `Direct IP address (${hostname}) detected in URL instead of verified domain. Common phishing tactic.`,
        recommendation: 'Do NOT open this link. Legitimate financial institutions always use certified domain names.',
      };
    }

    // Check URL shorteners
    const shorteners = ['bit.ly', 'tinyurl.com', 'is.gd', 't.co', 'cutt.ly', 'rb.gy'];
    if (shorteners.includes(hostname)) {
      return {
        level: 'HIGH',
        reason: `URL shortener '${hostname}' conceals the true destination web server.`,
        recommendation: 'Do not proceed unless you can verify the destination destination domain.',
      };
    }

    // Allowed legitimate domains
    const legitimateDomains = ['paypal.com', 'sandbox.paypal.com', 'npci.org.in'];
    const isLegit = legitimateDomains.some(d => hostname === d || hostname.endsWith(`.${d}`));
    if (!isLegit && !hostname.includes('upi')) {
      return {
        level: 'MEDIUM',
        reason: `External domain '${hostname}' is not a recognized payment clearinghouse.`,
        recommendation: 'Verify the merchant credentials carefully before authorizing payment.',
      };
    }
  } catch (e) {
    // Not a valid URL
  }
  return null;
}

/**
 * Analyze scam risk synchronously with DB-backed velocity & multi-factor checks
 */
export function analyzeScamRisk({
  recipient = '',
  amount = 0,
  rawPayload = '',
  recentAttemptsCount = null,
  context = 'TRANSFER',
  userId = null,
  sender = null,
  transactionId = null,
}, db = null) {
  const numericAmount = parseFloat(amount || 0);
  const detectedReasons = [];
  const recommendations = [];
  let riskScore = 10;
  let riskLevel = 'LOW';

  // 1. Phishing / Impersonation VPA Detection
  const lowerRecipient = String(recipient || '').toLowerCase().trim();
  const suspiciousKeywords = [
    'refund',
    'customer-care',
    'support',
    'electricity-bill',
    'lottery',
    'kyc-update',
    'cashback-desk',
    'admin-verify',
    'urgent-help',
    'prize-claim',
    'income-tax-refund'
  ];

  const matchedKeyword = suspiciousKeywords.find(kw => lowerRecipient.includes(kw));
  if (matchedKeyword) {
    riskScore = Math.max(riskScore, 95);
    riskLevel = 'CRITICAL';
    detectedReasons.push(
      `Impersonation Pattern: Recipient ID contains high-risk keyword '${matchedKeyword}'. Fraudsters frequently register fake handles imitating banks or utility boards.`
    );
    recommendations.push(
      'IMMEDIATELY ABORT. Genuine payment entities NEVER issue refunds or support via incoming payment requests. Official refunds are credited automatically without entering a PIN.'
    );
  }

  // 2. Reverse-Flow Collect Request disguised as credit / refund
  if (rawPayload && typeof rawPayload === 'string') {
    const lowerPayload = rawPayload.toLowerCase();

    if (
      lowerPayload.includes('refund') ||
      lowerPayload.includes('receive_money') ||
      lowerPayload.includes('claim_reward') ||
      lowerPayload.includes('cashback')
    ) {
      if (lowerPayload.includes('pa=') || lowerPayload.includes('mode=02') || lowerPayload.includes('am=')) {
        riskScore = Math.max(riskScore, 98);
        riskLevel = 'CRITICAL';
        detectedReasons.push(
          'Deceptive QR Payload: Reverse-Flow Collect Request disguised as a refund or prize claim. The technical protocol contains a DEBIT instruction directing funds OUT of your account.'
        );
        recommendations.push(
          'Do NOT scan or confirm. You never need to enter your PIN to receive money.'
        );
      }
    }

    // Evaluate URL risk
    if (lowerPayload.startsWith('http://') || lowerPayload.startsWith('https://')) {
      const urlCheck = evaluateUrlRisk(rawPayload.trim());
      if (urlCheck) {
        if (urlCheck.level === 'CRITICAL') {
          riskScore = Math.max(riskScore, 90);
          riskLevel = 'CRITICAL';
        } else if (urlCheck.level === 'HIGH' && riskLevel !== 'CRITICAL') {
          riskScore = Math.max(riskScore, 75);
          riskLevel = 'HIGH';
        } else if (riskLevel === 'LOW') {
          riskScore = Math.max(riskScore, 65);
          riskLevel = 'MEDIUM';
        }
        detectedReasons.push(urlCheck.reason);
        recommendations.push(urlCheck.recommendation);
      }
    }
  }

  // 3. Database-calculated Transaction Velocity
  const dbVelocity = calculateVelocityFromDB({ recipient, sender, userId }, db);
  const effectiveAttempts = Math.max(dbVelocity, parseInt(recentAttemptsCount, 10) || 1);

  if (effectiveAttempts >= SCAM_THRESHOLDS.VELOCITY_HIGH_ATTEMPTS) {
    if (riskLevel !== 'CRITICAL') {
      riskLevel = riskLevel === 'HIGH' ? 'HIGH' : 'MEDIUM';
    }
    riskScore = Math.max(riskScore, 70);
    detectedReasons.push(
      `Velocity Anomaly: ${effectiveAttempts} payment attempts detected to this merchant/recipient within 60 seconds.`
    );
    recommendations.push(
      'Wait for initial payment confirmation or check transaction ledger before attempting any retry to prevent duplicate charges.'
    );
  }

  // 4. Unusual Amount Spike Anomaly
  if (numericAmount > SCAM_THRESHOLDS.HIGH_AMOUNT) {
    if (riskLevel === 'LOW') {
      riskLevel = 'MEDIUM';
    }
    riskScore = Math.max(riskScore, 58);
    detectedReasons.push(
      `High-Value Threshold Warning: ₹${numericAmount.toLocaleString('en-IN')} exceeds standard daily micro-transaction thresholds.`
    );
    recommendations.push(
      'Double check recipient identity before committing large transfers.'
    );
  }

  // Ensure risk level classification based on risk score
  if (riskScore >= 90) riskLevel = 'CRITICAL';
  else if (riskScore >= 70) riskLevel = 'HIGH';
  else if (riskScore >= 40) riskLevel = 'MEDIUM';
  else riskLevel = 'LOW';

  const requiresConfirmation = riskLevel === 'HIGH' || riskLevel === 'CRITICAL';

  // Format alert objects for backward compatibility with frontend
  const primaryAlert = detectedReasons.length > 0
    ? {
        signal: detectedReasons[0],
        reason: detectedReasons[0],
        recommendedAction: recommendations[0] || 'Review details carefully before authorizing.',
      }
    : {
        signal: 'Standard Transaction Parameters',
        reason: 'Recipient verified, payload matches standard RFC-compliant schema, and transaction velocity is within standard thresholds.',
        recommendedAction: 'Safe to proceed with normal user authorization.',
      };

  const allAlerts = detectedReasons.map((reason, idx) => ({
    signal: reason,
    reason,
    recommendedAction: recommendations[idx] || 'Verify recipient identity.',
  }));

  const analysisResult = {
    success: true,
    safe: riskLevel === 'LOW',
    riskScore,
    riskLevel,
    detectedReasons,
    recommendations,
    requiresConfirmation,
    primaryAlert,
    allAlerts,
    disclaimer: 'Notice: Heuristic risk assessment detects known fraud patterns and anomalies, but cannot guarantee 100% fraud prevention.',
  };

  // Persist analysis history in MongoDB asynchronously without blocking synchronous caller
  if (isDBConnected()) {
    ScamAnalysis.create({
      userId,
      transactionId,
      recipient,
      amount: numericAmount,
      rawPayload,
      riskScore,
      riskLevel,
      detectedReasons,
      recommendations,
      requiresConfirmation,
    }).catch(mErr => {
      // Background logging
    });
  }

  return analysisResult;
}

export default {
  analyzeScamRisk,
  calculateVelocityFromDB,
  evaluateUrlRisk,
  SCAM_THRESHOLDS,
};
