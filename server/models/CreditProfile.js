import mongoose from 'mongoose';

const creditProfileSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    userName: {
      type: String,
      required: true,
    },
    creditLimit: {
      type: Number,
      required: true,
      default: 5000,
    },
    utilizedCredit: {
      type: Number,
      required: true,
      default: 0,
    },
    availableCredit: {
      type: Number,
      required: true,
      default: 5000,
    },
    trustScore: {
      type: Number,
      default: 785,
    },
    eligibilityStatus: {
      type: String,
      default: 'ELIGIBLE_FOR_INSTANT_FALLBACK',
    },
    consentGiven: {
      type: Boolean,
      default: true,
    },
    isSimulation: {
      type: Boolean,
      default: true,
    },
    disclaimer: {
      type: String,
      default: 'DEMONSTRATION ONLY: This is an educational temporary credit fallback simulation. No real money or credit bureaus are accessed.',
    },
    repaymentSchedule: [
      {
        id: String,
        loanId: String,
        installmentId: String,
        amount: Number,
        recipient: String,
        recipientName: String,
        dueDate: String,
        status: { type: String, default: 'PENDING' },
        createdAt: { type: Date, default: Date.now },
      },
    ],
  },
  {
    timestamps: true,
  }
);

export const CreditProfile = mongoose.model('CreditProfile', creditProfileSchema);
export default CreditProfile;
