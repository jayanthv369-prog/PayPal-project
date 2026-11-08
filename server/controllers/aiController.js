import {
  explainTransactionState,
  explainScamRisk,
  parseVoiceIntent,
} from '../services/geminiService.js';

export async function explainState(req, res) {
  try {
    const { state, amount, recipient, failurePoint, providerResponse } = req.body;

    if (!state) {
      return res.status(400).json({ error: 'state field is required' });
    }

    const explanation = await explainTransactionState({
      state,
      amount,
      recipient,
      failurePoint,
      providerResponse,
    });

    res.json(explanation);
  } catch (err) {
    console.error('AI explain-state error:', err);
    res.status(500).json({ error: err.message });
  }
}

export async function parseVoice(req, res) {
  try {
    const { transcript, language = 'en-US' } = req.body;

    if (!transcript || typeof transcript !== 'string') {
      return res.status(400).json({ error: 'transcript is required' });
    }

    const parsed = await parseVoiceIntent({ transcript, language });
    res.json(parsed);
  } catch (err) {
    console.error('AI parse-voice error:', err);
    res.status(500).json({ error: err.message });
  }
}

export async function explainScam(req, res) {
  try {
    const { recipient, riskLevel, detectedReasons, amount } = req.body;
    const explanation = await explainScamRisk({ recipient, riskLevel, detectedReasons, amount });
    res.json(explanation);
  } catch (err) {
    console.error('AI explain-scam error:', err);
    res.status(500).json({ error: err.message });
  }
}

export default {
  explainState,
  parseVoice,
  explainScam,
};
