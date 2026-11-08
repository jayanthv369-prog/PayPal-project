import { getDatabase } from '../config/database.js';
import {
  getTransactionByIdempotencyKey,
  getTransactionById,
  createTransaction,
  updateTransactionState,
  TRANSACTION_STATES
} from './transactionService.js';
import { getProvider } from './providers/PaymentProvider.js';
import { explainTransactionState } from './geminiService.js';
import { ReconciliationLog } from '../models/ReconciliationLog.js';
import { AuditLog } from '../models/AuditLog.js';
import { Transaction as MongoTransaction } from '../models/Transaction.js';
import { isDBConnected } from '../config/database.js';

/**
 * Register an in-flight or interrupted transaction with an idempotency key.
 * Synchronous execution for deterministic caller compatibility.
 */
export function registerRecoveryTransaction({
  idempotencyKey,
  amount,
  recipient,
  recipientName = null,
  sender = 'user-ananya@okaxis',
  channel = 'UPI_ONLINE',
  provider = 'UPI_GATEWAY',
  state = TRANSACTION_STATES.OUTCOME_UNKNOWN,
  isSimulation = false,
  simulatedOutcome = null,
  scenarioId = null,
  userId = null,
}, db = null) {
  const database = db || getDatabase();

  if (!idempotencyKey) {
    throw new Error('idempotencyKey is required for recovery registration');
  }

  // Step 1: Check existing record
  const existing = getTransactionByIdempotencyKey(idempotencyKey, database);
  if (existing) {
    return {
      status: 'EXISTING',
      duplicatePrevented: true,
      transaction: existing,
      message: 'Idempotency key already registered. Duplicate submission prevented.',
    };
  }

  // Step 2: Acquire Idempotency Lock & Create Transaction
  const now = new Date().toISOString();
  const txId = `TXN-REC-${Date.now().toString().slice(-6)}`;
  const numAmount = parseFloat(amount || 0);

  const created = createTransaction({
    id: txId,
    idempotencyKey,
    amount: numAmount,
    currency: 'INR',
    sender,
    recipient,
    recipientName,
    category: 'Interrupted Transfer',
    channel,
    state,
    confidenceScore: state === 'OUTCOME_UNKNOWN' ? 35 : 65,
    needsReconciliation: true,
    safeToRetry: false,
    isSimulation: Boolean(isSimulation || channel === 'CRASH_SIMULATION'),
    simulatedOutcome,
    scenarioId,
    userExplanation: 'Payment in transit. Network dropped or acknowledgement delayed. Idempotency lock active.',
    technicalDiagnosis: `Idempotency key ${idempotencyKey} locked. Upstream verification required before retry.`,
    logs: [
      {
        timestamp: now,
        event: 'IDEMPOTENCY_LOCK_ACQUIRED',
        detail: `Acquired processing lock for idempotency key ${idempotencyKey} (${channel}).`,
      },
    ],
  }, database);

  // Sync to MongoDB asynchronously without blocking
  if (isDBConnected()) {
    MongoTransaction.create({
      userId,
      transactionId: txId,
      idempotencyKey,
      provider,
      amount: numAmount,
      currency: 'INR',
      sender,
      recipient,
      recipientName,
      status: state,
      channel,
      confidenceScore: state === 'OUTCOME_UNKNOWN' ? 35 : 65,
      isSimulation: Boolean(isSimulation || channel === 'CRASH_SIMULATION'),
      userExplanation: 'Payment in transit. Idempotency lock active.',
      technicalDiagnosis: `Idempotency key ${idempotencyKey} locked.`,
      safeToRetry: false,
      metadata: { scenarioId, simulatedOutcome },
    }).catch(() => {});

    AuditLog.create({
      userId,
      action: 'TRANSACTION_RECOVERY_REGISTERED',
      resourceId: txId,
      details: { idempotencyKey, state, amount: numAmount },
    }).catch(() => {});
  }

  return {
    status: 'REGISTERED',
    duplicatePrevented: false,
    transaction: created,
    message: 'Idempotency lock acquired and transaction registered in persistent database.',
  };
}

/**
 * Reconcile an interrupted/uncertain transaction.
 * Queries original provider via Provider Abstraction BEFORE determining outcome.
 * Never assumes SUCCESS!
 */
export async function reconcileRecoveryTransaction(paramsOrKey, db = null) {
  const database = db || getDatabase();

  const params = typeof paramsOrKey === 'string'
    ? { idempotencyKey: paramsOrKey }
    : (paramsOrKey || {});

  const {
    idempotencyKey,
    orderId = null,
    provider: requestedProvider = null,
    simulatedOutcome = null,
    userId = null,
  } = params;

  if (!idempotencyKey) {
    throw new Error('idempotencyKey is required for reconciliation');
  }

  let record = getTransactionByIdempotencyKey(idempotencyKey, database);

  // If not found by idempotency key, also check if it's a transaction ID
  if (!record) {
    record = getTransactionById(idempotencyKey, database);
  }

  if (!record) {
    throw new Error(`No transaction found matching key: ${idempotencyKey}`);
  }

  const previousState = record.state || record.status || 'OUTCOME_UNKNOWN';

  // Determine which Provider Adapter to use
  const isSimulation = Boolean(
    (simulatedOutcome !== null && simulatedOutcome !== undefined) ||
    record.isSimulation ||
    record.channel === 'CRASH_SIMULATION' ||
    record.metadata?.isSimulation ||
    record.idempotencyKey?.includes('CRASH') ||
    record.idempotencyKey?.includes('SIM') ||
    record.id?.includes('CRASH') ||
    requestedProvider === 'SIMULATION' ||
    requestedProvider === 'SIMULATED_GATEWAY'
  );

  const providerType = requestedProvider ||
    (record.channel === 'PAYPAL_SANDBOX' || record.idempotencyKey?.includes('PP-') ? 'PAYPAL' : 'MOCK');
  const provider = getProvider(providerType);

  // Query Provider Adapter
  const providerResult = await provider.verifyStatus({
    transactionId: record.id,
    idempotencyKey: record.idempotencyKey,
    providerReference: record.providerReference,
    orderId,
    simulatedOutcome,
    metadata: record.metadata,
  });

  const nextState = providerResult.state;
  const providerStatus = providerResult.providerStatus;
  const providerReference = providerResult.reference || record.providerReference;
  const diagnosticDetail = providerResult.detail;

  const safeToRetry = nextState === TRANSACTION_STATES.FAILED;

  let resolutionMessage = '';
  if (nextState === TRANSACTION_STATES.CONFIRMED) {
    resolutionMessage = isSimulation
      ? `Simulated clearinghouse confirmed debit of ${record.currency} ${record.amount}. Reference: ${providerReference} (DEMO SIMULATION).`
      : `Clearinghouse confirmed debit of ${record.currency} ${record.amount}. Reference: ${providerReference}. Original transaction verified. Duplicate payment prevented.`;
  } else if (nextState === TRANSACTION_STATES.FAILED) {
    resolutionMessage = isSimulation
      ? `Simulated bank ledger confirmed zero debit was executed prior to network dropout. Idempotency lock released safely. Safe to retry with a new payment (DEMO SIMULATION).`
      : `Payment provider explicitly confirmed transaction failed upstream prior to account debit. Idempotency lock safely released. Safe to retry.`;
  } else {
    resolutionMessage = isSimulation
      ? `Simulated bank switch status is indeterminate or timed out. Idempotency lock retained to prevent duplicate debit. Do NOT re-initiate payment (DEMO SIMULATION).`
      : `Provider status is indeterminate or pending. Idempotency lock retained to prevent duplicate debit. Do NOT re-initiate payment.`;
  }

  // Get AI or deterministic explanation
  const explanation = await explainTransactionState({
    state: nextState,
    amount: record.amount,
    recipient: record.recipient,
    failurePoint: diagnosticDetail,
    providerResponse: {
      providerStatus,
      providerReference,
      isSimulation,
      diagnosticDetail,
    },
  });

  // Update SQLite record
  const updatedTx = updateTransactionState(record.id, nextState, {
    confidenceScore: nextState === 'CONFIRMED' ? 99 : (nextState === 'FAILED' ? 100 : 40),
    providerReference,
    reconciliationStatus: (nextState === 'CONFIRMED' || nextState === 'FAILED') ? 'RECONCILED' : 'PENDING',
    safeToRetry,
    needsReconciliation: nextState !== 'CONFIRMED' && nextState !== 'FAILED',
    explanation,
    isSimulation,
    logEvent: 'RECONCILIATION_QUERY',
    logDetail: resolutionMessage,
  }, database);

  // Persist to MongoDB ReconciliationLog, AuditLog, and update Transaction
  if (isDBConnected()) {
    ReconciliationLog.create({
      transactionId: record.id,
      previousStatus: previousState,
      providerStatus,
      finalStatus: nextState,
      provider: provider.name,
      providerReference,
      verificationTimestamp: new Date(),
      details: {
        idempotencyKey: record.idempotencyKey,
        diagnosticDetail,
        isSimulation,
        safeToRetry,
      },
    }).catch(() => {});

    MongoTransaction.findOneAndUpdate(
      { $or: [{ transactionId: record.id }, { idempotencyKey: record.idempotencyKey }] },
      {
        status: nextState,
        providerTransactionId: providerReference,
        safeToRetry,
        userExplanation: explanation.userExplanation,
        technicalDiagnosis: explanation.technicalDiagnosis,
        reconciliationStatus: (nextState === 'CONFIRMED' || nextState === 'FAILED') ? 'RECONCILED' : 'PENDING',
        $push: {
          logs: {
            timestamp: new Date(),
            event: 'RECONCILED_BY_SMART_RECOVERY',
            detail: resolutionMessage,
          },
        },
      }
    ).catch(() => {});

    AuditLog.create({
      userId,
      action: 'TRANSACTION_RECONCILED',
      resourceId: record.id,
      details: {
        previousStatus: previousState,
        finalStatus: nextState,
        provider: provider.name,
      },
    }).catch(() => {});
  }

  return {
    success: true,
    transaction: updatedTx,
    reconciliationResult: {
      resolvedState: nextState,
      duplicatePrevented: nextState === 'CONFIRMED',
      safeToRetry,
      message: resolutionMessage,
      providerReference,
      isSimulation,
      explanation,
    },
  };
}

/**
 * List pending transactions requiring reconciliation
 */
export function getPendingRecoveryTransactions(db = null) {
  const database = db || getDatabase();
  const rows = database.prepare(`
    SELECT * FROM transactions
    WHERE transaction_state IN ('PENDING_VERIFICATION', 'OUTCOME_UNKNOWN')
    ORDER BY created_at DESC
  `).all();

  return rows.map(r => getTransactionById(r.id, database));
}

export default {
  registerRecoveryTransaction,
  reconcileRecoveryTransaction,
  getPendingRecoveryTransactions,
};
