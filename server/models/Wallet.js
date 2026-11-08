import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const walletSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true,
    },
    balance: {
      type: Number,
      required: true,
      default: 0,
      min: [0, 'Balance cannot be negative'],
    },
    currency: {
      type: String,
      required: true,
      default: 'INR',
      uppercase: true,
    },
    pinHash: {
      type: String,
      default: null,
    },
    isSimulated: {
      type: Boolean,
      default: true,
    },
    disclaimer: {
      type: String,
      default: 'SIMULATED DEMO FUNDS: These funds are educational mock balances for PayBastion testing and have zero real monetary value.',
    },
  },
  {
    timestamps: true,
  }
);

walletSchema.methods.comparePin = async function (candidatePin) {
  if (!this.pinHash) return false;
  return bcrypt.compare(String(candidatePin), this.pinHash);
};

walletSchema.methods.setPin = async function (plainPin) {
  if (!/^\d{4,6}$/.test(String(plainPin))) {
    throw new Error('Wallet PIN must be between 4 and 6 numeric digits');
  }
  const salt = await bcrypt.genSalt(10);
  this.pinHash = await bcrypt.hash(String(plainPin), salt);
  return this.save();
};

walletSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.pinHash;
  delete obj.__v;
  return obj;
};

export const Wallet = mongoose.model('Wallet', walletSchema);
export default Wallet;
