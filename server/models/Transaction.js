import mongoose from 'mongoose';
import { TRANSACTION_STATES } from '../utils/transactionState.js';

const transactionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    transactionId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    idempotencyKey: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    provider: {
      type: String,
      required: true,
      default: 'WALLET_SIMULATION',
      index: true,
    },
    providerTransactionId: {
      type: String,
      default: null,
    },
    amount: {
      type: Number,
      required: true,
      min: [0.01, 'Amount must be greater than zero'],
    },
    currency: {
      type: String,
      required: true,
      default: 'INR',
      uppercase: true,
    },
    sender: {
      type: String,
      default: null,
    },
    recipient: {
      type: String,
      required: true,
      index: true,
    },
    recipientName: {
      type: String,
      default: null,
    },
    category: {
      type: String,
      default: 'General Payment',
    },
    channel: {
      type: String,
      default: 'UPI_ONLINE',
    },
    status: {
      type: String,
      required: true,
      enum: Object.values(TRANSACTION_STATES),
      default: TRANSACTION_STATES.CREATED,
      index: true,
    },
    confidenceScore: {
      type: Number,
      default: 100,
    },
    failureReason: {
      type: String,
      default: null,
    },
    safeToRetry: {
      type: Boolean,
      default: false,
    },
    isSimulation: {
      type: Boolean,
      default: false,
    },
    userExplanation: {
      type: String,
      default: null,
    },
    technicalDiagnosis: {
      type: String,
      default: null,
    },
    reconciliationStatus: {
      type: String,
      default: 'NONE',
    },
    logs: [
      {
        timestamp: { type: Date, default: Date.now },
        event: String,
        detail: String,
      },
    ],
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

// Compound indexes for optimal querying
transactionSchema.index({ status: 1, createdAt: -1 });
transactionSchema.index({ recipient: 1, createdAt: -1 });
transactionSchema.index({ userId: 1, createdAt: -1 });

export const Transaction = mongoose.model('Transaction', transactionSchema);
export default Transaction;
