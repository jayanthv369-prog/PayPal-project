import mongoose from 'mongoose';

const reconciliationLogSchema = new mongoose.Schema(
  {
    transactionId: {
      type: String,
      required: true,
      index: true,
    },
    previousStatus: {
      type: String,
      required: true,
    },
    providerStatus: {
      type: String,
      required: true,
    },
    finalStatus: {
      type: String,
      required: true,
    },
    provider: {
      type: String,
      default: 'UNKNOWN',
    },
    providerReference: {
      type: String,
      default: null,
    },
    verificationTimestamp: {
      type: Date,
      default: Date.now,
      index: true,
    },
    details: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

export const ReconciliationLog = mongoose.model('ReconciliationLog', reconciliationLogSchema);
export default ReconciliationLog;
