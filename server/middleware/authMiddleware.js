import jwt from 'jsonwebtoken';
import { validateEnvironment } from '../config/environment.js';
import { isDBConnected } from '../config/database.js';
import { User } from '../models/User.js';

const env = validateEnvironment();

/**
 * Authentication Middleware
 * Validates JWT bearer token from Authorization header or cookie
 */
export async function requireAuth(req, res, next) {
  try {
    if (!isDBConnected()) {
      return res.status(503).json({
        error: 'Database unavailable',
        message: 'Database connection is not established. Please try again later.',
        code: 'DB_DISCONNECTED',
      });
    }

    let token = null;

    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    } else if (req.cookies && req.cookies.token) {
      token = req.cookies.token;
    }

    if (!token) {
      return res.status(401).json({
        error: 'Authentication required',
        message: 'No authorization token provided',
        code: 'UNAUTHORIZED',
      });
    }

    const decoded = jwt.verify(token, env.jwtSecret);
    const user = await User.findById(decoded.id).select('-passwordHash');

    if (!user) {
      return res.status(401).json({
        error: 'Invalid token',
        message: 'User belonging to this token no longer exists',
        code: 'USER_NOT_FOUND',
      });
    }

    req.user = user;
    req.userId = user._id.toString();
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({
        error: 'Token expired',
        message: 'Your session has expired. Please log in again.',
        code: 'TOKEN_EXPIRED',
      });
    }
    return res.status(401).json({
      error: 'Invalid token',
      message: 'Token verification failed',
      code: 'INVALID_TOKEN',
    });
  }
}

/**
 * Optional Authentication Middleware
 * If valid token is present, attaches user to req.user; otherwise proceeds anonymously.
 */
export async function optionalAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      const decoded = jwt.verify(token, env.jwtSecret);
      const user = await User.findById(decoded.id).select('-passwordHash');
      if (user) {
        req.user = user;
        req.userId = user._id.toString();
      }
    }
  } catch (err) {
    // Ignore error for optional auth
  }
  next();
}

export default requireAuth;
