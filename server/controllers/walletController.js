import { walletService } from '../services/walletService.js';

export async function getBalance(req, res) {
  try {
    const wallet = await walletService.getWallet(req.userId);
    res.json({
      success: true,
      wallet: {
        id: wallet._id,
        balance: wallet.balance,
        currency: wallet.currency,
        isSimulated: wallet.isSimulated,
        hasPin: Boolean(wallet.pinHash),
        disclaimer: wallet.disclaimer,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export async function setPin(req, res) {
  try {
    const { pin } = req.body;
    if (!pin) {
      return res.status(400).json({ error: 'PIN is required' });
    }
    const result = await walletService.setPin(req.userId, pin);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

export async function verifyPin(req, res) {
  try {
    const { pin } = req.body;
    if (!pin) {
      return res.status(400).json({ error: 'PIN is required' });
    }
    const result = await walletService.verifyPin(req.userId, pin);
    if (!result.verified) {
      return res.status(401).json({ error: 'Invalid wallet PIN', verified: false });
    }
    res.json({ success: true, verified: true, message: 'PIN verified successfully' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

export async function addDemoFunds(req, res) {
  try {
    const { amount } = req.body;
    const result = await walletService.addDemoFunds(req.userId, amount || 1000);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

export async function transfer(req, res) {
  try {
    const { recipient, recipientName, amount, pin, idempotencyKey, note } = req.body;
    const result = await walletService.transferFunds({
      userId: req.userId,
      recipient,
      recipientName,
      amount,
      pin,
      idempotencyKey,
      note,
    });
    res.json(result);
  } catch (err) {
    const status = err.statusCode || 400;
    res.status(status).json({
      error: err.message,
      code: err.code || 'TRANSFER_FAILED',
    });
  }
}

export async function getTransactions(req, res) {
  try {
    const { page, limit, status } = req.query;
    const result = await walletService.getTransactions(req.userId, { page, limit, status });
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export async function getReceipt(req, res) {
  try {
    const { transactionId } = req.params;
    const receipt = await walletService.getReceipt(req.userId, transactionId);
    res.json({ success: true, receipt });
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
}

export default {
  getBalance,
  setPin,
  verifyPin,
  addDemoFunds,
  transfer,
  getTransactions,
  getReceipt,
};
