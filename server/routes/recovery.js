import express from 'express';
import {
  register,
  reconcile,
  getPending,
} from '../controllers/recoveryController.js';
import { optionalAuth } from '../middleware/authMiddleware.js';

const router = express.Router();

/**
 * POST /api/recovery/register
 * Initialize / Record an in-flight transaction with idempotency key in persistent DB.
 */
router.post('/register', optionalAuth, register);

/**
 * POST /api/recovery/reconcile
 * Smart Reconcile an interrupted/uncertain transaction.
 * Queries original payment provider BEFORE allowing retry or confirming.
 */
router.post('/reconcile', optionalAuth, reconcile);

/**
 * GET /api/recovery/pending
 * Retrieve list of all transactions needing reconciliation
 */
router.get('/pending', getPending);

export default router;
