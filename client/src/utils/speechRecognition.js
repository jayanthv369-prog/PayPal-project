// VoicePay AI Multilingual Speech Recognition & Intent Parser
// Supports Kannada (kn-IN) and English (en-IN / en-US)

export function isSpeechSupported() {
  return typeof window !== 'undefined' && 
    ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window);
}

export function isSynthesisSupported() {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

/**
 * Parse Voice Input in Kannada or English to extract Recipient, Amount, and Purpose
 */
export function parseVoiceIntent(transcript, language = 'en-US') {
  const clean = transcript.trim();
  let amount = null;
  let recipient = null;
  let purpose = 'General Transfer';
  let confidence = 0.85;

  if (language.startsWith('kn')) {
    // Kannada Voice Parsing Logic
    // e.g. "ರಾಜು ಅವರಿಗೆ ₹500 ಕಳುಹಿಸಿ" or "ರಮೇಶ್ ಗೆ 350 ರೂಪಾಯಿ ಪಾವತಿಸಿ ಹೋಟೆಲ್ ಗೆ"
    // Kannada number words / numerals
    const knDigits = { '೦':0, '೧':1, '೨':2, '೩':3, '೪':4, '೫':5, '೬':6, '೭':7, '೮':8, '೯':9 };
    let normalized = clean;
    for (const [kn, en] of Object.entries(knDigits)) {
      normalized = normalized.replaceAll(kn, en);
    }

    // Extract amount in Kannada transcript (looking for numbers before ರೂಪಾಯಿ or rs / ₹)
    const knAmountMatch = normalized.match(/(\d+(?:\.\d+)?)\s*(?:ರೂಪಾಯಿ|ರೂ|rs|inr)?/i);
    if (knAmountMatch && knAmountMatch[1]) {
      amount = parseFloat(knAmountMatch[1]);
    }

    // Extract recipient: words before 'ಅವರಿಗೆ' (to) or 'ಗೆ' (to) or 'ರವರಿಗೆ'
    const knRecipientMatch = clean.match(/([\u0C80-\u0CFFa-zA-Z\s]+?)(?:\s*ಅವರಿಗೆ|\s*ಗೆ|\s*ರವರಿಗೆ|\s*ಹತ್ತಿರ)/i);
    if (knRecipientMatch && knRecipientMatch[1]) {
      recipient = knRecipientMatch[1].trim();
    } else {
      recipient = 'ಅಂಗಡಿಯವರು (Merchant)';
    }

    // Extract purpose (e.g., 'ಕಾಫಿ', 'ದಿನಸಿ', 'ಊಟ', 'ಹಾಲು')
    if (clean.includes('ಕಾಫಿ') || clean.includes('coffee')) purpose = 'ಕಾಫಿ (Coffee)';
    else if (clean.includes('ದಿನಸಿ') || clean.includes('grocery')) purpose = 'ದಿನಸಿ (Groceries)';
    else if (clean.includes('ಊಟ') || clean.includes('dinner') || clean.includes('lunch')) purpose = 'ಊಟ (Food)';
    else if (clean.includes('ಹಾಲು') || clean.includes('milk')) purpose = 'ಹಾಲು (Milk)';
    else purpose = 'ಪಾವತಿ (Payment)';

  } else {
    // English Voice Parsing Logic
    // e.g. "Send 450 rupees to Priya for dinner" or "Pay ₹1200 to Metro Supermarket"
    const amountMatch = clean.match(/(?:(?:pay|send|transfer)?\s*(?:rs|rupees|inr|₹)?\s*(\d+(?:\.\d+)?))/i) ||
                         clean.match(/(\d+(?:\.\d+)?)\s*(?:rupees|rs|bucks|inr)/i);
    if (amountMatch && amountMatch[1]) {
      amount = parseFloat(amountMatch[1]);
    }

    // Recipient extraction
    const recipientMatch = clean.match(/(?:to|for)\s+([A-Za-z0-9\s]+?)(?:\s+(?:for|on|towards|rs|rupees|\d+)|$)/i);
    if (recipientMatch && recipientMatch[1]) {
      const candidate = recipientMatch[1].trim();
      if (!['pay', 'send', 'transfer', 'rupees', 'rs'].includes(candidate.toLowerCase())) {
        recipient = candidate;
      }
    }

    // Purpose extraction
    const purposeMatch = clean.match(/(?:for|towards)\s+([A-Za-z\s]+?)(?:\s+(?:to|\d+)|$)/i);
    if (purposeMatch && purposeMatch[1]) {
      purpose = purposeMatch[1].trim();
    } else if (clean.toLowerCase().includes('dinner')) purpose = 'Dinner';
    else if (clean.toLowerCase().includes('coffee')) purpose = 'Coffee';
    else if (clean.toLowerCase().includes('groceries')) purpose = 'Groceries';
    else if (clean.toLowerCase().includes('rent')) purpose = 'Rent';
  }

  // Fallbacks if incomplete
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
  };
}

/**
 * Text-to-Speech confirmation read-back
 * Explicitly speaks back details to ensure user hears before committing!
 */
export function speakConfirmation({ recipient, amount, currency = 'rupees', language = 'en-US', onEnd }) {
  if (!isSynthesisSupported()) return;

  window.speechSynthesis.cancel(); // Stop any pending speech

  let text = '';
  if (language.startsWith('kn')) {
    text = `ನೀವು ${recipient} ಅವರಿಗೆ ${amount} ರೂಪಾಯಿಗಳನ್ನು ಪಾವತಿಸಲು ಬಯಸಿದ್ದೀರಾ? ದಯವಿಟ್ಟು ದೃಢೀಕರಿಸಿ.`;
  } else {
    text = `You are about to transfer ${amount} ${currency} to ${recipient}. Please check details and confirm to proceed.`;
  }

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = language.startsWith('kn') ? 'kn-IN' : 'en-US';
  utterance.rate = 0.95; // Slightly slower for clarity
  utterance.pitch = 1.0;

  if (onEnd) utterance.onend = onEnd;

  window.speechSynthesis.speak(utterance);
}
