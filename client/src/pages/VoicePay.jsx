import React, { useState, useEffect } from 'react';
import { usePayment } from '../context/PaymentContext';
import { useNetwork } from '../context/NetworkContext';
import { isSpeechSupported, parseVoiceIntent, speakConfirmation } from '../utils/speechRecognition';
import { VOICE_PRESETS } from '../utils/mockData';
import { api } from '../utils/api';
import { 
  Mic, 
  MicOff, 
  Volume2, 
  CheckCircle2, 
  AlertTriangle, 
  Globe, 
  ArrowRight, 
  ShieldCheck, 
  RefreshCw,
  Send,
  HelpCircle,
  Sparkles
} from 'lucide-react';

export default function VoicePay() {
  const { addTransaction, triggerCelebration } = usePayment();
  const { simulateNetworkRequest } = useNetwork();

  const [language, setLanguage] = useState('kn-IN'); // Default Kannada as requested
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [parsedIntent, setParsedIntent] = useState(null);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [processingPayment, setProcessingPayment] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Speech Recognition Instance
  useEffect(() => {
    if (!isSpeechSupported()) return;

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = language;

    recognition.onresult = (event) => {
      const text = event.results[0][0].transcript;
      setTranscript(text);
      handleProcessVoiceText(text, language);
      setIsListening(false);
    };

    recognition.onerror = (event) => {
      console.warn('Speech recognition error:', event.error);
      setIsListening(false);
      if (event.error !== 'no-speech') {
        setErrorMsg(`Microphone event: ${event.error}. You can also use the preset chips below!`);
      }
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    if (isListening) {
      setErrorMsg('');
      try {
        recognition.start();
      } catch (e) {
        setIsListening(false);
      }
    }

    return () => {
      try { recognition.stop(); } catch (e) { /* ignore */ }
    };
  }, [isListening, language]);

  /**
   * Process voice transcript and extract intent via Backend AI Service (with deterministic fallback)
   */
  const handleProcessVoiceText = async (text, lang) => {
    let result = null;
    try {
      result = await api.parseVoice({ transcript: text, language: lang });
    } catch (apiErr) {
      console.warn('Backend voice parse fallback:', apiErr.message);
      result = parseVoiceIntent(text, lang);
    }

    if (!result) {
      result = parseVoiceIntent(text, lang);
    }

    setParsedIntent(result);
    setErrorMsg('');

    // Play back audio read-back
    setIsPlayingAudio(true);
    speakConfirmation({
      recipient: result.extracted.recipient,
      amount: result.extracted.amount,
      language: lang,
      onEnd: () => setIsPlayingAudio(false),
    });
  };

  /**
   * Select a preset voice command chip
   */
  const handleSelectPreset = (preset) => {
    setLanguage(preset.lang);
    setTranscript(preset.text);
    handleProcessVoiceText(preset.text, preset.lang);
  };

  /**
   * Trigger the mandatory explicit user confirmation
   */
  const handleOpenConfirm = () => {
    if (!parsedIntent) return;
    setShowConfirmModal(true);
  };

  /**
   * User explicitly confirms payment after audio read-back
   */
  const handleExecutePayment = async () => {
    if (!parsedIntent) return;
    setProcessingPayment(true);
    setShowConfirmModal(false);

    try {
      await simulateNetworkRequest(async () => {
        const txnId = `TXN-VOICE-${Date.now().toString().slice(-5)}`;
        const idempotencyKey = `IDEMP-VOICE-${Date.now()}`;
        const amount = parsedIntent.extracted.amount;
        const recipient = `${parsedIntent.extracted.recipient.toLowerCase().replace(/\s+/g, '-')}@okaxis`;

        const newTxn = {
          id: txnId,
          idempotencyKey,
          amount,
          currency: 'INR',
          sender: 'user-ananya@okaxis',
          recipient,
          recipientName: parsedIntent.extracted.recipient,
          category: parsedIntent.extracted.purpose || 'VoicePay Transfer',
          channel: 'VOICE_PAY_AI',
          state: 'CONFIRMED',
          confidenceScore: 99,
          createdAt: new Date().toISOString(),
          safeToRetry: false,
          userExplanation: `Voice-initiated payment in ${language.startsWith('kn') ? 'Kannada' : 'English'} verified and confirmed by user.`,
          technicalDiagnosis: `VoicePay NLP confidence ${Math.round(parsedIntent.confidence * 100)}%. Explicit modal authorization captured. Idempotency lock sealed.`,
          logs: [
            { timestamp: new Date().toISOString(), event: 'VOICE_INTENT_PARSED', detail: `Recognized: ₹${amount} to ${parsedIntent.extracted.recipient} (${language})` },
            { timestamp: new Date().toISOString(), event: 'EXPLICIT_CONFIRMATION', detail: 'User gave affirmative biometric/PIN confirmation.' },
            { timestamp: new Date().toISOString(), event: 'SETTLED', detail: 'Cleared via payment gateway switch.' },
          ]
        };

        addTransaction(newTxn);
        triggerCelebration();
      });
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setProcessingPayment(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="p-6 rounded-2xl bg-gradient-to-r from-slate-900 via-slate-900 to-[#0e2730] border border-slate-800">
        <div className="flex items-center gap-2 mb-1">
          <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
            MULTILINGUAL VOICE FINTECH
          </span>
        </div>
        <h1 className="text-2xl font-extrabold text-white tracking-tight">
          VoicePay AI (Kannada & English)
        </h1>
        <p className="text-slate-400 text-xs sm:text-sm mt-1 max-w-2xl">
          Initiate payments naturally in Kannada (ಕನ್ನಡ) or English. PayBastion parses the recipient, amount, and intent, reads back the summary via audio, and strictly requires explicit user confirmation before touching funds.
        </p>
      </div>

      {/* Strict Security Safeguard Banner */}
      <div className="p-4 rounded-xl bg-amber-950/20 border border-amber-500/30 text-amber-300 text-xs flex items-start gap-3">
        <ShieldCheck className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
        <div className="leading-relaxed">
          <span className="font-bold">Human-in-the-Loop Safeguard: </span>
          AI never autonomously executes payments. Every parsed voice command is synthesized and read back aloud in your language, and requires an explicit, intentional button confirmation from you before any debit is submitted.
        </div>
      </div>

      {/* Main Two-Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Voice Controller (5 cols) */}
        <div className="lg:col-span-5 bg-[#0e1626] border border-slate-800 rounded-2xl p-6 shadow-xl space-y-5">
          {/* Language Selector */}
          <div>
            <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider block mb-2 flex items-center gap-1.5">
              <Globe className="w-3.5 h-3.5 text-emerald-400" />
              Select Voice Language
            </label>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <button
                type="button"
                onClick={() => setLanguage('kn-IN')}
                className={`py-2.5 px-3 rounded-xl font-bold border transition-all flex items-center justify-center gap-2 ${
                  language === 'kn-IN'
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 shadow-sm'
                    : 'bg-slate-950 text-slate-400 border-slate-800 hover:bg-slate-900'
                }`}
              >
                <span>ಕನ್ನಡ (Kannada)</span>
              </button>

              <button
                type="button"
                onClick={() => setLanguage('en-US')}
                className={`py-2.5 px-3 rounded-xl font-bold border transition-all flex items-center justify-center gap-2 ${
                  language === 'en-US'
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 shadow-sm'
                    : 'bg-slate-950 text-slate-400 border-slate-800 hover:bg-slate-900'
                }`}
              >
                <span>English (India / US)</span>
              </button>
            </div>
          </div>

          {/* Interactive Mic Button */}
          <div className="flex flex-col items-center justify-center py-6 bg-slate-950/60 rounded-2xl border border-slate-800/80">
            <button
              type="button"
              onClick={() => setIsListening(!isListening)}
              className={`w-20 h-20 rounded-full flex items-center justify-center transition-all ${
                isListening
                  ? 'bg-rose-500 text-white shadow-xl shadow-rose-500/40 animate-pulse'
                  : 'bg-gradient-to-tr from-emerald-600 to-teal-400 text-slate-950 shadow-xl shadow-emerald-500/30 hover:scale-105'
              }`}
            >
              {isListening ? <MicOff className="w-8 h-8" /> : <Mic className="w-8 h-8 stroke-[2.5]" />}
            </button>

            <span className="text-xs font-bold text-white mt-3">
              {isListening ? 'Listening... Speak now!' : 'Click Microphone to Speak'}
            </span>
            <span className="text-[11px] text-slate-400 mt-0.5">
              {language === 'kn-IN'
                ? 'ಉದಾಹರಣೆ: "ಕಿರಣ್ ಅವರಿಗೆ ₹350 ಕಾಫಿಗೆ ಕಳುಹಿಸಿ"'
                : 'Example: "Send 450 rupees to Priya for dinner"'}
            </span>
          </div>

          {/* Preset Chips for Instant Hackathon Testing */}
          <div>
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-2 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              Demo Command Presets (Instant Click):
            </span>
            <div className="space-y-2">
              {VOICE_PRESETS.map((preset, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleSelectPreset(preset)}
                  className="w-full p-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-left transition-colors flex items-center justify-between group text-xs"
                >
                  <div>
                    <div className="font-semibold text-slate-200 group-hover:text-emerald-400 transition-colors">
                      {preset.text}
                    </div>
                    <div className="text-[10px] text-slate-500">
                      {preset.label} • {preset.translation}
                    </div>
                  </div>
                  <ArrowRight className="w-3.5 h-3.5 text-slate-600 group-hover:text-emerald-400 shrink-0 ml-2" />
                </button>
              ))}
            </div>
          </div>

          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-950/20 border border-rose-500/30 text-rose-300 text-xs">
              {errorMsg}
            </div>
          )}
        </div>

        {/* Right Column: Parsed Intent & Audio Readback Card (7 cols) */}
        <div className="lg:col-span-7 space-y-5">
          {/* Transcript Display */}
          <div className="bg-[#0e1626] border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="font-bold text-white text-base flex items-center gap-2">
                <span>Recognized Speech Transcript</span>
              </h3>
              {isPlayingAudio && (
                <span className="px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs font-semibold flex items-center gap-1.5 animate-pulse">
                  <Volume2 className="w-3.5 h-3.5" />
                  Reading aloud to user...
                </span>
              )}
            </div>

            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 min-h-[70px] flex items-center text-sm font-medium text-slate-200">
              {transcript ? (
                <span>"{transcript}"</span>
              ) : (
                <span className="text-slate-500 italic">No voice command recorded yet. Click the mic or pick a preset chip on the left.</span>
              )}
            </div>

            {/* Extracted Intent Details */}
            {parsedIntent && (
              <div className="space-y-4 animate-fadeIn">
                <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 space-y-3">
                  <span className="text-xs font-semibold text-emerald-400 uppercase tracking-wider block">
                    AI Entity & Intent Extraction:
                  </span>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                    <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                      <span className="text-slate-500 block text-[11px]">Recipient</span>
                      <span className="font-bold text-white text-sm mt-0.5 block">
                        {parsedIntent.extracted.recipient}
                      </span>
                    </div>

                    <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                      <span className="text-slate-500 block text-[11px]">Amount</span>
                      <span className="font-bold text-emerald-400 text-sm mt-0.5 block font-mono">
                        ₹{Number(parsedIntent.extracted.amount).toFixed(2)}
                      </span>
                    </div>

                    <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                      <span className="text-slate-500 block text-[11px]">Purpose / Category</span>
                      <span className="font-bold text-sky-400 text-sm mt-0.5 block">
                        {parsedIntent.extracted.purpose}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs text-slate-400 pt-2 border-t border-slate-800">
                    <span>NLP Parsing Confidence:</span>
                    <span className="font-mono text-emerald-400 font-bold">
                      {Math.round(parsedIntent.confidence * 100)}%
                    </span>
                  </div>
                </div>

                {/* Re-read audio button */}
                <button
                  type="button"
                  onClick={() => {
                    setIsPlayingAudio(true);
                    speakConfirmation({
                      recipient: parsedIntent.extracted.recipient,
                      amount: parsedIntent.extracted.amount,
                      language,
                      onEnd: () => setIsPlayingAudio(false),
                    });
                  }}
                  className="w-full py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium flex items-center justify-center gap-2 border border-slate-700 transition-colors"
                >
                  <Volume2 className="w-4 h-4 text-emerald-400" />
                  <span>Replay Audio Confirmation Read-Back</span>
                </button>

                {/* Explicit Proceed Button */}
                <button
                  type="button"
                  onClick={handleOpenConfirm}
                  disabled={processingPayment}
                  className="w-full py-3.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold text-sm flex items-center justify-center gap-2 shadow-xl shadow-emerald-500/20 transition-all"
                >
                  <ShieldCheck className="w-5 h-5" />
                  <span>Review & Explicitly Authorize ₹{parsedIntent.extracted.amount}</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Explicit User Confirmation Modal */}
      {showConfirmModal && parsedIntent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fadeIn">
          <div className="relative w-full max-w-md bg-[#0f172a] border border-slate-700 rounded-2xl shadow-2xl p-6 space-y-5">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-2xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-bold text-white text-base">Explicit Payment Authorization</h3>
                <p className="text-xs text-slate-400">Confirmation required prior to dispatch</p>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2 text-xs">
              <div className="flex justify-between py-1 border-b border-slate-800">
                <span className="text-slate-400">Recipient:</span>
                <span className="font-bold text-white">{parsedIntent.extracted.recipient}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800">
                <span className="text-slate-400">Total Amount:</span>
                <span className="font-bold text-emerald-400 font-mono text-sm">
                  ₹{Number(parsedIntent.extracted.amount).toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800">
                <span className="text-slate-400">Purpose:</span>
                <span className="text-slate-200">{parsedIntent.extracted.purpose}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-400">Security Rule:</span>
                <span className="text-sky-300 font-mono text-[11px]">Idempotency Locked</span>
              </div>
            </div>

            <p className="text-xs text-slate-400 leading-relaxed">
              By confirming, you explicitly verify that you authorized this transaction via voice in{' '}
              <strong className="text-white">{language.startsWith('kn') ? 'Kannada' : 'English'}</strong>.
            </p>

            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                className="py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExecutePayment}
                className="py-2.5 px-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold shadow-lg shadow-emerald-500/20"
              >
                Authorize & Pay Now
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
