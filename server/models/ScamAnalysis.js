import mongoose from 'mongoose';

const scamAnalysisSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    transactionId: {
      type: String,
      default: null,
      index: true,
    },
    recipient: {
      type: String,
      default: null,
    },
    amount: {
      type: Number,
      default: 0,
    },
    rawPayload: {
      type: String,
      default: null,
    },
    riskScore: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
    },
    riskLevel: {
      type: String,
      required: true,
      enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
      index: true,
    },
    detectedReasons: {
      type: [String],
      default: [],
    },
    recommendations: {
      type: [String],
      default: [],
    },
    requiresConfirmation: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

export const ScamAnalysis = mongoose.model('ScamAnalysis', scamAnalysisSchema);
export default ScamAnalysis;
