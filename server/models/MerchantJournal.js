import mongoose from 'mongoose';

const merchantJournalSchema = new mongoose.Schema(
  {
    journalId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    authId: {
      type: String,
      required: true,
      index: true,
    },
    terminalHoldId: {
      type: String,
      required: true,
    },
    senderId: {
      type: String,
      required: true,
    },
    recipientId: {
      type: String,
      required: true,
    },
    recipientName: {
      type: String,
      default: 'Merchant',
    },
    amount: {
      type: Number,
      required: true,
    },
    currency: {
      type: String,
      default: 'INR',
    },
    nonce: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    scannedAt: {
      type: Date,
      default: Date.now,
    },
    settlementStatus: {
      type: String,
      default: 'SETTLEMENT_PENDING',
    },
    signature: {
      type: String,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

export const MerchantJournal = mongoose.model('MerchantJournal', merchantJournalSchema);
export default MerchantJournal;
