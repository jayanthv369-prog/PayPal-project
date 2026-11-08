import { getDatabase } from '../config/database.js';

export const TRANSACTION_STATES = {
  CONFIRMED: 'CONFIRMED',
  PENDING_VERIFICATION: 'PENDING_VERIFICATION',
  OUTCOME_UNKNOWN: 'OUTCOME_UNKNOWN',
  OFFLINE_AUTHORIZATION: 'OFFLINE_AUTHORIZATION',
  FAILED: 'FAILED',
  NEEDS_REVIEW: 'NEEDS_REVIEW',
};

function formatTransactionRow(row, logs = []) {
  if (!row) return null;

  let explanation = null;
  if (row.explanation) {
    try {
      explanation = typeof row.explanation === 'string' ? JSON.parse(row.explanation) : row.explanation;
    } catch (e) {
      explanation = null;
    }
  }

  let metadata = {};
  if (row.metadata) {
    try {
      metadata = typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata;
    } catch (e) {
      metadata = {};
    }
  }

  // Combine row logs from metadata with audit_logs
  const combinedLogs = [...(metadata.logs || [])];
  if (logs && logs.length > 0) {
    for (const l of logs) {
      if (!combinedLogs.some(existing => existing.timestamp === l.timestamp && existing.event === l.event)) {
        combinedLogs.push({
          timestamp: l.timestamp,
          event: l.event,
          detail: l.detail,
        });
      }
    }
  }

  // Sort logs chronologically
  combinedLogs.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

  const safeToRetry = explanation?.safeToRetry !== undefined
    ? explanation.safeToRetry
    : (metadata.safeToRetry !== undefined ? metadata.safeToRetry : row.transaction_state === 'FAILED');

  const needsReconciliation = row.transaction_state === 'PENDING_VERIFICATION' ||
    row.transaction_state === 'OUTCOME_UNKNOWN' ||
    Boolean(metadata.needsReconciliation);

  return {
    id: row.id,
    idempotencyKey: row.idempotency_key,
    amount: Number(row.amount),
    currency: row.currency || 'INR',
    sender: row.sender,
    recipient: row.recipient,
    recipientName: row.recipient_name,
    category: row.category || 'General Transfer',
    channel: row.payment_channel,
    state: row.transaction_state,
    confidenceScore: row.confidence_score,
    providerReference: row.provider_reference,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    reconciliationStatus: row.reconciliation_status,
    explanation,
    userExplanation: explanation?.userExplanation || metadata.userExplanation,
    technicalDiagnosis: explanation?.technicalDiagnosis || metadata.technicalDiagnosis,
    safeToRetry,
    needsReconciliation,
    settlementPending: row.transaction_state === 'OFFLINE_AUTHORIZATION' || Boolean(metadata.settlementPending),
    scamAlert: metadata.scamAlert,
    isSimulation: Boolean(metadata.isSimulation || row.payment_channel === 'CRASH_SIMULATION'),
    nonce: metadata.nonce,
    signature: metadata.signature,
    logs: combinedLogs,
    metadata,
  };
}

export function listTransactions({ page = 1, limit = 20, state = 'ALL', search = '' } = {}, db = null) {
  const database = db || getDatabase();
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 20));
  const offset = (pageNum - 1) * limitNum;

  const conditions = [];
  const params = [];

  if (state && state !== 'ALL') {
    if (state === 'PENDING') {
      conditions.push(`transaction_state IN ('PENDING_VERIFICATION', 'OUTCOME_UNKNOWN')`);
    } else if (state === 'OFFLINE') {
      conditions.push(`transaction_state = 'OFFLINE_AUTHORIZATION'`);
    } else if (state === 'FLAGGED') {
      conditions.push(`transaction_state = 'NEEDS_REVIEW'`);
    } else {
      conditions.push(`transaction_state = ?`);
      params.push(state);
    }
  }

  if (search && search.trim()) {
    const s = `%${search.trim().toLowerCase()}%`;
    conditions.push(`(
      LOWER(id) LIKE ? OR
      LOWER(recipient) LIKE ? OR
      LOWER(COALESCE(recipient_name, '')) LIKE ? OR
      LOWER(COALESCE(category, '')) LIKE ? OR
      LOWER(idempotency_key) LIKE ? OR
      CAST(amount AS TEXT) LIKE ?
    )`);
    params.push(s, s, s, s, s, s);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const countQuery = `SELECT COUNT(*) as total FROM transactions ${whereClause}`;
  const total = database.prepare(countQuery).get(...params).total;

  const dataQuery = `
    SELECT * FROM transactions
    ${whereClause}
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `;
  const rows = database.prepare(dataQuery).all(...params, limitNum, offset);

  // Fetch logs for these transactions
  const txIds = rows.map(r => r.id);
  let logsByTx = {};
  if (txIds.length > 0) {
    const placeholders = txIds.map(() => '?').join(',');
    const auditRows = database.prepare(`
      SELECT entity_id, event, detail, timestamp
      FROM audit_logs
      WHERE entity_type = 'TRANSACTION' AND entity_id IN (${placeholders})
      ORDER BY timestamp ASC
    `).all(...txIds);

    for (const a of auditRows) {
      if (!logsByTx[a.entity_id]) logsByTx[a.entity_id] = [];
      logsByTx[a.entity_id].push(a);
    }
  }

  const transactions = rows.map(r => formatTransactionRow(r, logsByTx[r.id]));

  return {
    transactions,
    pagination: {
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum) || 1,
    },
  };
}

export function getTransactionById(id, db = null) {
  const database = db || getDatabase();
  const row = database.prepare('SELECT * FROM transactions WHERE id = ?').get(id);
  if (!row) return null;

  const auditRows = database.prepare(`
    SELECT event, detail, timestamp, metadata
    FROM audit_logs
    WHERE entity_type = 'TRANSACTION' AND entity_id = ?
    ORDER BY timestamp ASC
  `).all(id);

  return formatTransactionRow(row, auditRows);
}

export function getTransactionByIdempotencyKey(key, db = null) {
  const database = db || getDatabase();
  const row = database.prepare('SELECT * FROM transactions WHERE idempotency_key = ?').get(key);
  if (!row) return null;

  const auditRows = database.prepare(`
    SELECT event, detail, timestamp, metadata
    FROM audit_logs
    WHERE entity_type = 'TRANSACTION' AND entity_id = ?
    ORDER BY timestamp ASC
  `).all(row.id);

  return formatTransactionRow(row, auditRows);
}

export function createTransaction(txData, db = null) {
  const database = db || getDatabase();

  const id = txData.id || `TXN-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
  const now = new Date().toISOString();
  const idempotencyKey = txData.idempotencyKey || `IDEMP-${id}`;
  const currency = txData.currency || 'INR';
  const paymentChannel = txData.channel || txData.payment_channel || 'UPI_ONLINE';
  const transactionState = txData.state || txData.transaction_state || 'PENDING_VERIFICATION';
  const confidenceScore = txData.confidenceScore !== undefined ? txData.confidenceScore : 100;
  const createdAt = txData.createdAt || now;
  const updatedAt = txData.updatedAt || now;

  // 1. Check whether idempotency key already exists before inserting
  if (idempotencyKey) {
    const existingByKey = getTransactionByIdempotencyKey(idempotencyKey, database);
    if (existingByKey) {
      return { ...existingByKey, _isExisting: true };
    }
  }

  // Also check whether the id itself already exists
  if (txData.id) {
    const existingById = getTransactionById(txData.id, database);
    if (existingById) {
      return { ...existingById, _isExisting: true };
    }
  }

  const explanationStr = txData.explanation
    ? (typeof txData.explanation === 'string' ? txData.explanation : JSON.stringify(txData.explanation))
    : (txData.userExplanation || txData.technicalDiagnosis
      ? JSON.stringify({
          userExplanation: txData.userExplanation,
          technicalDiagnosis: txData.technicalDiagnosis,
          safeToRetry: txData.safeToRetry || false,
          recommendedAction: txData.recommendedAction || '',
        })
      : null);

  const initialMetadata = {
    safeToRetry: txData.safeToRetry || false,
    needsReconciliation: txData.needsReconciliation || false,
    settlementPending: txData.settlementPending || false,
    isSimulation: Boolean(txData.isSimulation || paymentChannel === 'CRASH_SIMULATION'),
    scamAlert: txData.scamAlert,
    nonce: txData.nonce,
    signature: txData.signature,
    logs: txData.logs || [],
    scenarioId: txData.scenarioId || (paymentChannel === 'CRASH_SIMULATION' && txData.idempotencyKey?.includes('CRASH-01') ? 'SCENARIO_1_NETWORK_DROP' : (paymentChannel === 'CRASH_SIMULATION' && txData.idempotencyKey?.includes('CRASH-02') ? 'SCENARIO_2_TIMEOUT_ACK' : null)),
    simulatedOutcome: txData.simulatedOutcome || (txData.scenarioId === 'SCENARIO_1_NETWORK_DROP' || txData.idempotencyKey?.includes('CRASH-01') ? 'NO_DEBIT' : (txData.scenarioId === 'SCENARIO_2_TIMEOUT_ACK' || txData.idempotencyKey?.includes('CRASH-02') ? 'CONFIRMED_DEBIT' : null)),
  };

  const insertTx = database.prepare(`
    INSERT INTO transactions (
      id, idempotency_key, amount, currency, sender, recipient, recipient_name,
      category, payment_channel, transaction_state, confidence_score, provider_reference,
      created_at, updated_at, reconciliation_status, explanation, metadata
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?
    )
  `);

  const insertIdemp = database.prepare(`
    INSERT INTO idempotency_keys (key, target_type, target_id, status, created_at)
    VALUES (?, 'TRANSACTION', ?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET
      target_id = excluded.target_id,
      status = excluded.status
  `);

  const insertAudit = database.prepare(`
    INSERT INTO audit_logs (entity_type, entity_id, event, detail, timestamp)
    VALUES ('TRANSACTION', ?, ?, ?, ?)
  `);

  let finalId = id;
  let isExisting = false;

  const txn = database.transaction(() => {
    // 2. Atomic check inside SQLite write transaction to handle concurrent races
    const existingRow = database.prepare(`
      SELECT id FROM transactions WHERE idempotency_key = ? OR id = ?
    `).get(idempotencyKey, id);

    if (existingRow) {
      finalId = existingRow.id;
      isExisting = true;
      return;
    }

    try {
      insertTx.run(
        id,
        idempotencyKey,
        parseFloat(txData.amount),
        currency,
        txData.sender || null,
        txData.recipient,
        txData.recipientName || null,
        txData.category || null,
        paymentChannel,
        transactionState,
        confidenceScore,
        txData.providerReference || null,
        createdAt,
        updatedAt,
        txData.reconciliationStatus || null,
        explanationStr,
        JSON.stringify(initialMetadata)
      );

      const idempStatus = transactionState === 'CONFIRMED' || transactionState === 'FAILED'
        ? 'RESOLVED' : 'LOCKED';
      insertIdemp.run(idempotencyKey, id, idempStatus, createdAt);

      insertAudit.run(
        id,
        'TRANSACTION_CREATED',
        `Transaction initiated for amount ${currency} ${txData.amount} with state ${transactionState}`,
        createdAt
      );

      if (txData.logs && Array.isArray(txData.logs)) {
        for (const log of txData.logs) {
          insertAudit.run(id, log.event, log.detail || '', log.timestamp || createdAt);
        }
      }
    } catch (err) {
      // 3. Fallback for concurrent insertion race condition
      if (err.message && err.message.includes('UNIQUE constraint failed')) {
        const raceExisting = database.prepare(`
          SELECT id FROM transactions WHERE idempotency_key = ? OR id = ?
        `).get(idempotencyKey, id);
        if (raceExisting) {
          finalId = raceExisting.id;
          isExisting = true;
          return;
        }
      }
      throw err;
    }
  });

  txn();
  const record = getTransactionById(finalId, database);
  if (record && isExisting) {
    record._isExisting = true;
  }
  return record;
}

export function updateTransactionState(id, newState, options = {}, db = null) {
  const database = db || getDatabase();
  const existing = database.prepare('SELECT * FROM transactions WHERE id = ?').get(id);
  if (!existing) return null;

  const now = new Date().toISOString();
  let metadata = {};
  try {
    metadata = existing.metadata ? JSON.parse(existing.metadata) : {};
  } catch (e) {
    metadata = {};
  }

  if (options.safeToRetry !== undefined) metadata.safeToRetry = options.safeToRetry;
  if (options.needsReconciliation !== undefined) metadata.needsReconciliation = options.needsReconciliation;
  if (options.scamAlert !== undefined) metadata.scamAlert = options.scamAlert;
  if (options.isSimulation !== undefined) metadata.isSimulation = options.isSimulation;
  if (options.simulatedOutcome !== undefined) metadata.simulatedOutcome = options.simulatedOutcome;
  if (options.scenarioId !== undefined) metadata.scenarioId = options.scenarioId;

  let explanationStr = existing.explanation;
  if (options.explanation) {
    explanationStr = typeof options.explanation === 'string'
      ? options.explanation
      : JSON.stringify(options.explanation);
  }

  const confidenceScore = options.confidenceScore !== undefined
    ? options.confidenceScore
    : (newState === 'CONFIRMED' ? 99 : (newState === 'FAILED' ? 100 : existing.confidence_score));

  const providerReference = options.providerReference !== undefined
    ? options.providerReference
    : existing.provider_reference;

  const reconciliationStatus = options.reconciliationStatus !== undefined
    ? options.reconciliationStatus
    : (newState === 'CONFIRMED' || newState === 'FAILED' ? 'RECONCILED' : existing.reconciliation_status);

  const updateStmt = database.prepare(`
    UPDATE transactions
    SET transaction_state = ?,
        confidence_score = ?,
        provider_reference = ?,
        updated_at = ?,
        reconciliation_status = ?,
        explanation = ?,
        metadata = ?
    WHERE id = ?
  `);

  const updateIdemp = database.prepare(`
    UPDATE idempotency_keys
    SET status = ?
    WHERE key = ?
  `);

  const insertAudit = database.prepare(`
    INSERT INTO audit_logs (entity_type, entity_id, event, detail, timestamp)
    VALUES ('TRANSACTION', ?, ?, ?, ?)
  `);

  const txn = database.transaction(() => {
    updateStmt.run(
      newState,
      confidenceScore,
      providerReference,
      now,
      reconciliationStatus,
      explanationStr,
      JSON.stringify(metadata),
      id
    );

    const idempStatus = (newState === 'CONFIRMED' || newState === 'FAILED') ? 'RESOLVED' : 'LOCKED';
    updateIdemp.run(idempStatus, existing.idempotency_key);

    const auditDetail = options.logDetail || `Transaction state updated from ${existing.transaction_state} to ${newState}`;
    insertAudit.run(id, options.logEvent || 'STATE_UPDATED', auditDetail, now);
  });

  txn();
  return getTransactionById(id, database);
}

export function getDashboardStats(db = null) {
  const database = db || getDatabase();

  const totalRow = database.prepare(`
    SELECT
      COUNT(*) as totalCount,
      COALESCE(SUM(amount), 0) as totalVolume,
      COALESCE(AVG(confidence_score), 0) as avgConfidence
    FROM transactions
  `).get();

  const confirmedRow = database.prepare(`
    SELECT COUNT(*) as count, COALESCE(SUM(amount), 0) as volume
    FROM transactions
    WHERE transaction_state = 'CONFIRMED'
  `).get();

  const pendingRow = database.prepare(`
    SELECT COUNT(*) as count, COALESCE(SUM(amount), 0) as volume
    FROM transactions
    WHERE transaction_state IN ('PENDING_VERIFICATION', 'OUTCOME_UNKNOWN')
  `).get();

  const offlineRow = database.prepare(`
    SELECT COUNT(*) as count, COALESCE(SUM(amount), 0) as volume
    FROM transactions
    WHERE transaction_state = 'OFFLINE_AUTHORIZATION'
  `).get();

  const flaggedRow = database.prepare(`
    SELECT COUNT(*) as count, COALESCE(SUM(amount), 0) as volume
    FROM transactions
    WHERE transaction_state = 'NEEDS_REVIEW'
  `).get();

  const failedRow = database.prepare(`
    SELECT COUNT(*) as count
    FROM transactions
    WHERE transaction_state = 'FAILED'
  `).get();

  // Recovered funds: transactions that were reconciled (e.g. from PENDING_VERIFICATION / OUTCOME_UNKNOWN -> CONFIRMED)
  const recoveredRow = database.prepare(`
    SELECT
      COUNT(*) as count,
      COALESCE(SUM(amount), 0) as amount
    FROM transactions
    WHERE (
      reconciliation_status = 'RECONCILED' AND transaction_state = 'CONFIRMED'
    ) OR id IN (
      SELECT entity_id FROM audit_logs
      WHERE entity_type = 'TRANSACTION' AND (
        event LIKE '%RECONCIL%' OR event LIKE '%RECOVER%'
      )
    )
  `).get();

  // Also query merchant journal for offline queue
  const journalRow = database.prepare(`
    SELECT COUNT(*) as count, COALESCE(SUM(amount), 0) as volume
    FROM merchant_journal
  `).get();

  // Offline passports total
  const passportsRow = database.prepare(`
    SELECT COUNT(*) as count FROM offline_passports
  `).get();

  return {
    totalTransactions: totalRow.totalCount,
    totalVolume: Number(totalRow.totalVolume),
    averageConfidence: Math.round(totalRow.avgConfidence),
    confirmedCount: confirmedRow.count,
    confirmedVolume: Number(confirmedRow.volume),
    pendingCount: pendingRow.count,
    pendingVolume: Number(pendingRow.volume),
    offlineCount: offlineRow.count,
    offlineVolume: Number(offlineRow.volume),
    scamThreatsBlocked: flaggedRow.count,
    failedCount: failedRow.count,
    recoveredTxnsCount: recoveredRow.count,
    recoveredFunds: Number(recoveredRow.amount),
    merchantJournalCount: journalRow.count,
    offlinePassportsCount: passportsRow.count,
  };
}

/**
 * Retry an existing transaction.
 * Strictly enforces that transactions in OUTCOME_UNKNOWN or PENDING_VERIFICATION cannot be retried.
 * Only allows a fresh attempt after Smart Reconcile confirms FAILED, and requires a NEW idempotency key.
 */
export function retryTransaction(originalId, options = {}, db = null) {
  const database = db || getDatabase();

  const original = getTransactionById(originalId, database) || getTransactionByIdempotencyKey(originalId, database);
  if (!original) {
    const err = new Error(`Original transaction not found: ${originalId}`);
    err.status = 404;
    err.code = 'TRANSACTION_NOT_FOUND';
    throw err;
  }

  // Requirement 1 & 3: Reject retry if state is OUTCOME_UNKNOWN
  if (original.state === 'OUTCOME_UNKNOWN') {
    const err = new Error('Payment outcome is unknown. Please use Smart Reconcile before attempting another payment.');
    err.status = 409;
    err.code = 'RETRY_BLOCKED_OUTCOME_UNKNOWN';
    err.details = {
      state: 'OUTCOME_UNKNOWN',
      safeToRetry: false,
      transactionId: original.id,
      recommendedAction: 'Payment outcome is unknown. Please use Smart Reconcile before attempting another payment.',
    };
    throw err;
  }

  // Requirement 6: Reject retry if state is PENDING_VERIFICATION
  if (original.state === 'PENDING_VERIFICATION') {
    const err = new Error('Payment verification is pending. Please use Smart Reconcile before attempting another payment.');
    err.status = 409;
    err.code = 'RETRY_BLOCKED_PENDING';
    err.details = {
      state: 'PENDING_VERIFICATION',
      safeToRetry: false,
      transactionId: original.id,
      recommendedAction: 'Payment verification is pending. Please use Smart Reconcile before attempting another payment.',
    };
    throw err;
  }

  // Prohibit retrying confirmed payments (duplicate prevention)
  if (original.state === 'CONFIRMED') {
    const err = new Error('Transaction was already confirmed. Duplicate payment prohibited.');
    err.status = 409;
    err.code = 'RETRY_BLOCKED_CONFIRMED';
    err.details = {
      state: 'CONFIRMED',
      safeToRetry: false,
      transactionId: original.id,
      providerReference: original.providerReference,
    };
    throw err;
  }

  // Requirement 4: Only allow retry after confirmed FAILED
  if (original.state !== 'FAILED') {
    const err = new Error(`Cannot retry transaction in state ${original.state}. Transaction must be confirmed FAILED by Smart Reconcile first.`);
    err.status = 409;
    err.code = 'RETRY_NOT_PERMITTED';
    err.details = {
      state: original.state,
      safeToRetry: Boolean(original.safeToRetry),
      transactionId: original.id,
    };
    throw err;
  }

  // Requirement 4: Must use a NEW idempotency key
  const newIdempotencyKey = options.newIdempotencyKey || options.idempotencyKey;
  if (!newIdempotencyKey || newIdempotencyKey === original.idempotencyKey) {
    const err = new Error('A new and distinct idempotency key is required for a fresh payment attempt after failure.');
    err.status = 400;
    err.code = 'NEW_IDEMPOTENCY_KEY_REQUIRED';
    throw err;
  }

  const existingNew = getTransactionByIdempotencyKey(newIdempotencyKey, database);
  if (existingNew) {
    const err = new Error(`Idempotency key ${newIdempotencyKey} has already been used.`);
    err.status = 409;
    err.code = 'IDEMPOTENCY_KEY_ALREADY_USED';
    throw err;
  }

  // Create fresh transaction
  const retryTx = createTransaction({
    idempotencyKey: newIdempotencyKey,
    amount: options.amount !== undefined ? parseFloat(options.amount) : original.amount,
    currency: original.currency || 'INR',
    sender: original.sender,
    recipient: original.recipient,
    recipientName: original.recipientName,
    category: original.category,
    channel: original.channel || 'UPI_ONLINE',
    state: TRANSACTION_STATES.PENDING_VERIFICATION,
    confidenceScore: 85,
    userExplanation: `Fresh payment attempt initiated after previous attempt ${original.id} was confirmed failed without debit.`,
    technicalDiagnosis: `Fresh idempotency key ${newIdempotencyKey} assigned. Linked to failed attempt ${original.id}.`,
    logs: [
      {
        timestamp: new Date().toISOString(),
        event: 'RETRY_INITIATED',
        detail: `Fresh payment attempt created with new idempotency key ${newIdempotencyKey}. Previous failed attempt: ${original.id}.`,
      },
    ],
  }, database);

  return {
    success: true,
    message: 'Fresh payment attempt initiated with new idempotency key.',
    originalTransactionId: original.id,
    transaction: retryTx,
  };
}
