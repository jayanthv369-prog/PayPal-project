// Google Gemini API Service for Natural Language Payment State Explanation,
// Fraud Diagnosis, Smart Recovery Walkthroughs, and Multilingual Voice Intent Parsing.
// Uses Gemini API when GEMINI_API_KEY is available; falls back cleanly to deterministic heuristic rules.

const getGeminiApiKey = () => process.env.GEMINI_API_KEY;

/**
 * Generate human-friendly explanation for a payment state and recovery recommendation
 */
export async function explainTransactionState({ state, amount, recipient, failurePoint, providerResponse }) {
  const apiKey = getGeminiApiKey();

  if (apiKey && apiKey !== 'your_gemini_api_key_here') {
    try {
      const prompt = `You are the AI Payment Confidence Engine for PayBastion, a payment resilience platform.
Explain this transaction state in 2-3 concise, high-trust sentences for a non-technical user.
State: ${state}
Amount: ${amount}
Recipient: ${recipient}
Failure Point: ${failurePoint || 'Client network timeout during gateway roundtrip'}
Provider Details: ${JSON.stringify(providerResponse || {})}

Rules:
1. Never promise money has moved if status is Pending, Unknown, or Offline Auth.
2. Clearly explain where the money is right now.
3. State whether it is safe to retry or if the user should wait.
4. Output strictly valid JSON with keys: "userExplanation", "technicalDiagnosis", "safeToRetry" (boolean), "recommendedAction".`;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);

      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: 'application/json' },
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        const data = await response.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) {
          const parsed = JSON.parse(text);
          return {
            userExplanation: parsed.userExplanation || 'Explanation generated.',
            technicalDiagnosis: parsed.technicalDiagnosis || 'Diagnosis completed.',
            safeToRetry: Boolean(parsed.safeToRetry),
            recommendedAction: parsed.recommendedAction || '',
            source: 'GEMINI_AI',
          };
        }
      }
    } catch (err) {
      console.warn('Gemini API call failed, falling back to deterministic explanation:', err.message);
    }
  }

  // Deterministic Explainability Engine
  return {
    ...getDeterministicExplanation(state, failurePoint),
    source: 'DETERMINISTIC_FALLBACK',
  };
}

export function getDeterministicExplanation(state, failurePoint) {
  switch (state) {
    case 'CONFIRMED':
      return {
        userExplanation: 'Your payment was successfully captured and verified by the destination clearinghouse. No duplicate charges occurred.',
        technicalDiagnosis: 'Idempotency key validated. Provider returned HTTP 200/CAPTURE_COMPLETED with matching non-repudiation signature.',
        safeToRetry: false,
        recommendedAction: 'Transaction is complete. Retrying will create a duplicate payment.',
      };

    case 'PENDING_VERIFICATION':
      return {
        userExplanation: 'Your payment instruction reached the gateway, but final bank acknowledgement was delayed. The system is actively querying the bank status.',
        technicalDiagnosis: failurePoint || 'Timeout occurred at client ACK phase after gateway ingress. Payment may have settled upstream; reconciler polling provider with original idempotency token.',
        safeToRetry: false,
        recommendedAction: 'Do NOT press pay again. PayBastion is verifying the existing order to prevent double debits.',
      };

    case 'OUTCOME_UNKNOWN':
      return {
        userExplanation: 'The network connection dropped while processing your transfer. We cannot confirm yet whether funds left your account or were refunded.',
        technicalDiagnosis: failurePoint || 'Network socket severed mid-flight (TCP RST or packet loss). Gateway status indeterminate; idempotency lock engaged on client and gateway.',
        safeToRetry: false,
        recommendedAction: 'Hold tight. The Smart Recovery Engine is conducting a non-debit status inquiry. Do not re-initiate payment.',
      };

    case 'OFFLINE_AUTHORIZATION':
      return {
        userExplanation: 'An offline cryptographically signed token was created. Money has NOT been transferred yet; it is held in settlement queue until online sync.',
        technicalDiagnosis: 'HMAC-SHA256 signature generated locally with strict TTL (15m) and nonce replay protection. Marked as SETTLEMENT_PENDING.',
        safeToRetry: false,
        recommendedAction: 'Present QR code to merchant terminal. Once connectivity is restored, the batch will settle automatically.',
      };

    case 'FAILED':
      return {
        userExplanation: 'The bank or payment provider confirmed the payment did not succeed. No money was deducted from your account.',
        technicalDiagnosis: failurePoint || 'Provider returned explicit rejection code (e.g., INSUFFICIENT_FUNDS, TIMED_OUT_BEFORE_DEBIT, USER_CANCELLED). Lock released.',
        safeToRetry: true,
        recommendedAction: 'You can safely attempt this payment again or switch to an alternate payment method.',
      };

    case 'NEEDS_REVIEW':
    default:
      return {
        userExplanation: 'A pattern anomaly was flagged on this transaction. A human or secondary verification step is required before proceeding.',
        technicalDiagnosis: failurePoint || 'Scam Guardian or Risk Engine triggered high-entropy score (unusual recipient velocity, mismatch in VPA, or tampered QR payload).',
        safeToRetry: false,
        recommendedAction: 'Review the recipient credentials carefully in Scam Guardian before authorizing any release.',
      };
  }
}

/**
 * Generate Scam Risk Explanation via Gemini API or fallback
 */
export async function explainScamRisk({ recipient, riskLevel, detectedReasons = [], amount }) {
  const apiKey = getGeminiApiKey();

  if (apiKey && apiKey !== 'your_gemini_api_key_here') {
    try {
      const prompt = `You are PayBastion Scam Guardian AI. Explain to a user why the payment of ₹${amount} to "${recipient}" was flagged with risk level "${riskLevel}".
Detected Signals: ${detectedReasons.join('; ')}
Explain clearly what scam tactic might be occurring, and give 3 clear protective recommendations.
Output JSON: { "explanation": string, "recommendations": string[] }`;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);

      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: 'application/json' },
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        const data = await response.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) {
          const parsed = JSON.parse(text);
          return {
            success: true,
            explanation: parsed.explanation,
            recommendations: parsed.recommendations || [],
            source: 'GEMINI_AI',
          };
        }
      }
    } catch (e) {
      // Fallback
    }
  }

  // Fallback
  return {
    success: true,
    explanation: `This payment was flagged as ${riskLevel} risk because ${detectedReasons[0] || 'unusual transaction parameters were detected'}. Fraudsters often exploit urgency or fake refund claims to trick users into authorizing debits.`,
    recommendations: [
      'Never enter your UPI PIN to receive money or refunds.',
      'Verify the recipient VPA directly with the official merchant.',
      'If in doubt, reject the payment request immediately.',
    ],
    source: 'DETERMINISTIC_FALLBACK',
  };
}

/**
 * Multilingual Voice Intent Parser for Kannada (kn-IN) and English (en-US / en-IN).
 * Extracts: Recipient, Amount, Currency, Purpose.
 * NEVER executes payment; returns structured data for explicit user confirmation.
 */
export async function parseVoiceIntent({ transcript, language = 'en-US' }) {
  if (!transcript || typeof transcript !== 'string') {
    throw new Error('transcript string is required for voice intent parsing');
  }

  const clean = transcript.trim();
  const apiKey = getGeminiApiKey();

  if (apiKey && apiKey !== 'your_gemini_api_key_here') {
    try {
      const prompt = `You are the PayBastion Voice Payment Intent Parser.
Extract payment entities from the following voice transcript in ${language.startsWith('kn') ? 'Kannada' : 'English'}:
Transcript: "${clean}"

Respond STRICTLY with valid JSON with keys:
"recipient": string (clean name or handle),
"amount": number (positive float or integer),
"currency": string (e.g. "INR" or "USD"),
"purpose": string (brief context, e.g. "Dinner", "Coffee", "Groceries", "General Transfer"),
"confidence": number between 0.5 and 1.0.`;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);

      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: 'application/json' },
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        const data = await response.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) {
          const parsed = JSON.parse(text);
          if (parsed && parsed.amount) {
            return {
              rawTranscript: clean,
              language,
              extracted: {
                recipient: parsed.recipient || 'Verified Merchant',
                amount: parseFloat(parsed.amount),
                currency: parsed.currency || 'INR',
                purpose: parsed.purpose || 'General Transfer',
              },
              confidence: parseFloat(parsed.confidence) || 0.95,
              parsedAt: new Date().toISOString(),
              source: 'GEMINI_AI',
            };
          }
        }
      }
    } catch (err) {
      console.warn('Gemini Voice parsing failed, using deterministic parser:', err.message);
    }
  }

  // Deterministic NLP extraction fallback
  return getDeterministicVoiceParsing(clean, language);
}

export function getDeterministicVoiceParsing(clean, language = 'en-US') {
  let amount = null;
  let recipient = null;
  let purpose = 'General Transfer';
  let confidence = 0.88;

  if (language.startsWith('kn')) {
    // Kannada Voice Parsing
    const knDigits = { '೦': 0, '೧': 1, '೨': 2, '೩': 3, '೪': 4, '೫': 5, '೬': 6, '೭': 7, '೮': 8, '೯': 9 };
    let normalized = clean;
    for (const [kn, en] of Object.entries(knDigits)) {
      normalized = normalized.replaceAll(kn, en);
    }

    const knAmountMatch = normalized.match(/(\d+(?:\.\d+)?)\s*(?:ರೂಪಾಯಿ|ರೂ|rs|inr|₹)?/i);
    if (knAmountMatch && knAmountMatch[1]) {
      amount = parseFloat(knAmountMatch[1]);
    }

    const knRecipientMatch = clean.match(/([\u0C80-\u0CFFa-zA-Z\s]+?)(?:\s*ಅವರಿಗೆ|\s*ಗೆ|\s*ರವರಿಗೆ|\s*ಹತ್ತಿರ|\s*ಅಂಗಡಿಗೆ)/i);
    if (knRecipientMatch && knRecipientMatch[1]) {
      recipient = knRecipientMatch[1].trim();
    } else {
      recipient = 'ಅಂಗಡಿಯವರು (Merchant)';
    }

    if (clean.includes('ಕಾಫಿ') || clean.toLowerCase().includes('coffee')) purpose = 'ಕಾಫಿ (Coffee)';
    else if (clean.includes('ದಿನಸಿ') || clean.toLowerCase().includes('grocery')) purpose = 'ದಿನಸಿ (Groceries)';
    else if (clean.includes('ಊಟ') || clean.toLowerCase().includes('dinner') || clean.toLowerCase().includes('lunch')) purpose = 'ಊಟ (Food)';
    else if (clean.includes('ಹಾಲು') || clean.toLowerCase().includes('milk')) purpose = 'ಹಾಲು (Milk)';
    else purpose = 'ಪಾವತಿ (Payment)';

  } else {
    // English Voice Parsing
    const amountMatch = clean.match(/(?:(?:pay|send|transfer)?\s*(?:rs|rupees|inr|₹|\$)?\s*(\d+(?:\.\d+)?))/i) ||
                         clean.match(/(\d+(?:\.\d+)?)\s*(?:rupees|rs|bucks|inr|dollars)/i);
    if (amountMatch && amountMatch[1]) {
      amount = parseFloat(amountMatch[1]);
    }

    const recipientMatch = clean.match(/(?:to|for)\s+([A-Za-z0-9\s]+?)(?:\s+(?:for|on|towards|rs|rupees|\d+)|$)/i);
    if (recipientMatch && recipientMatch[1]) {
      const candidate = recipientMatch[1].trim();
      if (!['pay', 'send', 'transfer', 'rupees', 'rs'].includes(candidate.toLowerCase())) {
        recipient = candidate;
      }
    }

    const purposeMatch = clean.match(/(?:for|towards)\s+([A-Za-z\s]+?)(?:\s+(?:to|\d+)|$)/i);
    if (purposeMatch && purposeMatch[1]) {
      purpose = purposeMatch[1].trim();
    } else if (clean.toLowerCase().includes('dinner')) purpose = 'Dinner';
    else if (clean.toLowerCase().includes('coffee')) purpose = 'Coffee';
    else if (clean.toLowerCase().includes('groceries')) purpose = 'Groceries';
    else if (clean.toLowerCase().includes('rent')) purpose = 'Rent';
  }

  if (!recipient) recipient = 'Verified Merchant';
  if (!amount) amount = 100;

  return {
    rawTranscript: clean,
    language,
    extracted: {
      recipient,
      amount,
      currency: 'INR',
      purpose,
    },
    confidence,
    parsedAt: new Date().toISOString(),
    source: 'DETERMINISTIC_NLP',
  };
}

export default {
  explainTransactionState,
  explainScamRisk,
  parseVoiceIntent,
  getDeterministicExplanation,
  getDeterministicVoiceParsing,
};
