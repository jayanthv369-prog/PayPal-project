const SENSITIVE_KEYS = [
  'password',
  'passwordhash',
  'pin',
  'pinhash',
  'jwt_secret',
  'secret',
  'paypal_client_secret',
  'offline_passport_secret',
  'authorization',
  'token',
  'creditcard',
  'cardnumber'
];

export function sanitize(data) {
  if (!data || typeof data !== 'object') {
    return data;
  }

  if (Array.isArray(data)) {
    return data.map(sanitize);
  }

  const clean = {};
  for (const [key, value] of Object.entries(data)) {
    const lowerKey = key.toLowerCase();
    const isSensitive = SENSITIVE_KEYS.some(k => lowerKey.includes(k));
    if (isSensitive) {
      clean[key] = '[REDACTED]';
    } else if (value && typeof value === 'object') {
      clean[key] = sanitize(value);
    } else {
      clean[key] = value;
    }
  }
  return clean;
}

export const logger = {
  info: (msg, meta) => {
    console.log(`[INFO] ${new Date().toISOString()} - ${msg}`, meta ? sanitize(meta) : '');
  },
  warn: (msg, meta) => {
    console.warn(`[WARN] ${new Date().toISOString()} - ${msg}`, meta ? sanitize(meta) : '');
  },
  error: (msg, meta) => {
    console.error(`[ERROR] ${new Date().toISOString()} - ${msg}`, meta ? sanitize(meta) : '');
  },
  debug: (msg, meta) => {
    if (process.env.NODE_ENV === 'development') {
      console.log(`[DEBUG] ${new Date().toISOString()} - ${msg}`, meta ? sanitize(meta) : '');
    }
  }
};

export default logger;
