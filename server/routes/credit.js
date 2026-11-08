import express from 'express';
import {
  getCreditProfile,
  activateCreditBridge,
  repayCreditInstallment,
  getCreditTransactions
} from '../services/creditService.js';

const router = express.Router();

/**
 * GET /api/credit/profile
 * Retrieves simulated credit buffer profile and repayment schedule
 */
router.get('/profile', (req, res) => {
  try {
    const userId = req.query.userId || 'CUST-IN-89210';
    const profile = getCreditProfile(userId);
    if (!profile) {
      return res.status(404).json({ error: 'Credit profile not found' });
    }
    res.json(profile);
  } catch (err) {
    console.error('Get credit profile error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/credit/activate
 * Activates simulated emergency credit buffer for a stalled merchant payment
 */
router.post('/activate', (req, res) => {
  try {
    const {
      amount,
      recipient,
      recipientName,
      targetTxnId,
      consentGiven,
      idempotencyKey,
      userId
    } = req.body;

    if (!consentGiven) {
      return res.status(400).json({
        error: 'CONSENT_REQUIRED',
        code: 'CONSENT_REQUIRED',
        message: 'Explicit user consent is mandatory before activating simulated temporary credit.',
      });
    }

    if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
      return res.status(400).json({
        error: 'INVALID_AMOUNT',
        code: 'INVALID_AMOUNT',
        message: 'Valid positive amount is required',
      });
    }

    const result = activateCreditBridge({
      amount: parseFloat(amount),
      recipient: recipient || 'medical-hospital-pharmacy@axis',
      recipientName: recipientName || 'Apollo Emergency Pharmacy',
      targetTxnId,
      consentGiven: Boolean(consentGiven),
      idempotencyKey,
      userId: userId || 'CUST-IN-89210',
    });

    res.json(result);
  } catch (err) {
    const status = err.status || 400;
    res.status(status).json({
      error: err.code || 'CREDIT_ACTIVATION_FAILED',
      code: err.code || 'CREDIT_ACTIVATION_FAILED',
      message: err.message,
      details: err.details || null,
    });
  }
});

/**
 * POST /api/credit/repay
 * Repay an outstanding credit installment
 */
router.post('/repay', (req, res) => {
  try {
    const { installmentId, userId } = req.body;
    if (!installmentId) {
      return res.status(400).json({ error: 'installmentId is required' });
    }

    const result = repayCreditInstallment({
      installmentId,
      userId: userId || 'CUST-IN-89210',
    });

    res.json(result);
  } catch (err) {
    console.error('Repay credit installment error:', err);
    res.status(400).json({ error: err.message });
  }
});

/**
 * GET /api/credit/transactions
 * Lists all simulated credit bridge transactions
 */
router.get('/transactions', (req, res) => {
  try {
    const userId = req.query.userId || 'CUST-IN-89210';
    const transactions = getCreditTransactions(userId);
    res.json({ count: transactions.length, transactions });
  } catch (err) {
    console.error('Get credit transactions error:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
