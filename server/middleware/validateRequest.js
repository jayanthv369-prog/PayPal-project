/**
 * Validation Middleware for common API request shapes
 */

export function validateRegisterInput(req, res, next) {
  const { name, email, password } = req.body;

  if (!name || typeof name !== 'string' || name.trim().length < 2) {
    return res.status(400).json({
      error: 'Validation Error',
      message: 'Name must be at least 2 characters long',
      field: 'name',
    });
  }

  if (!email || typeof email !== 'string' || !/^\S+@\S+\.\S+$/.test(email.trim())) {
    return res.status(400).json({
      error: 'Validation Error',
      message: 'A valid email address is required',
      field: 'email',
    });
  }

  if (!password || typeof password !== 'string' || password.length < 6) {
    return res.status(400).json({
      error: 'Validation Error',
      message: 'Password must be at least 6 characters long',
      field: 'password',
    });
  }

  req.body.name = name.trim();
  req.body.email = email.trim().toLowerCase();
  next();
}

export function validateLoginInput(req, res, next) {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({
      error: 'Validation Error',
      message: 'Both email and password are required',
    });
  }

  req.body.email = String(email).trim().toLowerCase();
  next();
}

export function validateWalletTransfer(req, res, next) {
  const { recipient, amount, pin, idempotencyKey } = req.body;

  const numAmount = parseFloat(amount);
  if (isNaN(numAmount) || numAmount <= 0) {
    return res.status(400).json({
      error: 'Validation Error',
      message: 'Amount must be a positive number',
      field: 'amount',
    });
  }

  if (!recipient || typeof recipient !== 'string' || !recipient.trim()) {
    return res.status(400).json({
      error: 'Validation Error',
      message: 'Recipient address or VPA is required',
      field: 'recipient',
    });
  }

  if (!pin || !/^\d{4,6}$/.test(String(pin))) {
    return res.status(400).json({
      error: 'Validation Error',
      message: 'Wallet PIN must be between 4 and 6 numeric digits',
      field: 'pin',
    });
  }

  req.body.amount = numAmount;
  req.body.recipient = recipient.trim();
  req.body.idempotencyKey = idempotencyKey || `IDEMP-WALLET-${Date.now()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
  next();
}

export default {
  validateRegisterInput,
  validateLoginInput,
  validateWalletTransfer,
};
