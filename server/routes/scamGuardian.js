import express from 'express';
import { analyze } from '../controllers/scamGuardianController.js';
import { optionalAuth } from '../middleware/authMiddleware.js';

const router = express.Router();

/**
 * POST /api/scam-guardian/analyze
 */
router.post('/analyze', optionalAuth, analyze);

export default router;
