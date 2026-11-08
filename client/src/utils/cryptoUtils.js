// WebCrypto Client-side HMAC & Nonce utilities
// Enables cryptographic offline token signing in-browser even when 100% disconnected from the internet!

const DEFAULT_SECRET = 'paybastion_master_auth_secret_k9x2m4p8z1';

/**
 * Generate a cryptographically secure UUID / Nonce
 */
export function generateNonce() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'nonce-' + Math.random().toString(36).substring(2, 15) + '-' + Date.now().toString(36);
}

/**
 * Generate a unique PayBastion Authorization ID
 */
export function generateAuthId() {
  return `AUTH-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
}

/**
 * Client-side HMAC-SHA256 signing using browser Web Crypto API
 */
export async function signPayloadWebCrypto(payload, secretKey = DEFAULT_SECRET) {
  const enc = new TextEncoder();
  const serialized = [
    payload.authId,
    payload.senderId,
    payload.recipientId,
    payload.amount,
    payload.currency || 'INR',
    payload.nonce,
    payload.expiresAt,
  ].join('|');

  const keyData = enc.encode(secretKey);
  const cryptoKey = await window.crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );

  const signatureBuffer = await window.crypto.subtle.sign(
    'HMAC',
    cryptoKey,
    enc.encode(serialized)
  );

  // Convert buffer to hex string
  return Array.from(new Uint8Array(signatureBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Verify HMAC signature in browser Web Crypto
 */
export async function verifySignatureWebCrypto(payload, signatureHex, secretKey = DEFAULT_SECRET) {
  try {
    const enc = new TextEncoder();
    const serialized = [
      payload.authId,
      payload.senderId,
      payload.recipientId,
      payload.amount,
      payload.currency || 'INR',
      payload.nonce,
      payload.expiresAt,
    ].join('|');

    const keyData = enc.encode(secretKey);
    const cryptoKey = await window.crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );

    // Convert hex string to Uint8Array
    const match = signatureHex.match(/.{1,2}/g);
    if (!match) return false;
    const sigBytes = new Uint8Array(match.map(byte => parseInt(byte, 16)));

    return await window.crypto.subtle.verify(
      'HMAC',
      cryptoKey,
      sigBytes,
      enc.encode(serialized)
    );
  } catch (err) {
    console.error('Signature verification error:', err);
    return false;
  }
}
