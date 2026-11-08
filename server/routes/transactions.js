import express from 'express';
import {
  listTransactions,
  getTransactionById,
  getTransactionByIdempotencyKey,
  createTransaction,
  updateTransactionState,
  retryTransaction,
  TRANSACTION_STATES
} from '../services/transactionService.js';

const router = express.Router();

/**
 * GET /api/transactions
 * Supports pagination (page, limit), filtering (state), and search (q / search)
 */
router.get('/', (req, res) => {
  try {
    const { page, limit, state, q, search } = req.query;
    const searchTerm = q || search || '';
    const result = listTransactions({
      page: parseInt(page, 10) || 1,
      limit: parseInt(limit, 10) || 50,
      state: state || 'ALL',
      search: searchTerm,
    });
    res.json(result);
  } catch (err) {
    console.error('List transactions error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/transactions/:id
 */
router.get('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const txn = getTransactionById(id);
    if (!txn) {
      return res.status(404).json({ error: 'Transaction not found' });
    }
    res.json(txn);
  } catch (err) {
    console.error('Get transaction error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/transactions
 * Create a transaction in persistent SQLite storage
 */
router.post('/', (req, res) => {
  try {
    const {
      id,
      amount,
      recipient,
      recipientName,
      sender,
      category,
      channel,
      state,
      idempotencyKey,
      confidenceScore,
      userExplanation,
      technicalDiagnosis,
      safeToRetry,
      logs
    } = req.body;

    if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
      return res.status(400).json({
        error: 'Validation failed',
        message: 'Valid positive amount is required',
        code: 'INVALID_AMOUNT',
      });
    }
    if (!recipient) {
      return res.status(400).json({
        error: 'Validation failed',
        message: 'Recipient is required',
        code: 'MISSING_RECIPIENT',
      });
    }

    // Requirement 2 & 3: Reject retry requests for OUTCOME_UNKNOWN or PENDING_VERIFICATION transactions
    const isExplicitRetry = Boolean(req.body.isRetry || req.body.retry || req.body.retryOf || req.body.originalTransactionId);
    if (isExplicitRetry) {
      const targetIdentifier = req.body.retryOf || req.body.originalTransactionId || req.body.idempotencyKey || req.body.id;
      const existingTarget = getTransactionById(targetIdentifier) || getTransactionByIdempotencyKey(targetIdentifier);
      if (existingTarget) {
        if (existingTarget.state === 'OUTCOME_UNKNOWN') {
          return res.status(409).json({
            error: 'Payment outcome is unknown',
            message: 'Payment outcome is unknown. Please use Smart Reconcile before attempting another payment.',
            code: 'RETRY_BLOCKED_OUTCOME_UNKNOWN',
            state: 'OUTCOME_UNKNOWN',
            safeToRetry: false,
            transactionId: existingTarget.id,
            recommendedAction: 'Payment outcome is unknown. Please use Smart Reconcile before attempting another payment.',
          });
        }
        if (existingTarget.state === 'PENDING_VERIFICATION') {
          return res.status(409).json({
            error: 'Payment verification is pending',
            message: 'Payment verification is pending. Please use Smart Reconcile before attempting another payment.',
            code: 'RETRY_BLOCKED_PENDING',
            state: 'PENDING_VERIFICATION',
            safeToRetry: false,
            transactionId: existingTarget.id,
            recommendedAction: 'Payment verification is pending. Please use Smart Reconcile before attempting another payment.',
          });
        }
      }
    }

    const created = createTransaction({
      id,
      amount: parseFloat(amount),
      recipient,
      recipientName,
      sender,
      category,
      channel: channel || 'UPI_ONLINE',
      state: state || TRANSACTION_STATES.PENDING_VERIFICATION,
      idempotencyKey,
      confidenceScore,
      userExplanation,
      technicalDiagnosis,
      safeToRetry,
      logs
    });

    if (created && created._isExisting) {
      res.setHeader('X-Idempotent-Replay', 'true');
      return res.status(200).json(created);
    }

    res.status(201).json(created);
  } catch (err) {
    console.error('Create transaction error:', err);
    res.status(500).json({
      error: 'Failed to process transaction',
      message: err.message,
      code: 'TRANSACTION_PROCESSING_ERROR',
    });
  }
});

/**
 * POST /api/transactions/:id/retry
 * Safely retry a transaction confirmed FAILED by Smart Reconcile.
 * Blocks retrying transactions in OUTCOME_UNKNOWN or PENDING_VERIFICATION with HTTP 409.
 * Requires a NEW idempotency key.
 */
router.post('/:id/retry', (req, res) => {
  try {
    const { id } = req.params;
    const { newIdempotencyKey, amount } = req.body;

    const result = retryTransaction(id, {
      newIdempotencyKey,
      amount,
    });

    res.status(201).json(result);
  } catch (err) {
    const status = err.status || 500;
    if (status !== 500) {
      return res.status(status).json({
        error: err.code || 'RETRY_FAILED',
        message: err.message,
        details: err.details || null,
      });
    }
    console.error('Retry transaction error:', err);
    res.status(500).json({
      error: 'Failed to process retry',
      message: err.message,
    });
  }
});

/**
 * POST /api/transactions/retry
 */
router.post('/retry', (req, res) => {
  try {
    const { originalTransactionId, transactionId, newIdempotencyKey, amount } = req.body;
    const targetId = originalTransactionId || transactionId;

    if (!targetId) {
      return res.status(400).json({
        error: 'Missing target',
        message: 'originalTransactionId is required for retry',
      });
    }

    const result = retryTransaction(targetId, {
      newIdempotencyKey,
      amount,
    });

    res.status(201).json(result);
  } catch (err) {
    const status = err.status || 500;
    if (status !== 500) {
      return res.status(status).json({
        error: err.code || 'RETRY_FAILED',
        message: err.message,
        details: err.details || null,
      });
    }
    console.error('Retry transaction error:', err);
    res.status(500).json({
      error: 'Failed to process retry',
      message: err.message,
    });
  }
});

export default router;
