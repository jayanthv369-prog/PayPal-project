import express from 'express';
import {
  explainState,
  parseVoice,
  explainScam,
} from '../controllers/aiController.js';
import { optionalAuth } from '../middleware/authMiddleware.js';

const router = express.Router();

/**
 * POST /api/ai/explain-state
 */
router.post('/explain-state', explainState);

/**
 * POST /api/ai/parse-voice
 */
router.post('/parse-voice', parseVoice);

/**
 * POST /api/ai/explain-scam
 */
router.post('/explain-scam', explainScam);

export default router;
