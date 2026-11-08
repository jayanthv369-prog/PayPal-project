import express from 'express';
import {
  sign,
  verify,
  listPassports,
  listJournal,
  resetCache,
} from '../controllers/offlineController.js';
import { optionalAuth } from '../middleware/authMiddleware.js';

const router = express.Router();

/**
 * POST /api/offline/sign
 */
router.post('/sign', optionalAuth, sign);

/**
 * POST /api/offline/verify
 */
router.post('/verify', verify);

/**
 * GET /api/offline/passports
 */
router.get('/passports', listPassports);

/**
 * GET /api/offline/journal
 */
router.get('/journal', listJournal);

/**
 * POST /api/offline/reset-replay-cache
 */
router.post('/reset-replay-cache', resetCache);

export default router;
