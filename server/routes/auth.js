import express from 'express';
import {
  register,
  login,
  logout,
  getMe,
} from '../controllers/authController.js';
import { requireAuth } from '../middleware/authMiddleware.js';
import { authRateLimiter } from '../middleware/rateLimiter.js';
import {
  validateRegisterInput,
  validateLoginInput,
} from '../middleware/validateRequest.js';

const router = express.Router();

/**
 * POST /api/auth/register
 */
router.post('/register', authRateLimiter, validateRegisterInput, register);

/**
 * POST /api/auth/login
 */
router.post('/login', authRateLimiter, validateLoginInput, login);

/**
 * POST /api/auth/logout
 */
router.post('/logout', logout);

/**
 * GET /api/auth/me
 */
router.get('/me', requireAuth, getMe);

export default router;
