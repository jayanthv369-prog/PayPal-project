import mongoose from 'mongoose';

export const OFFLINE_PASSPORT_STATES = {
  AUTHORIZED: 'AUTHORIZED',
  ACCEPTED_FOR_SETTLEMENT: 'ACCEPTED_FOR_SETTLEMENT',
  SETTLEMENT_PENDING: 'SETTLEMENT_PENDING',
  SETTLED: 'SETTLED',
  REJECTED: 'REJECTED',
  EXPIRED: 'EXPIRED',
};

const offlinePassportSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    passportId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    senderId: {
      type: String,
      default: 'user-ananya@paybastion',
    },
    recipient: {
      type: String,
      required: true,
    },
    recipientName: {
      type: String,
      default: 'Merchant Terminal',
    },
    amount: {
      type: Number,
      required: true,
      min: [0.01, 'Amount must be greater than zero'],
      max: [2000, 'Offline authorization ceiling is capped at INR 2,000'],
    },
    currency: {
      type: String,
      required: true,
      default: 'INR',
    },
    nonce: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: true,
    },
    signature: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      required: true,
      enum: Object.values(OFFLINE_PASSPORT_STATES),
      default: OFFLINE_PASSPORT_STATES.AUTHORIZED,
      index: true,
    },
    settlementStatus: {
      type: String,
      default: 'SETTLEMENT_PENDING',
    },
    isFinalSettlement: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

export const OfflinePassport = mongoose.model('OfflinePassport', offlinePassportSchema);
export default OfflinePassport;
