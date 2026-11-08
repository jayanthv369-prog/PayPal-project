import dotenv from 'dotenv';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Explicitly load server/.env first, then root .env if present
const serverEnvPath = path.resolve(__dirname, '..', '.env');
if (fs.existsSync(serverEnvPath)) {
  dotenv.config({ path: serverEnvPath });
}
dotenv.config();

let dynamicPassportSecret = null;
let dynamicJwtSecret = null;

export function validateEnvironment() {
  const nodeEnv = process.env.NODE_ENV || 'development';
  const isProduction = nodeEnv === 'production';
  const port = parseInt(process.env.PORT, 10) || 5000;

  // MongoDB URI
  const mongoUri = process.env.MONGODB_URI ? process.env.MONGODB_URI.trim() : '';
  if (!mongoUri) {
    throw new Error('FATAL: MONGODB_URI environment variable is required. Please set MONGODB_URI in your .env configuration.');
  }

  // JWT Secret
  let jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    if (isProduction) {
      throw new Error('FATAL: JWT_SECRET environment variable is mandatory in production mode.');
    }
    if (!dynamicJwtSecret) {
      dynamicJwtSecret = crypto.randomBytes(32).toString('hex');
      console.warn('⚠️  JWT_SECRET not provided in development; generated an ephemeral 256-bit secret.');
    }
    jwtSecret = dynamicJwtSecret;
  }

  const jwtExpiresIn = process.env.JWT_EXPIRES_IN || '24h';

  // Offline Passport Secret
  let offlinePassportSecret = process.env.OFFLINE_PASSPORT_SECRET;
  if (!offlinePassportSecret || offlinePassportSecret === 'paybastion_master_auth_secret_k9x2m4p8z1') {
    if (isProduction) {
      throw new Error('FATAL: OFFLINE_PASSPORT_SECRET must be configured with a secure private key in production.');
    }
    if (!dynamicPassportSecret) {
      dynamicPassportSecret = crypto.randomBytes(32).toString('hex');
      console.warn('⚠️  OFFLINE_PASSPORT_SECRET not explicitly set; generated strong ephemeral 256-bit secret.');
    }
    offlinePassportSecret = dynamicPassportSecret;
  }

  // PayPal Configuration
  const paypalClientId = process.env.PAYPAL_CLIENT_ID || '';
  const paypalClientSecret = process.env.PAYPAL_CLIENT_SECRET || '';
  const paypalMode = process.env.PAYPAL_MODE || 'sandbox';

  const paypalConfigured = Boolean(
    paypalClientId &&
    paypalClientSecret &&
    paypalClientId !== 'your_paypal_sandbox_client_id_here' &&
    paypalClientSecret !== 'your_paypal_sandbox_client_secret_here'
  );

  // Gemini Configuration
  const geminiApiKey = process.env.GEMINI_API_KEY || '';
  const geminiConfigured = Boolean(
    geminiApiKey &&
    geminiApiKey !== 'your_gemini_api_key_here'
  );

  const clientOrigin = process.env.CLIENT_URL || process.env.CLIENT_ORIGIN || 'http://localhost:5173';

  return {
    nodeEnv,
    isProduction,
    port,
    mongoUri,
    jwtSecret,
    jwtExpiresIn,
    offlinePassportSecret,
    paypalMode,
    paypalClientId,
    paypalClientSecret,
    paypalConfigured,
    geminiApiKey,
    geminiConfigured,
    clientOrigin,
    clientUrl: clientOrigin,
  };
}

export const env = validateEnvironment();
export default env;
