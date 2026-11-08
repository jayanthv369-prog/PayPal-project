import React, { useState } from 'react';
import { usePayment } from '../context/PaymentContext';
import { 
  CreditCard, 
  ShieldAlert, 
  CheckCircle2, 
  Clock, 
  AlertTriangle, 
  Sparkles, 
  ArrowRight, 
  DollarSign, 
  RotateCcw,
  UserCheck,
  FileCheck
} from 'lucide-react';

export default function CreditBridge() {
  const { creditProfile, activateCreditBridge, repayCreditInstallment } = usePayment();

  const [consentChecked, setConsentChecked] = useState(creditProfile.consentGiven);
  const [recipient, setRecipient] = useState('medical-hospital-pharmacy@axis');
  const [recipientName, setRecipientName] = useState('Apollo Emergency Pharmacy');
  const [amount, setAmount] = useState('650.00');
  const [activationResult, setActivationResult] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');

  const handleActivate = async (e) => {
    e.preventDefault();
    if (!consentChecked) {
      setErrorMsg('Explicit user consent is mandatory before activating simulated temporary credit.');
      return;
    }
    setErrorMsg('');

    const res = await activateCreditBridge({
      targetTxnId: `TXN-STUCK-${Date.now()}`,
      amount: parseFloat(amount),
      recipient,
      recipientName,
    });

    if (res && res.success) {
      setActivationResult(res);
    } else {
      setErrorMsg(res?.message || 'Failed to activate credit bridge');
    }
  };

  const utilizationPercent = Math.min(
    100,
    Math.round((creditProfile.utilizedCredit / creditProfile.creditLimit) * 100)
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="p-6 rounded-2xl bg-gradient-to-r from-slate-900 via-slate-900 to-[#18203c] border border-slate-800">
        <div className="flex items-center gap-2 mb-1">
          <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-sky-500/10 text-sky-400 border border-sky-500/30">
            SIMULATION ONLY • EMERGENCY INTERMEDIARY BUFFER
          </span>
        </div>
        <h1 className="text-2xl font-extrabold text-white tracking-tight">
          Temporary Credit Bridge
        </h1>
        <p className="text-slate-400 text-xs sm:text-sm mt-1 max-w-2xl">
          A simulated demonstration intermediary credit buffer that can cover a time-sensitive merchant payment when bank networks freeze or a previous transaction is stuck in verification limbo.
        </p>
      </div>

      {/* Mandatory Prominent Simulation & Disclaimer Banner */}
      <div className="p-4 rounded-xl bg-purple-950/20 border border-purple-500/30 text-purple-300 text-xs flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-purple-400 shrink-0 mt-0.5" />
        <div className="leading-relaxed">
          <span className="font-bold">EDUCATIONAL DEMONSTRATION NOTICE: </span>
          {creditProfile.disclaimer} All limits, balances, and repayments in this module are completely fictional simulations for hackathon demonstration. PayBastion does not conduct live lending or interface with CIBIL.
        </div>
      </div>

      {/* Profile & Limits Overview Card */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* User Profile */}
        <div className="glass-card p-5 rounded-2xl border border-slate-800">
          <div className="flex items-center justify-between text-xs text-slate-400 uppercase font-semibold">
            <span>Fictional Profile</span>
            <UserCheck className="w-4 h-4 text-sky-400" />
          </div>
          <div className="mt-2">
            <div className="text-lg font-bold text-white">{creditProfile.userName}</div>
            <div className="text-xs text-slate-500 font-mono">{creditProfile.userId}</div>
            <div className="mt-3 flex items-center gap-2">
              <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                Simulated Score: {creditProfile.trustScore}/900
              </span>
            </div>
          </div>
        </div>

        {/* Credit Limit Meter */}
        <div className="glass-card p-5 rounded-2xl border border-slate-800">
          <div className="flex items-center justify-between text-xs text-slate-400 uppercase font-semibold">
            <span>Simulated Credit Line</span>
            <CreditCard className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="mt-2">
            <div className="flex items-baseline justify-between">
              <span className="text-2xl font-black text-white">
                ₹{creditProfile.availableCredit.toLocaleString('en-IN')}
              </span>
              <span className="text-xs text-slate-400 font-mono">
                of ₹{creditProfile.creditLimit.toLocaleString('en-IN')}
              </span>
            </div>
            <div className="w-full bg-slate-900 h-2 rounded-full mt-3 overflow-hidden border border-slate-800">
              <div 
                className="bg-gradient-to-r from-emerald-500 to-sky-400 h-full rounded-full transition-all"
                style={{ width: `${100 - utilizationPercent}%` }}
              />
            </div>
            <div className="flex justify-between text-[11px] text-slate-400 mt-1.5 font-mono">
              <span>Utilized: ₹{creditProfile.utilizedCredit}</span>
              <span>Available: {100 - utilizationPercent}%</span>
            </div>
          </div>
        </div>

        {/* Eligibility Status */}
        <div className="glass-card p-5 rounded-2xl border border-slate-800">
          <div className="flex items-center justify-between text-xs text-slate-400 uppercase font-semibold">
            <span>Fallback Eligibility</span>
            <CheckCircle2 className="w-4 h-4 text-sky-400" />
          </div>
          <div className="mt-2">
            <div className="text-sm font-bold text-emerald-400 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              Eligible for Instant Fallback
            </div>
            <p className="text-xs text-slate-400 mt-2 leading-relaxed">
              In-flight transactions under ₹2,000 can be temporarily covered while clearinghouse inquiry proceeds.
            </p>
          </div>
        </div>
      </div>

      {/* Two Column Layout: Fallback Activation & Repayment Schedule */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Fallback Activation Form (6 cols) */}
        <div className="lg:col-span-6 bg-[#0e1626] border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <h2 className="font-bold text-white text-base flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-sky-400" />
              <span>Simulate Emergency Fallback Payment</span>
            </h2>
            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-sky-500/10 text-sky-400 border border-sky-500/20">
              Simulation
            </span>
          </div>

          <form onSubmit={handleActivate} className="space-y-4 text-xs">
            <div>
              <label className="font-semibold text-slate-300 block mb-1">
                Merchant / Service Recipient
              </label>
              <input
                type="text"
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono focus:border-sky-500 focus:outline-none"
                required
              />
            </div>

            <div>
              <label className="font-semibold text-slate-300 block mb-1">
                Fallback Coverage Amount (₹)
              </label>
              <input
                type="number"
                step="0.01"
                min="10"
                max={creditProfile.availableCredit}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-emerald-400 font-mono font-bold text-sm focus:border-sky-500 focus:outline-none"
                required
              />
              <span className="text-[11px] text-slate-500 mt-1 block">
                Available credit: ₹{creditProfile.availableCredit.toFixed(2)}
              </span>
            </div>

            {/* Mandatory User Consent Checkbox */}
            <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={consentChecked}
                  onChange={(e) => setConsentChecked(e.target.checked)}
                  className="mt-0.5 accent-sky-500 w-4 h-4 rounded"
                />
                <span className="text-slate-300 text-xs leading-relaxed">
                  I explicitly consent to the PayBastion Temporary Credit Bridge covering this merchant debit under a 7-day zero-interest demonstration repayment schedule.
                </span>
              </label>
            </div>

            {errorMsg && (
              <div className="p-3 rounded-xl bg-rose-950/20 border border-rose-500/30 text-rose-300 text-xs">
                {errorMsg}
              </div>
            )}

            {activationResult && (
              <div className="p-3 rounded-xl bg-emerald-950/20 border border-emerald-500/30 text-emerald-300 text-xs space-y-1 animate-fadeIn">
                <div className="font-bold flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  Fallback Disbursed (Simulation)
                </div>
                <p className="text-slate-300">
                  Loan Ref: <span className="font-mono text-white">{activationResult.bridgeLoanId}</span>. Repayment installment due on {activationResult.installment.dueDate}.
                </p>
              </div>
            )}

            <button
              type="submit"
              className="w-full py-3 rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-slate-950 font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-sky-500/20 transition-all"
            >
              <CreditCard className="w-4 h-4" />
              <span>Activate Credit Bridge Fallback (₹{amount})</span>
            </button>
          </form>
        </div>

        {/* Right: Repayment Schedule & Action Table (6 cols) */}
        <div className="lg:col-span-6 bg-[#0e1626] border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div>
              <h2 className="font-bold text-white text-base">Simulated Repayment Schedule</h2>
              <p className="text-xs text-slate-400">Zero-interest educational schedule</p>
            </div>
            <span className="text-xs text-slate-400 font-mono">
              {creditProfile.repaymentSchedule.filter(i => i.status === 'PENDING').length} upcoming
            </span>
          </div>

          <div className="space-y-3">
            {creditProfile.repaymentSchedule.map((inst) => {
              const isRepaid = inst.status === 'REPAID';
              return (
                <div
                  key={inst.id}
                  className={`p-3.5 rounded-xl border flex items-center justify-between gap-3 transition-colors ${
                    isRepaid
                      ? 'bg-slate-950/60 border-slate-800/80 text-slate-500'
                      : 'bg-slate-900 border-slate-800 text-slate-200'
                  }`}
                >
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-xs text-white">{inst.id}</span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        isRepaid
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                          : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                      }`}>
                        {inst.status}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-400 flex items-center gap-2">
                      <Clock className="w-3 h-3" />
                      <span>Due Date: {inst.dueDate}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="font-mono font-bold text-emerald-400 text-sm">
                      ₹{inst.amount.toFixed(2)}
                    </span>

                    {!isRepaid && (
                      <button
                        type="button"
                        onClick={() => repayCreditInstallment(inst.id)}
                        className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold shadow-sm transition-all flex items-center gap-1"
                      >
                        <span>Repay</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
