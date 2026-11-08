import rateLimit from 'express-rate-limit';

const isTest = process.env.NODE_ENV === 'test';

export const apiRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isTest ? 10000 : 500, // Limit each IP
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many requests from this IP, please try again after 15 minutes',
    code: 'RATE_LIMIT_EXCEEDED',
  },
});

export const strictActionLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: isTest ? 10000 : 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Action velocity rate limit exceeded. Please slow down payment operations.',
    code: 'VELOCITY_LIMIT_EXCEEDED',
  },
});

export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isTest ? 10000 : 20, // 20 login attempts per 15 min
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many authentication attempts. Please try again after 15 minutes.',
    code: 'AUTH_RATE_LIMIT_EXCEEDED',
  },
});

export const pinRateLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: isTest ? 10000 : 10, // 10 PIN attempts per 5 min
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many PIN verification attempts. Wallet access temporarily locked for 5 minutes.',
    code: 'PIN_LOCKED_RATE_LIMIT',
  },
});

export default {
  apiRateLimiter,
  strictActionLimiter,
  authRateLimiter,
  pinRateLimiter,
};
