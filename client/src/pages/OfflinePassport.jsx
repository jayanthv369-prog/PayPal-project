import React, { useState } from 'react';
import { usePayment } from '../context/PaymentContext';
import { useNetwork } from '../context/NetworkContext';
import QrCodeDisplay from '../components/QrCodeDisplay';
import QrScannerModal from '../components/QrScannerModal';
import { 
  QrCode, 
  ShieldCheck, 
  Clock, 
  AlertTriangle, 
  KeyRound, 
  Send, 
  CheckCircle2, 
  Scan, 
  FileText, 
  Layers,
  ArrowRight
} from 'lucide-react';

export default function OfflinePassport() {
  const { createOfflinePassport, offlinePassports, merchantJournal } = usePayment();
  const { isSimulatedOffline } = useNetwork();

  // Generator form state
  const [amount, setAmount] = useState('350.00');
  const [recipientId, setRecipientId] = useState('namma-metro-kiosk@axis');
  const [recipientName, setRecipientName] = useState('Namma Metro Transit Kiosk');
  const [expiryMinutes, setExpiryMinutes] = useState(15);
  const [activePassport, setActivePassport] = useState(offlinePassports[0] || null);
  const [isGenerating, setIsGenerating] = useState(false);

  // Merchant Scanner Modal state
  const [scannerOpen, setScannerOpen] = useState(false);

  const handleGenerate = async (e) => {
    e.preventDefault();
    if (!amount || parseFloat(amount) <= 0) return;
    setIsGenerating(true);

    const passport = await createOfflinePassport({
      amount: parseFloat(amount),
      recipientId,
      recipientName,
      expiryMinutes: parseInt(expiryMinutes, 10),
    });

    setActivePassport(passport);
    setIsGenerating(false);
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="p-6 rounded-2xl bg-gradient-to-r from-slate-900 via-slate-900 to-[#0e2137] border border-slate-800">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-sky-500/10 text-sky-400 border border-sky-500/30">
                OFFLINE PROTOCOL • AIR-GAPPED AUTHORIZATION
              </span>
              {isSimulatedOffline && (
                <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                  OFFLINE MODE ENGAGED
                </span>
              )}
            </div>
            <h1 className="text-2xl font-extrabold text-white tracking-tight">
              Offline Payment Passport
            </h1>
            <p className="text-slate-400 text-xs sm:text-sm mt-1 max-w-2xl">
              Issue time-bound, cryptographically signed offline payment authorization tokens that work with zero cellular or Wi-Fi connectivity.
            </p>
          </div>

          <button
            onClick={() => setScannerOpen(true)}
            className="px-4 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs flex items-center gap-2 shadow-lg shadow-sky-500/20 transition-all self-start md:self-auto"
          >
            <Scan className="w-4 h-4" />
            Open Merchant Terminal Scanner
          </button>
        </div>
      </div>

      {/* Strict Security Architecture Notice */}
      <div className="p-4 rounded-xl bg-amber-950/20 border border-amber-500/30 text-amber-300 text-xs flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
        <div className="leading-relaxed">
          <span className="font-bold">Cryptographic Non-Finality Rule: </span>
          An offline authorization token is NOT a settled payment and will never be represented as one. It is a signed commitment token with strict TTL and nonce replay protection, queued in the merchant's secure storage until online batch clearing occurs. Single offline ceiling is strictly capped at ₹2,000.
        </div>
      </div>

      {/* Main Two-Column Layout: Creator Form vs QR Display */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Generator Form (5 cols) */}
        <div className="lg:col-span-5 bg-[#0e1626] border border-slate-800 rounded-2xl p-6 shadow-xl space-y-5">
          <div className="flex items-center gap-2 pb-3 border-b border-slate-800">
            <KeyRound className="w-5 h-5 text-sky-400" />
            <h2 className="font-bold text-white text-base">Generate Offline Token</h2>
          </div>

          <form onSubmit={handleGenerate} className="space-y-4 text-xs">
            {/* Amount */}
            <div>
              <label className="font-semibold text-slate-300 block mb-1">
                Authorization Amount (₹ Max ₹2,000)
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm">₹</span>
                <input
                  type="number"
                  step="0.01"
                  max="2000"
                  min="1"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full pl-8 pr-3 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono font-bold text-sm focus:outline-none focus:border-sky-500"
                  required
                />
              </div>
              <p className="text-[11px] text-slate-500 mt-1">Capped at ₹2,000 for network-disconnected risk boundary.</p>
            </div>

            {/* Recipient restriction */}
            <div>
              <label className="font-semibold text-slate-300 block mb-1">
                Recipient Restriction (VPA / Terminal ID)
              </label>
              <select
                value={recipientId}
                onChange={(e) => {
                  setRecipientId(e.target.value);
                  if (e.target.value.includes('metro')) setRecipientName('Namma Metro Transit Kiosk');
                  else if (e.target.value.includes('toll')) setRecipientName('NHAI FASTag Toll Plaza 14');
                  else setRecipientName('Coffee Day Express');
                }}
                className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 focus:outline-none focus:border-sky-500 font-mono"
              >
                <option value="namma-metro-kiosk@axis">namma-metro-kiosk@axis (Metro Turnstile)</option>
                <option value="nhai-toll-plaza-14@icici">nhai-toll-plaza-14@icici (Offline Highway Toll)</option>
                <option value="coffee-day-express@sbi">coffee-day-express@sbi (In-Flight / Remote Cafe)</option>
              </select>
            </div>

            {/* Expiry TTL Selection */}
            <div>
              <label className="font-semibold text-slate-300 block mb-1">
                Authorization Validity (Strict TTL)
              </label>
              <div className="grid grid-cols-3 gap-2">
                {[5, 15, 60].map((mins) => (
                  <button
                    key={mins}
                    type="button"
                    onClick={() => setExpiryMinutes(mins)}
                    className={`py-2 rounded-xl font-semibold border transition-all ${
                      expiryMinutes === mins
                        ? 'bg-sky-500/20 text-sky-400 border-sky-500/40'
                        : 'bg-slate-950 text-slate-400 border-slate-800 hover:bg-slate-900'
                    }`}
                  >
                    {mins} Minutes
                  </button>
                ))}
              </div>
            </div>

            {/* Security assertions summary */}
            <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800/80 space-y-1.5 text-[11px] text-slate-400 font-mono">
              <div className="flex items-center gap-1.5 text-slate-300">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>HMAC-SHA256 Browser WebCrypto Signature</span>
              </div>
              <div className="flex items-center gap-1.5 text-slate-300">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>One-Time Nonce Replay Defense</span>
              </div>
              <div className="flex items-center gap-1.5 text-slate-300">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>Hardbound Recipient Scoping</span>
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isGenerating}
              className="w-full py-3 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-sky-500/20 transition-all"
            >
              <QrCode className="w-4 h-4" />
              <span>{isGenerating ? 'Signing Token...' : 'Generate Signed Offline Passport'}</span>
            </button>
          </form>
        </div>

        {/* Right Column: Active QR Code & Inspection (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          {activePassport ? (
            <QrCodeDisplay passportData={activePassport} />
          ) : (
            <div className="bg-[#0e1626] border border-slate-800 rounded-2xl p-10 flex flex-col items-center justify-center text-center h-full text-slate-500">
              <QrCode className="w-16 h-16 mb-3 opacity-30 text-sky-400" />
              <p className="font-semibold text-sm text-slate-300">No active offline passport selected</p>
              <p className="text-xs text-slate-500 mt-1">Use the form on the left to issue your first signed offline payment token.</p>
            </div>
          )}
        </div>
      </div>

      {/* Merchant Delayed Settlement Journal Table */}
      <div className="bg-[#0e1626] border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between bg-slate-900/60">
          <div>
            <h3 className="font-bold text-white text-base flex items-center gap-2">
              <Layers className="w-4 h-4 text-sky-400" />
              <span>Merchant Delayed Settlement Journal</span>
              <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-slate-800 text-slate-300">
                {merchantJournal.length} authorizations scanned
              </span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Verified offline authorizations queued in merchant terminal storage awaiting online batch sync
            </p>
          </div>
        </div>

        {merchantJournal.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-xs">
            No offline tokens scanned by merchant terminal yet. Click <span className="text-sky-400 font-semibold">"Open Merchant Terminal Scanner"</span> above to test verification.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-900/90 text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-800">
                <tr>
                  <th className="py-3 px-4">Hold ID / Nonce</th>
                  <th className="py-3 px-4">Sender</th>
                  <th className="py-3 px-4">Authorized Amount</th>
                  <th className="py-3 px-4">Scanned At</th>
                  <th className="py-3 px-4">Settlement Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {merchantJournal.map((entry, idx) => (
                  <tr key={idx} className="hover:bg-slate-900/40">
                    <td className="py-3 px-4 font-mono">
                      <div className="text-slate-200 font-semibold">{entry.terminalHoldId}</div>
                      <div className="text-[11px] text-slate-500">{entry.nonce?.substring(0, 16)}...</div>
                    </td>
                    <td className="py-3 px-4 text-slate-300">{entry.senderId}</td>
                    <td className="py-3 px-4 font-bold text-emerald-400 font-mono">₹{parseFloat(entry.amount).toFixed(2)}</td>
                    <td className="py-3 px-4 text-slate-400 font-mono text-[11px]">
                      {new Date(entry.scannedAt).toLocaleTimeString()}
                    </td>
                    <td className="py-3 px-4">
                      <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/30">
                        SETTLEMENT_PENDING
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Terminal Scanner Modal */}
      <QrScannerModal isOpen={scannerOpen} onClose={() => setScannerOpen(false)} />
    </div>
  );
}
