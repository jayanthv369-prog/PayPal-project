import React, { useState } from 'react';
import { usePayment } from '../context/PaymentContext';
import { X, QrCode, ShieldAlert, ShieldCheck, AlertTriangle, Play, RefreshCw, Key } from 'lucide-react';

export default function QrScannerModal({ isOpen, onClose }) {
  const { offlinePassports, verifyOfflinePassport, merchantJournal } = usePayment();
  const [rawPayload, setRawPayload] = useState('');
  const [scanResult, setScanResult] = useState(null);
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleVerify = async () => {
    if (!rawPayload.trim()) return;
    setLoading(true);
    try {
      const parsed = JSON.parse(rawPayload);
      const result = await verifyOfflinePassport(parsed);
      setScanResult(result);
    } catch (e) {
      setScanResult({
        valid: false,
        code: 'JSON_SYNTAX_ERROR',
        title: 'Malformed Payload',
        message: 'Could not decode JSON payload from QR data. Format must match PayBastion Offline Passport specification.',
      });
    } finally {
      setLoading(false);
    }
  };

  // Preset 1: Current active passport
  const handleLoadLatest = () => {
    if (offlinePassports.length > 0) {
      setRawPayload(JSON.stringify(offlinePassports[0], null, 2));
      setScanResult(null);
    }
  };

  // Preset 2: Replay attack (use an already settled passport from journal)
  const handleLoadReplayAttack = () => {
    if (merchantJournal.length > 0) {
      setRawPayload(JSON.stringify(merchantJournal[0], null, 2));
      setScanResult(null);
    } else if (offlinePassports.length > 0) {
      setRawPayload(JSON.stringify(offlinePassports[0], null, 2));
      setScanResult(null);
    }
  };

  // Preset 3: Expired passport test
  const handleLoadExpiredTest = () => {
    const expiredSample = {
      authId: 'AUTH-EXPIRED-TEST-001',
      senderId: 'user-ananya@paybastion',
      recipientId: 'metro-terminal@axis',
      amount: 450.00,
      currency: 'INR',
      nonce: 'nonce-expired-88192a',
      createdAt: new Date(Date.now() - 40 * 60000).toISOString(),
      expiresAt: new Date(Date.now() - 10 * 60000).toISOString(), // expired 10m ago
      signature: 'd9e8f172a6c8b0918237192837bc901a88291029381726a8',
    };
    setRawPayload(JSON.stringify(expiredSample, null, 2));
    setScanResult(null);
  };

  // Preset 4: Tampered signature test
  const handleLoadTampered = () => {
    if (offlinePassports.length > 0) {
      const tampered = { ...offlinePassports[0], amount: 9999.00 }; // altered amount without valid signature
      setRawPayload(JSON.stringify(tampered, null, 2));
      setScanResult(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fadeIn">
      <div className="relative w-full max-w-xl bg-[#0f172a] border border-slate-700 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/80">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-sky-500/10 text-sky-400 border border-sky-500/20">
              <QrCode className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-100 text-base">
                Merchant Terminal QR Scanner & Verification
              </h3>
              <p className="text-xs text-slate-400">Validates HMAC Signature, TTL Expiry & Nonce Replay</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-4">
          {/* Quick Presets for Hackathon Testing */}
          <div>
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-2">
              Hackathon Demonstration Presets:
            </span>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <button
                type="button"
                onClick={handleLoadLatest}
                disabled={offlinePassports.length === 0}
                className="p-2 rounded-lg bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700 text-slate-200 text-left disabled:opacity-40"
              >
                <div className="font-semibold text-emerald-400">1. Valid Token</div>
                <div className="text-[11px] text-slate-400 truncate">Load latest generated passport</div>
              </button>

              <button
                type="button"
                onClick={handleLoadReplayAttack}
                className="p-2 rounded-lg bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700 text-slate-200 text-left"
              >
                <div className="font-semibold text-rose-400">2. Replay Attack</div>
                <div className="text-[11px] text-slate-400 truncate">Resubmit an already settled token</div>
              </button>

              <button
                type="button"
                onClick={handleLoadExpiredTest}
                className="p-2 rounded-lg bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700 text-slate-200 text-left"
              >
                <div className="font-semibold text-amber-400">3. Expired Token</div>
                <div className="text-[11px] text-slate-400 truncate">Test token after TTL expiry</div>
              </button>

              <button
                type="button"
                onClick={handleLoadTampered}
                disabled={offlinePassports.length === 0}
                className="p-2 rounded-lg bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700 text-slate-200 text-left disabled:opacity-40"
              >
                <div className="font-semibold text-purple-400">4. Tampered Payload</div>
                <div className="text-[11px] text-slate-400 truncate">Altered amount (Invalid signature)</div>
              </button>
            </div>
          </div>

          {/* Payload Input */}
          <div>
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1">
              Scanned QR Code Payload (JSON)
            </label>
            <textarea
              rows={5}
              value={rawPayload}
              onChange={(e) => {
                setRawPayload(e.target.value);
                setScanResult(null);
              }}
              placeholder='Paste or load signed authorization JSON payload...'
              className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 font-mono text-xs text-slate-200 focus:outline-none focus:border-sky-500"
            />
          </div>

          {/* Verify Button */}
          <button
            type="button"
            onClick={handleVerify}
            disabled={!rawPayload.trim() || loading}
            className="w-full py-2.5 bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-slate-950 font-bold text-xs rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-sky-500/20 transition-all"
          >
            {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
            Run Cryptographic Terminal Verification
          </button>

          {/* Verification Result Display */}
          {scanResult && (
            <div className={`p-4 rounded-xl border animate-fadeIn ${
              scanResult.valid
                ? 'bg-emerald-950/20 border-emerald-500/40 text-emerald-300'
                : 'bg-rose-950/20 border-rose-500/40 text-rose-300'
            }`}>
              <div className="flex items-start gap-3">
                {scanResult.valid ? (
                  <ShieldCheck className="w-6 h-6 text-emerald-400 shrink-0 mt-0.5" />
                ) : (
                  <ShieldAlert className="w-6 h-6 text-rose-400 shrink-0 mt-0.5" />
                )}
                <div className="space-y-1">
                  <div className="font-bold text-sm flex items-center gap-2">
                    <span>{scanResult.title || (scanResult.valid ? 'Authorization Accepted' : 'Rejected')}</span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-black/40 border border-white/10">
                      {scanResult.code}
                    </span>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    {scanResult.message}
                  </p>
                  {scanResult.valid && (
                    <div className="mt-2 pt-2 border-t border-emerald-500/20 text-[11px] text-emerald-400">
                      • Queued in local terminal journal for delayed batch settlement upon reconnect.
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
