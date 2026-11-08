import {
  registerRecoveryTransaction,
  reconcileRecoveryTransaction,
  getPendingRecoveryTransactions,
} from '../services/recoveryService.js';

export function register(req, res) {
  try {
    const {
      idempotencyKey,
      amount,
      recipient,
      recipientName,
      sender,
      channel,
      provider,
      state,
      isSimulation,
      simulatedOutcome,
      scenarioId,
    } = req.body;

    if (!idempotencyKey) {
      return res.status(400).json({ error: 'idempotencyKey is required' });
    }

    const result = registerRecoveryTransaction({
      idempotencyKey,
      amount,
      recipient,
      recipientName,
      sender,
      channel,
      provider,
      state,
      isSimulation,
      simulatedOutcome,
      scenarioId,
      userId: req.userId || null,
    });

    res.json(result);
  } catch (err) {
    console.error('Recovery register error:', err);
    res.status(500).json({ error: err.message });
  }
}

export async function reconcile(req, res) {
  try {
    const { idempotencyKey, orderId, provider, simulatedOutcome } = req.body;

    if (!idempotencyKey) {
      return res.status(400).json({ error: 'idempotencyKey is required' });
    }

    const result = await reconcileRecoveryTransaction({
      idempotencyKey,
      orderId,
      provider,
      simulatedOutcome,
      userId: req.userId || null,
    });

    res.json(result);
  } catch (err) {
    console.error('Recovery reconcile error:', err);
    res.status(500).json({ error: err.message });
  }
}

export function getPending(req, res) {
  try {
    const pending = getPendingRecoveryTransactions();
    res.json({ count: pending.length, pending });
  } catch (err) {
    console.error('Recovery pending error:', err);
    res.status(500).json({ error: err.message });
  }
}

export default {
  register,
  reconcile,
  getPending,
};
