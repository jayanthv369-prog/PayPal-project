import { analyzeScamRisk } from '../services/scamDetectionService.js';

export async function analyze(req, res) {
  try {
    const { recipient, amount, rawPayload, recentAttemptsCount, context, transactionId } = req.body;
    const analysis = await analyzeScamRisk({
      recipient,
      amount,
      rawPayload,
      recentAttemptsCount,
      context,
      transactionId,
      userId: req.userId || null,
    });
    res.json(analysis);
  } catch (err) {
    console.error('Scam Guardian analyze error:', err);
    res.status(500).json({ error: err.message });
  }
}

export default {
  analyze,
};
