import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import { fileURLToPath } from 'url';

import { validateEnvironment } from './config/environment.js';
import { connectDB, isDBConnected } from './config/database.js';
import { initializeDatabase, getDatabase } from './database/init.js';
import { apiRateLimiter } from './middleware/rateLimiter.js';
import { errorHandler } from './middleware/errorHandler.js';
import logger from './utils/logger.js';

// Route imports
import authRoutes from './routes/auth.js';
import walletRoutes from './routes/wallet.js';
import transactionsRoutes from './routes/transactions.js';
import dashboardRoutes from './routes/dashboard.js';
import paypalRoutes from './routes/paypal.js';
import offlineRoutes from './routes/offline.js';
import recoveryRoutes from './routes/recovery.js';
import scamGuardianRoutes from './routes/scamGuardian.js';
import aiExplainerRoutes from './routes/aiExplainer.js';
import creditRoutes from './routes/credit.js';
import simulationRoutes from './routes/simulation.js';

const env = validateEnvironment();
const app = express();
const PORT = env.port;

// Initialize Database Connections
// 1. Connect MongoDB via Mongoose
try {
  await connectDB(env.mongoUri);
  logger.info('MongoDB database connection verified and operational.');
} catch (mongoErr) {
  logger.error(`FATAL: MongoDB connection failure during server startup: ${mongoErr.message}`);
  logger.error('The server cannot safely start without an established MongoDB connection. Please check MONGODB_URI and verify MongoDB is running.');
  process.exit(1);
}

// 2. Initialize Local Resilience Journal & Seed Data
try {
  initializeDatabase();
  logger.info('Local resilience database initialized successfully.');
} catch (dbErr) {
  logger.error('Database initialization error:', dbErr);
  process.exit(1);
}

// Security Middleware
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

const allowedOrigins = [
  env.clientOrigin,
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:3000',
];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps, curl, server-to-server)
    if (!origin || allowedOrigins.includes(origin) || origin.startsWith('http://localhost:')) {
      return callback(null, true);
    }
    return callback(null, true); // Permissive in dev for smooth pair evaluation
  },
  credentials: true,
}));

// Body parsing with safe size limit (1mb)
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Global Rate Limiting for API routes
app.use('/api', apiRateLimiter);

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/transactions', transactionsRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/paypal', paypalRoutes);
app.use('/api/offline', offlineRoutes);
app.use('/api/recovery', recoveryRoutes);
app.use('/api/scam-guardian', scamGuardianRoutes);
app.use('/api/ai', aiExplainerRoutes);
app.use('/api/credit', creditRoutes);
app.use('/api/simulation', simulationRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  const isMongoConnected = isDBConnected();
  const dbStatus = isMongoConnected ? 'connected' : 'disconnected';
  let sqliteStatus = 'disconnected';

  try {
    const db = getDatabase();
    const check = db.prepare('SELECT 1 as alive').get();
    if (check && check.alive === 1) {
      sqliteStatus = 'connected';
    }
  } catch (e) {
    sqliteStatus = 'error';
  }

  const statusCode = isMongoConnected ? 200 : 503;

  res.status(statusCode).json({
    success: isMongoConnected,
    server: 'running',
    database: dbStatus,
    status: isMongoConnected ? 'healthy' : 'degraded',
    platform: 'PayBastion AI Resilience Gateway',
    timestamp: new Date().toISOString(),
    databases: {
      mongodb: dbStatus,
      sqlite: sqliteStatus,
    },
    paypalConfigured: env.paypalConfigured,
    geminiConfigured: env.geminiConfigured,
    mode: env.paypalMode,
  });
});

// Centralized error handler
app.use(errorHandler);

const isDirectRun = process.argv[1] && (
  process.argv[1].endsWith('index.js') || process.argv[1].endsWith('server')
);

if (process.env.NODE_ENV !== 'test' && isDirectRun) {
  app.listen(PORT, () => {
    logger.info(`🛡️  PayBastion AI Resilience Server running on http://localhost:${PORT}`);
    logger.info(`📡 MongoDB Database Status: ${isDBConnected() ? 'CONNECTED' : 'DISCONNECTED'}`);
    logger.info(`📡 Ready to handle Auth, Wallet, Recovery, Offline Passports, PayPal Sandbox & AI Services.`);
  });
}

export default app;
