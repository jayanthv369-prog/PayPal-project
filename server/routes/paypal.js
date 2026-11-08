import express from 'express';
import {
  createOrder,
  captureOrder,
  getStatus,
  handleWebhook,
} from '../controllers/paypalController.js';
import { optionalAuth } from '../middleware/authMiddleware.js';

const router = express.Router();

/**
 * POST /api/paypal/create-order
 */
router.post('/create-order', optionalAuth, createOrder);

/**
 * POST /api/paypal/capture-order
 */
router.post('/capture-order', optionalAuth, captureOrder);

/**
 * GET /api/paypal/status/:orderId
 */
router.get('/status/:orderId', getStatus);

/**
 * POST /api/paypal/webhook
 */
router.post('/webhook', handleWebhook);

export default router;
