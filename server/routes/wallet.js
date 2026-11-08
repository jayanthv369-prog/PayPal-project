import express from 'express';
import {
  getBalance,
  setPin,
  verifyPin,
  addDemoFunds,
  transfer,
  getTransactions,
  getReceipt,
} from '../controllers/walletController.js';
import { requireAuth } from '../middleware/authMiddleware.js';
import { pinRateLimiter } from '../middleware/rateLimiter.js';
import { validateWalletTransfer } from '../middleware/validateRequest.js';

const router = express.Router();

// All wallet routes require authentication
router.use(requireAuth);

/**
 * GET /api/wallet/balance
 */
router.get('/balance', getBalance);

/**
 * POST /api/wallet/set-pin
 */
router.post('/set-pin', setPin);

/**
 * POST /api/wallet/verify-pin
 */
router.post('/verify-pin', pinRateLimiter, verifyPin);

/**
 * POST /api/wallet/add-demo-funds
 */
router.post('/add-demo-funds', addDemoFunds);

/**
 * POST /api/wallet/transfer
 */
router.post('/transfer', validateWalletTransfer, transfer);

/**
 * GET /api/wallet/transactions
 */
router.get('/transactions', getTransactions);

/**
 * GET /api/wallet/receipt/:transactionId
 */
router.get('/receipt/:transactionId', getReceipt);

export default router;
