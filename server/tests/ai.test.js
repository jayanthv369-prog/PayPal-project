import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  explainTransactionState,
  getDeterministicExplanation,
  parseVoiceIntent,
  getDeterministicVoiceParsing,
} from '../services/geminiService.js';
import { analyzeScamRisk } from '../services/scamDetectionService.js';

describe('AI EXPLAINER, VOICE PARSING & SCAM GUARDIAN TESTS', () => {
  it('generates deterministic explanation for all 6 transaction states', () => {
    const states = [
      'CONFIRMED',
      'PENDING_VERIFICATION',
      'OUTCOME_UNKNOWN',
      'OFFLINE_AUTHORIZATION',
      'FAILED',
      'NEEDS_REVIEW',
    ];

    for (const state of states) {
      const exp = getDeterministicExplanation(state, 'Test failure point');
      assert.ok(exp.userExplanation, `userExplanation present for ${state}`);
      assert.ok(exp.technicalDiagnosis, `technicalDiagnosis present for ${state}`);
      assert.strictEqual(typeof exp.safeToRetry, 'boolean', `safeToRetry is boolean for ${state}`);
      assert.ok(exp.recommendedAction, `recommendedAction present for ${state}`);
    }

    // Verify FAILED is safe to retry, while OUTCOME_UNKNOWN is NOT safe to retry
    assert.strictEqual(getDeterministicExplanation('FAILED').safeToRetry, true);
    assert.strictEqual(getDeterministicExplanation('OUTCOME_UNKNOWN').safeToRetry, false);
    assert.strictEqual(getDeterministicExplanation('CONFIRMED').safeToRetry, false);
  });

  it('parses English voice transcripts accurately', async () => {
    const transcript = 'Pay 450 rupees to Priya for dinner';
    const result = await parseVoiceIntent({ transcript, language: 'en-US' });

    assert.ok(result.extracted);
    assert.strictEqual(result.extracted.amount, 450);
    assert.ok(result.extracted.recipient.toLowerCase().includes('priya'));
    assert.ok(result.extracted.purpose.toLowerCase().includes('dinner'));
    assert.strictEqual(result.extracted.currency, 'INR');
  });

  it('parses Kannada voice transcripts accurately', async () => {
    const transcript = 'ಕಿರಣ್ ಅವರಿಗೆ 350 ರೂಪಾಯಿ ಕಾಫಿಗೆ ಕಳುಹಿಸಿ';
    const result = await parseVoiceIntent({ transcript, language: 'kn-IN' });

    assert.ok(result.extracted);
    assert.strictEqual(result.extracted.amount, 350);
    assert.ok(result.extracted.recipient.includes('ಕಿರಣ್'));
    assert.ok(result.extracted.purpose.includes('ಕಾಫಿ'));
  });

  it('parses Kannada numerals and grocery shop payments', async () => {
    const transcript = 'ರಾಜು ದಿನಸಿ ಅಂಗಡಿಗೆ ₹850 ಪಾವತಿಸಿ';
    const result = await parseVoiceIntent({ transcript, language: 'kn-IN' });

    assert.ok(result.extracted);
    assert.strictEqual(result.extracted.amount, 850);
    assert.ok(result.extracted.recipient.includes('ರಾಜು'));
    assert.ok(result.extracted.purpose.includes('ದಿನಸಿ'));
  });

  it('analyzes phishing and scam handles in Scam Guardian', () => {
    const analysis = analyzeScamRisk({
      recipient: 'electricity-bill-refund@okaxis',
      amount: '4999.00',
    });

    assert.strictEqual(analysis.safe, false);
    assert.strictEqual(analysis.riskLevel, 'CRITICAL');
    assert.ok(analysis.riskScore >= 90);
    assert.ok(analysis.primaryAlert.signal);
    assert.ok(analysis.primaryAlert.reason);
    assert.ok(analysis.primaryAlert.recommendedAction);
  });

  it('analyzes reverse collect requests disguised as refunds in QR payloads', () => {
    const analysis = analyzeScamRisk({
      recipient: 'claim-cashback-instant@upi',
      amount: '2500.00',
      rawPayload: 'upi://pay?pa=scam-collector@upi&pn=Amazon_Refund_Desk&am=2500&mode=02&tr=REF9921',
    });

    assert.strictEqual(analysis.safe, false);
    assert.strictEqual(analysis.riskLevel, 'CRITICAL');
    assert.ok(analysis.allAlerts.some(a => a.signal.includes('Reverse-Flow Collect Request')));
  });

  it('analyzes velocity anomalies when multiple attempts occur rapidly', () => {
    const analysis = analyzeScamRisk({
      recipient: 'fast-checkout@kotak',
      amount: '500.00',
      recentAttemptsCount: 4,
    });

    assert.strictEqual(analysis.safe, false);
    assert.ok(analysis.riskScore >= 70);
    assert.ok(analysis.allAlerts.some(a => a.signal.includes('Velocity Anomaly')));
  });

  it('approves standard genuine transactions with low risk', () => {
    const analysis = analyzeScamRisk({
      recipient: 'metro-supermarket@icici',
      amount: '450.00',
      recentAttemptsCount: 1,
    });

    assert.strictEqual(analysis.safe, true);
    assert.strictEqual(analysis.riskLevel, 'LOW');
    assert.ok(analysis.riskScore <= 15);
  });
});
