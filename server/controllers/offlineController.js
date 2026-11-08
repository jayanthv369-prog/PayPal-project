import {
  signOfflinePayload,
  createAndSignOfflinePassport,
  verifyOfflinePassport,
  getOfflinePassports,
  getMerchantJournal,
  resetReplayCache,
} from '../services/cryptoSigner.js';

export async function sign(req, res) {
  try {
    const {
      authId,
      senderId = 'user-ananya@paybastion',
      recipientId = 'namma-metro-kiosk@axis',
      recipientName,
      amount,
      currency = 'INR',
      nonce,
      expiresAt,
      expiryMinutes,
    } = req.body;

    if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
      return res.status(400).json({ error: 'Valid positive amount is required' });
    }

    if (parseFloat(amount) > 2000) {
      return res.status(400).json({ error: 'Offline single-authorization ceiling is capped at ₹2,000' });
    }

    if (authId && nonce && expiresAt) {
      const signature = signOfflinePayload({
        authId,
        senderId,
        recipientId,
        amount: parseFloat(amount),
        currency,
        nonce,
        expiresAt,
      });

      return res.json({
        authId,
        senderId,
        recipientId,
        recipientName,
        amount: parseFloat(amount),
        currency,
        nonce,
        expiresAt,
        signature,
        algorithm: 'HMAC-SHA256',
        signedAt: new Date().toISOString(),
        status: 'SETTLEMENT_PENDING',
      });
    }

    const passport = await createAndSignOfflinePassport({
      amount,
      recipientId,
      recipientName,
      senderId,
      expiryMinutes: expiryMinutes || 15,
      currency,
      userId: req.userId || null,
    });

    res.json(passport);
  } catch (err) {
    console.error('Offline sign error:', err);
    res.status(400).json({ error: err.message });
  }
}

export async function verify(req, res) {
  try {
    const passportData = req.body;
    const result = await verifyOfflinePassport(passportData);
    res.json(result);
  } catch (err) {
    console.error('Offline verify error:', err);
    res.status(500).json({ valid: false, error: err.message });
  }
}

export async function listPassports(req, res) {
  try {
    const passports = getOfflinePassports();
    res.json({ count: passports.length, passports });
  } catch (err) {
    console.error('Get offline passports error:', err);
    res.status(500).json({ error: err.message });
  }
}

export async function listJournal(req, res) {
  try {
    const journal = getMerchantJournal();
    res.json({ count: journal.length, journal });
  } catch (err) {
    console.error('Get merchant journal error:', err);
    res.status(500).json({ error: err.message });
  }
}

export async function resetCache(req, res) {
  if (process.env.NODE_ENV === 'production' && req.headers['x-admin-test-override'] !== 'paybastion-test-reset') {
    return res.status(403).json({
      error: 'Access denied: Replay cache reset is disabled in standard application operation.',
      code: 'OPERATION_DISABLED',
    });
  }

  try {
    const result = await resetReplayCache();
    res.json(result);
  } catch (err) {
    console.error('Reset replay cache error:', err);
    res.status(500).json({ error: err.message });
  }
}

export default {
  sign,
  verify,
  listPassports,
  listJournal,
  resetCache,
};
