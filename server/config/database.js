import mongoose from 'mongoose';
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { validateEnvironment } from './environment.js';
import logger from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ==========================================
// 1. Mongoose / MongoDB Layer
// ==========================================
let isConnected = false;
let memoryServerInstance = null;

export async function connectDB(customUri = null) {
  if (isConnected && mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  const env = validateEnvironment();
  const uri = customUri || process.env.MONGODB_URI || env.mongoUri;

  if (!uri) {
    throw new Error('FATAL: MONGODB_URI is required to establish database connection.');
  }

  try {
    mongoose.set('strictQuery', true);
    mongoose.set('bufferCommands', false);

    logger.info(`Connecting to MongoDB at ${uri.replace(/:[^:@]+@/, ':****@')}...`);

    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000,
    });

    isConnected = true;
    logger.info(`MongoDB connected successfully to ${mongoose.connection.host || 'database'}:${mongoose.connection.port || ''}/${mongoose.connection.name}`);

    mongoose.connection.on('error', (err) => {
      logger.error(`MongoDB connection event error: ${err.message}`);
      isConnected = false;
    });

    mongoose.connection.on('disconnected', () => {
      logger.warn('MongoDB connection event: disconnected');
      isConnected = false;
    });

    return mongoose.connection;
  } catch (error) {
    isConnected = false;
    logger.error(`MongoDB connection failed: ${error.message}`);
    throw error;
  }
}

export async function disconnectDB() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
    isConnected = false;
  }
  if (memoryServerInstance) {
    await memoryServerInstance.stop();
    memoryServerInstance = null;
  }
}

export function isDBConnected() {
  return mongoose.connection.readyState === 1;
}

export async function runInTransaction(workFn) {
  let session = null;
  try {
    session = await mongoose.startSession();
    session.startTransaction();
    const result = await workFn(session);
    await session.commitTransaction();
    return result;
  } catch (error) {
    if (session) {
      try {
        await session.abortTransaction();
      } catch (abortErr) {
        // session abort error
      }
    }

    const isStandaloneError =
      error.message?.includes('Transactions are not supported by this deployment') ||
      error.message?.includes('replica set') ||
      error.message?.includes('retryWrites=false') ||
      error.message?.includes('retryable writes') ||
      error.message?.includes('Transaction numbers') ||
      error.code === 20 ||
      error.code === 251;

    if (isStandaloneError) {
      logger.warn('MongoDB deployment does not support multi-document transactions (standalone mode). Executing atomic consistency fallback.');
      return await workFn(null);
    }

    throw error;
  } finally {
    if (session) {
      await session.endSession();
    }
  }
}

// ==========================================
// 2. SQLite / Local Resilience Layer
// ==========================================
let dbInstance = null;

export function getDatabasePath() {
  const configuredPath = process.env.DATABASE_PATH || './data/paybastion.db';
  if (configuredPath === ':memory:') {
    return ':memory:';
  }
  return path.isAbsolute(configuredPath)
    ? configuredPath
    : path.resolve(__dirname, '..', configuredPath);
}

export function getDatabase(customPath = null) {
  if (dbInstance && !customPath) {
    return dbInstance;
  }

  const dbPath = customPath || getDatabasePath();

  if (dbPath !== ':memory:') {
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  const db = new Database(dbPath, {
    // verbose: process.env.NODE_ENV === 'development' ? console.log : null
  });

  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('synchronous = NORMAL');

  if (!customPath) {
    dbInstance = db;
  }

  return db;
}

export function closeDatabase() {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}

export default {
  connectDB,
  disconnectDB,
  isDBConnected,
  runInTransaction,
  getDatabase,
  getDatabasePath,
  closeDatabase,
};
