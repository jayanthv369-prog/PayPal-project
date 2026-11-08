import { Wallet } from '../models/Wallet.js';
import { Transaction } from '../models/Transaction.js';
import { AuditLog } from '../models/AuditLog.js';
import { TRANSACTION_STATES } from '../utils/transactionState.js';
import { idempotencyManager } from '../utils/idempotency.js';
import { runInTransaction } from '../config/database.js';

export const walletService = {
  /**
   * Get wallet for user; creates if missing
   */
  async getWallet(userId) {
    let wallet = await Wallet.findOne({ userId });
    if (!wallet) {
      wallet = await Wallet.create({
        userId,
        balance: 5000,
        currency: 'INR',
        isSimulated: true,
      });
    }
    return wallet;
  },

  /**
   * Set wallet PIN (hashed with bcrypt)
   */
  async setPin(userId, pin) {
    if (!/^\d{4,6}$/.test(String(pin))) {
      throw new Error('PIN must be 4 to 6 digits');
    }
    const wallet = await this.getWallet(userId);
    await wallet.setPin(pin);

    await AuditLog.create({
      userId,
      action: 'WALLET_SET_PIN',
      resourceId: wallet._id.toString(),
      details: { timestamp: new Date() },
    });

    return { success: true, message: 'Wallet PIN set successfully' };
  },

  /**
   * Verify wallet PIN
   */
  async verifyPin(userId, pin) {
    const wallet = await this.getWallet(userId);
    if (!wallet.pinHash) {
      return { verified: false, hasPin: false, message: 'Wallet PIN is not set yet' };
    }
    const isMatch = await wallet.comparePin(pin);
    return { verified: isMatch, hasPin: true };
  },

  /**
   * Add demo funds (strictly simulated funds)
   */
  async addDemoFunds(userId, amount) {
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      throw new Error('Amount must be a positive number');
    }
    if (numAmount > 100000) {
      throw new Error('Maximum demo deposit ceiling is ₹100,000 per request');
    }

    const wallet = await Wallet.findOneAndUpdate(
      { userId },
      { $inc: { balance: numAmount } },
      { new: true, upsert: true }
    );

    const txId = `SIM-DEP-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

    // Immutable transaction ledger entry
    const txn = await Transaction.create({
      userId,
      transactionId: txId,
      idempotencyKey: `IDEMP-${txId}`,
      provider: 'WALLET_SIMULATION',
      amount: numAmount,
      currency: wallet.currency,
      sender: 'PayBastion Demo Faucet',
      recipient: `user-${userId}`,
      recipientName: 'My Wallet',
      category: 'Simulated Demo Deposit',
      channel: 'DEMO_FAUCET',
      status: TRANSACTION_STATES.CONFIRMED,
      confidenceScore: 100,
      isSimulation: true,
      userExplanation: 'Simulated demo funds credited to your test wallet.',
      technicalDiagnosis: `Faucet credit of ₹${numAmount} executed atomically.`,
      logs: [
        {
          timestamp: new Date(),
          event: 'DEMO_FUNDS_ADDED',
          detail: `Credited ₹${numAmount} simulated funds to test wallet`,
        },
      ],
    });

    await AuditLog.create({
      userId,
      action: 'WALLET_ADD_DEMO_FUNDS',
      resourceId: wallet._id.toString(),
      details: { amount: numAmount, transactionId: txId },
    });

    return {
      success: true,
      wallet: {
        balance: wallet.balance,
        currency: wallet.currency,
        isSimulated: wallet.isSimulated,
      },
      transaction: txn,
      message: `Successfully credited ₹${numAmount.toLocaleString('en-IN')} simulated demo funds.`,
    };
  },

  /**
   * Send simulated money to recipient
   * Atomic double-spending protection, idempotency, PIN verification
   */
  async transferFunds({ userId, recipient, recipientName, amount, pin, idempotencyKey, note }) {
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      throw new Error('Amount must be a positive number');
    }

    // Check cached idempotency
    const cached = idempotencyManager.getCachedResponse(idempotencyKey);
    if (cached) {
      return { ...cached, duplicatePrevented: true };
    }

    // Check DB for duplicate idempotencyKey
    const existingTxn = await Transaction.findOne({ idempotencyKey });
    if (existingTxn) {
      return {
        success: true,
        duplicatePrevented: true,
        transaction: existingTxn,
        message: 'Duplicate payment request detected and prevented via idempotency key.',
      };
    }

    // Acquire lock
    const lockAcquired = idempotencyManager.acquireLock(idempotencyKey);
    if (!lockAcquired) {
      const error = new Error('Payment with this idempotency key is already in progress');
      error.statusCode = 409;
      error.code = 'CONCURRENT_REQUEST';
      throw error;
    }

    try {
      // 1. PIN verification
      const wallet = await this.getWallet(userId);
      if (!wallet.pinHash) {
        throw new Error('Please set a wallet PIN before initiating simulated payments');
      }
      const isPinValid = await wallet.comparePin(pin);
      if (!isPinValid) {
        const pinErr = new Error('Invalid wallet PIN');
        pinErr.statusCode = 401;
        pinErr.code = 'INVALID_PIN';
        throw pinErr;
      }

      // 2. Check sufficient balance
      if (wallet.balance < numAmount) {
        const balErr = new Error(`Insufficient simulated wallet balance. Available: ₹${wallet.balance}`);
        balErr.statusCode = 400;
        balErr.code = 'INSUFFICIENT_FUNDS';
        throw balErr;
      }

      // 3. Atomic debit and transaction creation
      const txId = `TXN-WLT-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

      const transferResult = await runInTransaction(async (session) => {
        // Atomic deduction with balance condition to prevent race conditions / double debits
        const opts = session ? { session, new: true } : { new: true };
        const updatedWallet = await Wallet.findOneAndUpdate(
          { userId, balance: { $gte: numAmount } },
          { $inc: { balance: -numAmount } },
          opts
        );

        if (!updatedWallet) {
          throw new Error('Insufficient wallet balance or concurrent modification detected');
        }

        const txnDocs = await Transaction.create(
          [
            {
              userId,
              transactionId: txId,
              idempotencyKey,
              provider: 'WALLET_SIMULATION',
              amount: numAmount,
              currency: updatedWallet.currency,
              sender: `user-${userId}`,
              recipient,
              recipientName: recipientName || recipient,
              category: note || 'Simulated Wallet Payment',
              channel: 'WALLET_SIMULATION',
              status: TRANSACTION_STATES.CONFIRMED,
              confidenceScore: 100,
              isSimulation: true,
              userExplanation: `Simulated payment of ₹${numAmount} successfully sent to ${recipientName || recipient}.`,
              technicalDiagnosis: `Atomic balance deduction verified. New balance: ₹${updatedWallet.balance}.`,
              safeToRetry: false,
              logs: [
                {
                  timestamp: new Date(),
                  event: 'WALLET_PAYMENT_INITIATED',
                  detail: `Debit ₹${numAmount} requested for ${recipient}`,
                },
                {
                  timestamp: new Date(),
                  event: 'WALLET_PAYMENT_CONFIRMED',
                  detail: `Atomic debit confirmed. Idempotency lock released.`,
                },
              ],
            },
          ],
          session ? { session } : {}
        );

        const txn = txnDocs[0];

        await AuditLog.create(
          [
            {
              userId,
              action: 'WALLET_PAYMENT_SUCCESS',
              resourceId: txn.transactionId,
              details: {
                amount: numAmount,
                recipient,
                remainingBalance: updatedWallet.balance,
              },
            },
          ],
          session ? { session } : {}
        );

        return {
          success: true,
          transaction: txn,
          wallet: {
            balance: updatedWallet.balance,
            currency: updatedWallet.currency,
            isSimulated: updatedWallet.isSimulated,
          },
          message: `Simulated transfer of ₹${numAmount.toLocaleString('en-IN')} confirmed.`,
        };
      });

      // Cache resolved idempotency response
      idempotencyManager.resolveKey(idempotencyKey, transferResult);

      return transferResult;
    } finally {
      idempotencyManager.releaseLock(idempotencyKey);
    }
  },

  /**
   * Get transaction history for user
   */
  async getTransactions(userId, { page = 1, limit = 20, status = 'ALL' } = {}) {
    const query = { userId };
    if (status && status !== 'ALL') {
      query.status = status;
    }

    const skip = (Math.max(1, parseInt(page, 10)) - 1) * Math.min(100, parseInt(limit, 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));

    const [transactions, total] = await Promise.all([
      Transaction.find(query).sort({ createdAt: -1 }).skip(skip).limit(limitNum),
      Transaction.countDocuments(query),
    ]);

    return {
      transactions,
      pagination: {
        page: parseInt(page, 10),
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    };
  },

  /**
   * Get transaction receipt by transaction ID
   */
  async getReceipt(userId, transactionId) {
    const txn = await Transaction.findOne({
      transactionId,
      $or: [{ userId }, { userId: null }],
    });

    if (!txn) {
      throw new Error('Transaction receipt not found');
    }

    return {
      receiptId: `REC-${txn.transactionId}`,
      transactionId: txn.transactionId,
      idempotencyKey: txn.idempotencyKey,
      amount: txn.amount,
      currency: txn.currency,
      sender: txn.sender,
      recipient: txn.recipient,
      recipientName: txn.recipientName,
      status: txn.status,
      confidenceScore: txn.confidenceScore,
      createdAt: txn.createdAt,
      isSimulation: txn.isSimulation,
      disclaimer: txn.isSimulation
        ? 'SIMULATED TRANSACTION RECEIPT: For demonstration & resilience testing purposes only.'
        : 'PAYBASTION VERIFIED RECEIPT',
    };
  },
};

export default walletService;
