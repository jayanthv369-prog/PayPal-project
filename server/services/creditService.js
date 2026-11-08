import { getDatabase } from '../config/database.js';
import { createTransaction, TRANSACTION_STATES } from './transactionService.js';

export function getCreditProfile(userId = 'CUST-IN-89210', db = null) {
  const database = db || getDatabase();

  const profileRow = database.prepare('SELECT * FROM credit_profiles WHERE user_id = ?').get(userId);
  if (!profileRow) {
    return null;
  }

  const installments = database.prepare(`
    SELECT * FROM credit_transactions
    WHERE user_id = ?
    ORDER BY created_at ASC
  `).all(userId);

  return {
    userId: profileRow.user_id,
    userName: profileRow.user_name,
    creditLimit: Number(profileRow.credit_limit),
    utilizedCredit: Number(profileRow.utilized_credit),
    availableCredit: Number(profileRow.available_credit),
    trustScore: profileRow.trust_score,
    eligibilityStatus: profileRow.eligibility_status,
    consentGiven: Boolean(profileRow.consent_given),
    isSimulation: true,
    disclaimer: profileRow.disclaimer,
    repaymentSchedule: installments.map(i => ({
      id: i.installment_id,
      loanId: i.loan_id,
      dueDate: i.due_date,
      amount: Number(i.amount),
      status: i.status,
      recipient: i.recipient,
      recipientName: i.recipient_name,
      createdAt: i.created_at,
      repaidAt: i.repaid_at,
    })),
  };
}

export function activateCreditBridge({
  userId = 'CUST-IN-89210',
  amount,
  recipient = 'medical-hospital-pharmacy@axis',
  recipientName = 'Apollo Emergency Pharmacy',
  targetTxnId = null,
  idempotencyKey = null,
  consentGiven = false,
}, db = null) {
  const database = db || getDatabase();

  if (!consentGiven) {
    const err = new Error('Explicit user consent is mandatory before activating simulated temporary credit.');
    err.status = 400;
    err.code = 'CONSENT_REQUIRED';
    throw err;
  }

  const numAmount = parseFloat(amount);
  if (isNaN(numAmount) || numAmount <= 0) {
    const err = new Error('Valid positive amount is required for credit bridge');
    err.status = 400;
    err.code = 'INVALID_AMOUNT';
    throw err;
  }

  const profile = getCreditProfile(userId, database);
  if (!profile) {
    const err = new Error(`Credit profile not found for user: ${userId}`);
    err.status = 404;
    err.code = 'PROFILE_NOT_FOUND';
    throw err;
  }

  if (numAmount > profile.availableCredit) {
    const err = new Error(`Requested amount ₹${numAmount} exceeds available simulated credit limit of ₹${profile.availableCredit}`);
    err.status = 422;
    err.code = 'INSUFFICIENT_CREDIT_LIMIT';
    err.details = {
      requestedAmount: numAmount,
      availableCredit: profile.availableCredit,
      creditLimit: profile.creditLimit,
      utilizedCredit: profile.utilizedCredit,
    };
    throw err;
  }

  const idempKey = idempotencyKey || `IDEMP-CREDIT-${targetTxnId || Date.now()}`;

  // Idempotency check: prevent duplicate activation
  const existingIdemp = database.prepare('SELECT * FROM idempotency_keys WHERE key = ?').get(idempKey);
  if (existingIdemp && existingIdemp.status === 'RESOLVED') {
    return {
      success: true,
      duplicatePrevented: true,
      isSimulation: true,
      message: 'Credit Bridge already activated for this request. Duplicate disbursement prevented.',
      creditProfile: getCreditProfile(userId, database),
    };
  }

  const now = new Date();
  const bridgeLoanId = `CREDIT-BRIDGE-${Date.now().toString(36).toUpperCase()}`;
  const installmentId = `INST-${Date.now().toString().slice(-4)}`;
  const dueDate = new Date(now.getTime() + 7 * 86400000).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  const newUtilized = profile.utilizedCredit + numAmount;
  const newAvailable = Math.max(0, profile.creditLimit - newUtilized);

  const updateProfile = database.prepare(`
    UPDATE credit_profiles
    SET utilized_credit = ?, available_credit = ?, updated_at = ?
    WHERE user_id = ?
  `);

  const insertInstallment = database.prepare(`
    INSERT INTO credit_transactions (
      id, user_id, loan_id, installment_id, amount, recipient, recipient_name,
      due_date, status, created_at, is_simulation
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?,
      ?, 'PENDING', ?, 1
    )
  `);

  const insertIdemp = database.prepare(`
    INSERT OR REPLACE INTO idempotency_keys (key, target_type, target_id, status, created_at)
    VALUES (?, 'CREDIT', ?, 'RESOLVED', ?)
  `);

  const insertAudit = database.prepare(`
    INSERT INTO audit_logs (entity_type, entity_id, event, detail, timestamp)
    VALUES ('CREDIT', ?, 'CREDIT_BRIDGE_DISBURSED', ?, ?)
  `);

  let createdTxn = null;

  const activationTx = database.transaction(() => {
    updateProfile.run(newUtilized, newAvailable, now.toISOString(), userId);

    insertInstallment.run(
      installmentId,
      userId,
      bridgeLoanId,
      installmentId,
      numAmount,
      recipient,
      recipientName,
      dueDate,
      now.toISOString()
    );

    insertIdemp.run(idempKey, bridgeLoanId, now.toISOString());

    insertAudit.run(
      bridgeLoanId,
      `Simulated credit bridge loan ${bridgeLoanId} (₹${numAmount}) disbursed for ${recipientName}. Due: ${dueDate}`,
      now.toISOString()
    );

    createdTxn = createTransaction({
      id: bridgeLoanId,
      idempotencyKey: `IDEMP-${bridgeLoanId}`,
      amount: numAmount,
      currency: 'INR',
      sender: 'PayBastion Temporary Credit Pool (Simulation)',
      recipient,
      recipientName,
      category: 'Emergency Credit Fallback (Simulation)',
      channel: 'CREDIT_BRIDGE_FALLBACK',
      state: TRANSACTION_STATES.CONFIRMED,
      confidenceScore: 98,
      isSimulation: true,
      createdAt: now.toISOString(),
      userExplanation: 'Simulated temporary micro-credit disbursed to merchant on your behalf while primary payment is investigated.',
      technicalDiagnosis: `Disbursed from simulated pool. Scheduled for repayment on ${dueDate}. Zero interest demo.`,
      safeToRetry: false,
      logs: [
        {
          timestamp: now.toISOString(),
          event: 'CREDIT_BRIDGE_DISBURSED',
          detail: `₹${numAmount} covered merchant payment under demonstration escrow.`,
        },
      ],
    }, database);
  });

  activationTx();

  const updatedProfile = getCreditProfile(userId, database);

  return {
    success: true,
    isSimulation: true,
    bridgeLoanId,
    installment: {
      id: installmentId,
      loanId: bridgeLoanId,
      dueDate,
      amount: numAmount,
      status: 'PENDING',
      recipient,
      recipientName,
    },
    transaction: createdTxn,
    creditProfile: updatedProfile,
  };
}

export function repayCreditInstallment({ installmentId, userId = 'CUST-IN-89210' }, db = null) {
  const database = db || getDatabase();

  const installment = database.prepare(`
    SELECT * FROM credit_transactions
    WHERE installment_id = ? AND user_id = ?
  `).get(installmentId, userId);

  if (!installment) {
    throw new Error(`Installment ${installmentId} not found`);
  }

  if (installment.status === 'REPAID') {
    return {
      success: true,
      alreadyRepaid: true,
      message: 'Installment was already repaid.',
      creditProfile: getCreditProfile(userId, database),
    };
  }

  const profile = getCreditProfile(userId, database);
  const now = new Date().toISOString();
  const newUtilized = Math.max(0, profile.utilizedCredit - Number(installment.amount));
  const newAvailable = Math.min(profile.creditLimit, profile.creditLimit - newUtilized);

  const repayTx = database.transaction(() => {
    database.prepare(`
      UPDATE credit_transactions
      SET status = 'REPAID', repaid_at = ?
      WHERE installment_id = ?
    `).run(now, installmentId);

    database.prepare(`
      UPDATE credit_profiles
      SET utilized_credit = ?, available_credit = ?, updated_at = ?
      WHERE user_id = ?
    `).run(newUtilized, newAvailable, now, userId);

    database.prepare(`
      INSERT INTO audit_logs (entity_type, entity_id, event, detail, timestamp)
      VALUES ('CREDIT', ?, 'CREDIT_INSTALLMENT_REPAID', ?, ?)
    `).run(
      installmentId,
      `Simulated installment ${installmentId} (₹${installment.amount}) repaid. Utilized balance reduced.`,
      now
    );
  });

  repayTx();

  return {
    success: true,
    isSimulation: true,
    message: `Installment ${installmentId} successfully repaid.`,
    creditProfile: getCreditProfile(userId, database),
  };
}

export function getCreditTransactions(userId = 'CUST-IN-89210', db = null) {
  const database = db || getDatabase();
  const rows = database.prepare(`
    SELECT * FROM credit_transactions
    WHERE user_id = ?
    ORDER BY created_at DESC
  `).all(userId);

  return rows.map(r => ({
    id: r.id,
    userId: r.user_id,
    loanId: r.loan_id,
    installmentId: r.installment_id,
    amount: Number(r.amount),
    recipient: r.recipient,
    recipientName: r.recipient_name,
    dueDate: r.due_date,
    status: r.status,
    createdAt: r.created_at,
    repaidAt: r.repaid_at,
    isSimulation: true,
  }));
}
