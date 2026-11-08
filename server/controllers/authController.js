import jwt from 'jsonwebtoken';
import { User } from '../models/User.js';
import { Wallet } from '../models/Wallet.js';
import { AuditLog } from '../models/AuditLog.js';
import { validateEnvironment } from '../config/environment.js';
import { isDBConnected, runInTransaction } from '../config/database.js';

const env = validateEnvironment();

function generateToken(userId) {
  return jwt.sign({ id: userId }, env.jwtSecret, {
    expiresIn: env.jwtExpiresIn,
  });
}

/**
 * Register a new user and initialize a simulated wallet
 */
export async function register(req, res) {
  try {
    if (!isDBConnected()) {
      return res.status(503).json({
        error: 'Database unavailable',
        message: 'MongoDB connection is not established. Please try again later.',
        code: 'DB_DISCONNECTED',
      });
    }

    const { name, email, password } = req.body;
    const normalizedEmail = String(email || '').toLowerCase().trim();

    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      return res.status(409).json({
        error: 'Registration failed',
        message: 'A user with this email address already exists',
        code: 'USER_EXISTS',
      });
    }

    const passwordHash = await User.hashPassword(password);
    let user = null;
    let wallet = null;

    try {
      await runInTransaction(async (session) => {
        const userDocs = await User.create(
          [{
            name: String(name || '').trim(),
            email: normalizedEmail,
            passwordHash,
          }],
          session ? { session } : {}
        );
        user = userDocs[0];

        try {
          const walletDocs = await Wallet.create(
            [{
              userId: user._id,
              balance: 5000,
              currency: 'INR',
              isSimulated: true,
              disclaimer: 'SIMULATED DEMO FUNDS: These funds are educational mock balances for PayBastion testing and have zero real monetary value.',
            }],
            session ? { session } : {}
          );
          wallet = walletDocs[0];
        } catch (walletErr) {
          if (!session && user) {
            // Standalone rollback: clean up user if wallet provisioning fails
            await User.deleteOne({ _id: user._id }).catch(() => {});
          }
          throw walletErr;
        }
      });
    } catch (createErr) {
      if (user && !wallet) {
        await User.deleteOne({ _id: user._id }).catch(() => {});
      }
      throw createErr;
    }

    const token = generateToken(user._id);

    // Audit Log (safely created, non-blocking for response)
    AuditLog.create({
      userId: user._id,
      action: 'USER_REGISTER',
      resourceId: user._id.toString(),
      details: { email: user.email },
      ipAddress: req.ip,
    }).catch(() => {});

    res.status(201).json({
      success: true,
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        createdAt: user.createdAt,
      },
      wallet: {
        id: wallet._id,
        balance: wallet.balance,
        currency: wallet.currency,
        isSimulated: wallet.isSimulated,
        hasPin: Boolean(wallet.pinHash),
      },
      message: 'User registered successfully. Simulated demo wallet provisioned with ₹5,000.',
    });
  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({ error: 'Registration error', message: err.message });
  }
}

/**
 * Login user and issue JWT
 */
export async function login(req, res) {
  try {
    if (!isDBConnected()) {
      return res.status(503).json({
        error: 'Database unavailable',
        message: 'MongoDB connection is not established. Please try again later.',
        code: 'DB_DISCONNECTED',
      });
    }

    const { email, password } = req.body;
    const normalizedEmail = String(email || '').toLowerCase().trim();

    const user = await User.findOne({ email: normalizedEmail });
    if (!user) {
      return res.status(401).json({
        error: 'Authentication failed',
        message: 'Invalid email or password',
        code: 'INVALID_CREDENTIALS',
      });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({
        error: 'Authentication failed',
        message: 'Invalid email or password',
        code: 'INVALID_CREDENTIALS',
      });
    }

    // Ensure wallet exists
    let wallet = await Wallet.findOne({ userId: user._id });
    if (!wallet) {
      wallet = await Wallet.create({
        userId: user._id,
        balance: 5000,
        currency: 'INR',
        isSimulated: true,
      });
    }

    const token = generateToken(user._id);

    // Audit Log (safely created, non-blocking)
    AuditLog.create({
      userId: user._id,
      action: 'USER_LOGIN',
      resourceId: user._id.toString(),
      ipAddress: req.ip,
    }).catch(() => {});

    res.json({
      success: true,
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        createdAt: user.createdAt,
      },
      wallet: {
        id: wallet._id,
        balance: wallet.balance,
        currency: wallet.currency,
        isSimulated: wallet.isSimulated,
        hasPin: Boolean(wallet.pinHash),
      },
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login error', message: err.message });
  }
}

/**
 * Logout user
 */
export async function logout(req, res) {
  res.json({
    success: true,
    message: 'Logged out successfully. Remove client token to finalize.',
  });
}

/**
 * Get current authenticated user profile & wallet
 */
export async function getMe(req, res) {
  try {
    const user = req.user;
    const wallet = await Wallet.findOne({ userId: user._id });

    res.json({
      success: true,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        createdAt: user.createdAt,
      },
      wallet: wallet
        ? {
            id: wallet._id,
            balance: wallet.balance,
            currency: wallet.currency,
            isSimulated: wallet.isSimulated,
            hasPin: Boolean(wallet.pinHash),
            disclaimer: wallet.disclaimer,
          }
        : null,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export default {
  register,
  login,
  logout,
  getMe,
};
