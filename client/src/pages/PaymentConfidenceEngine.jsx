import React, { useState } from 'react';
import ConfidenceBadge, { STATUS_CONFIGS } from '../components/ConfidenceBadge';
import { 
  Zap, 
  CheckCircle2, 
  Clock, 
  AlertTriangle, 
  ShieldCheck, 
  XCircle, 
  ShieldAlert, 
  ArrowRight, 
  Layers,
  HelpCircle,
  Lock,
  GitBranch
} from 'lucide-react';

const STATE_DETAILS = [
  {
    state: 'CONFIRMED',
    title: 'Confirmed',
    badgeClass: 'text-emerald-400',
    color: 'emerald',
    icon: CheckCircle2,
    simpleExplanation: 'Funds have been debited from your account and verified by the destination clearinghouse. The transaction is final.',
    whereAreFunds: 'Delivered to recipient merchant account.',
    safeToRetry: false,
    retryReason: 'Retrying will initiate an independent duplicate debit.',
    technicalDetails: 'Clearinghouse returned HTTP 200 with non-repudiation signature matching idempotency key. Final settlement achieved.'
  },
  {
    state: 'PENDING_VERIFICATION',
    title: 'Pending Verification',
    badgeClass: 'text-amber-400',
    color: 'amber',
    icon: Clock,
    simpleExplanation: 'Your transfer instruction reached the gateway switch, but the final bank settlement ACK was delayed. PayBastion is actively polling the upstream ledger.',
    whereAreFunds: 'In transit between payer bank and payee clearinghouse switch.',
    safeToRetry: false,
    retryReason: 'CRITICAL: Money may have already departed your account. Retrying risks paying twice.',
    technicalDetails: 'Client timeout after ingress acknowledgment. Idempotency lock held. Status inquiry daemon polling provider.'
  },
  {
    state: 'OUTCOME_UNKNOWN',
    title: 'Outcome Unknown',
    badgeClass: 'text-orange-400',
    color: 'orange',
    icon: AlertTriangle,
    simpleExplanation: 'Your cellular or Wi-Fi network broke right as you hit Pay. We cannot yet confirm whether your bank received or executed the instruction.',
    whereAreFunds: 'Unknown until non-debit status inquiry completes.',
    safeToRetry: false,
    retryReason: 'Timeout does not equal failure! Re-authenticating before inquiry risks duplicate payment.',
    technicalDetails: 'Zero response packet received. Socket severed mid-flight. Idempotency token retained to prevent second dispatch.'
  },
  {
    state: 'OFFLINE_AUTHORIZATION',
    title: 'Offline Authorization',
    badgeClass: 'text-sky-400',
    color: 'sky',
    icon: ShieldCheck,
    simpleExplanation: 'A cryptographically signed offline authorization was created with a merchant terminal while air-gapped. NO funds have moved yet.',
    whereAreFunds: 'Still in your account, but committed via cryptographic token held in merchant offline batch journal.',
    safeToRetry: false,
    retryReason: 'Token is already signed and will settle automatically upon network sync.',
    technicalDetails: 'HMAC-SHA256 signature generated locally with nonce replay protection and hard TTL. Settled upon merchant batch upload.'
  },
  {
    state: 'FAILED',
    title: 'Failed',
    badgeClass: 'text-rose-400',
    color: 'rose',
    icon: XCircle,
    simpleExplanation: 'The bank or clearinghouse explicitly rejected the transfer. No money was deducted from your account balance.',
    whereAreFunds: 'Safely in your bank account.',
    safeToRetry: true,
    retryReason: 'Account was never debited. Safe to retry with another card or VPA.',
    technicalDetails: 'Explicit rejection response code (e.g., INSUFFICIENT_FUNDS, USER_CANCELLED, LIMIT_EXCEEDED). Idempotency lock released cleanly.'
  },
  {
    state: 'NEEDS_REVIEW',
    title: 'Needs Review',
    badgeClass: 'text-purple-400',
    color: 'purple',
    icon: ShieldAlert,
    simpleExplanation: 'AI Scam Guardian flagged an anomalous pattern on this transaction (e.g. reverse collect request disguised as refund, spoofed handle).',
    whereAreFunds: 'Safely in your account; transaction execution paused for safety.',
    safeToRetry: false,
    retryReason: 'High risk of phishing or scam payload. User must review warnings before proceeding.',
    technicalDetails: 'Pattern matcher triggered high risk entropy (VPA impersonation keyword or unauthorized URL structure in QR payload).'
  }
];

export default function PaymentConfidenceEngine() {
  const [selectedState, setSelectedState] = useState(STATE_DETAILS[0]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="p-6 rounded-2xl bg-gradient-to-r from-slate-900 via-slate-900 to-[#122038] border border-slate-800">
        <div className="flex items-center gap-2 mb-1">
          <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
            TRANSACTION CLARITY PROTOCOL
          </span>
        </div>
        <h1 className="text-2xl font-extrabold text-white tracking-tight">
          Payment Confidence Engine
        </h1>
        <p className="text-slate-400 text-xs sm:text-sm mt-1 max-w-2xl">
          Digital payments must never leave users guessing. PayBastion codifies 6 unambiguous transaction confidence states, guarantees zero false successes, and explains exactly where your money is.
        </p>
      </div>

      {/* Strict Rule Banner */}
      <div className="p-4 rounded-xl bg-emerald-950/20 border border-emerald-500/30 text-emerald-300 text-xs flex items-start gap-3">
        <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
        <div className="leading-relaxed">
          <span className="font-bold">The Zero-False-Success Invariant: </span>
          A pending or uncertain transaction will NEVER be displayed as successful or confirmed. PayBastion enforces deterministic state verification so users are never misled into believing money moved before the clearinghouse non-repudiation proof is secured.
        </div>
      </div>

      {/* 6 State Selector Pills */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {STATE_DETAILS.map((item) => {
          const isSelected = selectedState.state === item.state;
          const Icon = item.icon;
          return (
            <button
              key={item.state}
              onClick={() => setSelectedState(item)}
              className={`p-3.5 rounded-2xl border text-left transition-all ${
                isSelected
                  ? 'bg-slate-800 border-emerald-500/50 shadow-lg shadow-emerald-500/10'
                  : 'bg-[#0e1626] border-slate-800 hover:border-slate-700'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <ConfidenceBadge state={item.state} size="sm" />
              </div>
              <div className="font-bold text-white text-xs mt-1">{item.title}</div>
            </button>
          );
        })}
      </div>

      {/* Active State Deep-Dive Inspection Card */}
      <div className="bg-[#0e1626] border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-emerald-400">
              <selectedState.icon className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <span>{selectedState.title}</span>
                <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                  {selectedState.state}
                </span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">Confidence State Analysis & Operational Blueprint</p>
            </div>
          </div>

          <div>
            <ConfidenceBadge state={selectedState.state} size="md" />
          </div>
        </div>

        {/* 3 Pillar Breakdown */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          {/* Pillar 1: Plain Language */}
          <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800">
            <span className="text-slate-400 font-semibold uppercase tracking-wider block mb-1 text-[11px]">
              1. Simple User Explanation
            </span>
            <p className="text-slate-200 leading-relaxed">
              {selectedState.simpleExplanation}
            </p>
          </div>

          {/* Pillar 2: Fund Location */}
          <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800">
            <span className="text-slate-400 font-semibold uppercase tracking-wider block mb-1 text-[11px]">
              2. Where are my funds right now?
            </span>
            <p className="text-emerald-300 font-medium leading-relaxed">
              {selectedState.whereAreFunds}
            </p>
          </div>

          {/* Pillar 3: Safe to Retry */}
          <div className={`p-4 rounded-xl border ${
            selectedState.safeToRetry
              ? 'bg-emerald-950/20 border-emerald-500/30 text-emerald-300'
              : 'bg-rose-950/20 border-rose-500/30 text-rose-300'
          }`}>
            <span className="font-semibold uppercase tracking-wider block mb-1 text-[11px]">
              3. Is it safe to retry paying?
            </span>
            <div className="font-bold text-sm mb-1">
              {selectedState.safeToRetry ? 'YES, SAFE TO RETRY' : 'NO, DO NOT RETRY'}
            </div>
            <p className="text-[11px] text-slate-300 leading-relaxed">
              {selectedState.retryReason}
            </p>
          </div>
        </div>

        {/* Technical Architecture Footprint */}
        <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 font-mono text-xs">
          <div className="flex items-center gap-2 text-slate-400 mb-2 pb-2 border-b border-slate-800">
            <Lock className="w-3.5 h-3.5 text-sky-400" />
            <span className="text-slate-300 font-semibold">Technical Architecture Footprint</span>
          </div>
          <p className="text-slate-300 leading-relaxed">
            {selectedState.technicalDetails}
          </p>
        </div>
      </div>

      {/* State Machine Transition Flowchart */}
      <div className="bg-[#0e1626] border border-slate-800 rounded-2xl p-6 shadow-xl">
        <h3 className="font-bold text-white text-base flex items-center gap-2 mb-4">
          <GitBranch className="w-4 h-4 text-emerald-400" />
          <span>PayBastion Resilience State Transition Flow</span>
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
          <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 text-center">
            <div className="font-mono text-slate-400 text-[11px]">1. Ingress</div>
            <div className="font-bold text-white mt-1">Transaction Initiated</div>
            <div className="text-[10px] text-sky-400 mt-1">Idempotency Lock Acquired</div>
          </div>

          <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 text-center">
            <div className="font-mono text-slate-400 text-[11px]">2. If Interrupted</div>
            <div className="font-bold text-orange-400 mt-1">Outcome Unknown</div>
            <div className="text-[10px] text-slate-400 mt-1">Duplicate Retries Blocked</div>
          </div>

          <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 text-center">
            <div className="font-mono text-slate-400 text-[11px]">3. Pre-Flight Inquiry</div>
            <div className="font-bold text-amber-400 mt-1">Smart Recovery Query</div>
            <div className="text-[10px] text-slate-400 mt-1">Non-Debit Status Probe</div>
          </div>

          <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 text-center">
            <div className="font-mono text-slate-400 text-[11px]">4. Final Resolution</div>
            <div className="font-bold text-emerald-400 mt-1">Confirmed or Failed</div>
            <div className="text-[10px] text-emerald-400 mt-1">Zero Duplicate Debits</div>
          </div>
        </div>
      </div>
    </div>
  );
}
