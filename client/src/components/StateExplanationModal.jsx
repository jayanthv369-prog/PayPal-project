import React, { useState, useEffect } from 'react';
import { usePayment } from '../context/PaymentContext';
import { api } from '../utils/api';
import ConfidenceBadge, { STATUS_CONFIGS } from './ConfidenceBadge';
import { X, ShieldAlert, CheckCircle2, Clock, AlertTriangle, ArrowRight, RefreshCw, KeyRound, Lock, ExternalLink } from 'lucide-react';

export default function StateExplanationModal() {
  const { selectedTxnForExplanation, setSelectedTxnForExplanation, reconcileTransaction, retryPayment } = usePayment();
  const [aiExplanation, setAiExplanation] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState(null);

  useEffect(() => {
    if (!selectedTxnForExplanation) {
      setAiExplanation(null);
      return;
    }

    const txn = selectedTxnForExplanation;
    if (txn.userExplanation && txn.technicalDiagnosis) {
      setAiExplanation({
        userExplanation: txn.userExplanation,
        technicalDiagnosis: txn.technicalDiagnosis,
        safeToRetry: txn.safeToRetry,
        recommendedAction: txn.explanation?.recommendedAction || '',
      });
      return;
    }

    setAiLoading(true);
    api.explainState({
      state: txn.state,
      amount: txn.amount,
      recipient: txn.recipient,
      failurePoint: txn.technicalDiagnosis,
    })
      .then(res => {
        if (res) setAiExplanation(res);
      })
      .catch(e => {
        console.warn('Explain state API note:', e.message);
      })
      .finally(() => {
        setAiLoading(false);
      });
  }, [selectedTxnForExplanation]);

  if (!selectedTxnForExplanation) return null;

  const txn = selectedTxnForExplanation;
  const config = STATUS_CONFIGS[txn.state] || STATUS_CONFIGS.OUTCOME_UNKNOWN;

  const activeExplanation = aiExplanation || {
    userExplanation: txn.userExplanation || config.shortDesc,
    technicalDiagnosis: txn.technicalDiagnosis || 'Idempotency lock active.',
    safeToRetry: txn.safeToRetry,
    recommendedAction: txn.explanation?.recommendedAction || '',
  };

  const handleReconcileNow = async () => {
    await reconcileTransaction(txn.id);
    setSelectedTxnForExplanation(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fadeIn">
      <div className="relative w-full max-w-2xl bg-[#0f172a] border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/60">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-slate-800 text-emerald-400 border border-slate-700">
              <KeyRound className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-100 flex items-center gap-2 text-base">
                Payment Confidence Diagnosis
              </h3>
              <p className="text-xs text-slate-400 font-mono">ID: {txn.id}</p>
            </div>
          </div>
          <button
            onClick={() => setSelectedTxnForExplanation(null)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="p-6 overflow-y-auto space-y-5 text-sm">
          {/* Status Header Pill */}
          <div className="flex items-center justify-between p-4 rounded-xl bg-slate-900/80 border border-slate-800">
            <div>
              <span className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Active State</span>
              <div className="mt-1">
                <ConfidenceBadge state={txn.state} size="md" />
              </div>
            </div>
            <div className="text-right">
              <span className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Amount</span>
              <div className="text-lg font-bold text-white">
                {txn.currency === 'USD' ? '$' : '₹'}{Number(txn.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </div>
            </div>
          </div>

          {/* Plain Language Explanation */}
          <div className="p-4 rounded-xl bg-slate-900/50 border border-slate-800/80">
            <h4 className="text-xs font-semibold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5 mb-2">
              <CheckCircle2 className="w-4 h-4" />
              What this means in plain language
            </h4>
            <p className="text-slate-200 leading-relaxed">
              {activeExplanation.userExplanation}
            </p>
          </div>

          {/* Technical Diagnosis */}
          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 font-mono text-xs">
            <div className="flex items-center justify-between text-slate-400 mb-2 pb-2 border-b border-slate-800">
              <span className="font-semibold text-slate-300 flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-sky-400" />
                Technical & Cryptographic Diagnosis
              </span>
              <span className="text-[11px] text-slate-500">Idempotency-Protected</span>
            </div>
            <p className="text-slate-300 leading-relaxed">
              {activeExplanation.technicalDiagnosis}
            </p>
            <div className="mt-3 pt-2 border-t border-slate-800/60 grid grid-cols-2 gap-2 text-[11px] text-slate-400">
              <div>
                <span className="text-slate-500">Idempotency Key:</span>{' '}
                <span className="text-sky-300">{txn.idempotencyKey}</span>
              </div>
              <div>
                <span className="text-slate-500">Channel:</span>{' '}
                <span className="text-emerald-300">{txn.channel}</span>
              </div>
            </div>
          </div>

          {/* Safe to retry indicator */}
          <div className={`p-4 rounded-xl border flex items-start gap-3 ${
            txn.safeToRetry
              ? 'bg-emerald-950/20 border-emerald-500/30 text-emerald-300'
              : 'bg-rose-950/20 border-rose-500/30 text-rose-300'
          }`}>
            {txn.safeToRetry ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
            ) : (
              <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
            )}
            <div>
              <div className="font-semibold text-sm">
                {txn.safeToRetry ? 'Safe to Retry Payment' : 'DO NOT RETRY PAYMENT DIRECTLY'}
              </div>
              <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                {txn.safeToRetry
                  ? 'The bank explicitly confirmed that no debit was executed. Your account balance is intact.'
                  : 'A payment timeout does NOT prove failure. The bank may have already debited your funds. Retrying without reconciliation risks paying twice.'}
              </p>
            </div>
          </div>

          {/* Chronological Audit Logs */}
          <div>
            <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
              Chronological Audit Ledger
            </h4>
            <div className="space-y-2 border-l-2 border-slate-800 pl-3">
              {(txn.logs || []).map((log, idx) => (
                <div key={idx} className="relative text-xs">
                  <div className="absolute -left-[19px] top-1.5 w-2 h-2 rounded-full bg-emerald-500 ring-4 ring-[#0f172a]" />
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-300">{log.event}</span>
                    <span className="text-[11px] text-slate-500 font-mono">
                      {new Date(log.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                  <p className="text-slate-400 mt-0.5">{log.detail}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 bg-slate-900/80 border-t border-slate-800 flex items-center justify-between gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => setSelectedTxnForExplanation(null)}
            className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            Close
          </button>

          <div className="flex items-center gap-2">
            {/* Blocked retry button when state is OUTCOME_UNKNOWN */}
            {txn.state === 'OUTCOME_UNKNOWN' && (
              <button
                type="button"
                disabled={true}
                title="Payment outcome is unknown. Please use Smart Reconcile before attempting another payment."
                className="px-3.5 py-2 rounded-lg bg-slate-800/90 text-slate-500 border border-slate-700/60 text-xs font-semibold cursor-not-allowed opacity-60 flex items-center gap-1.5"
              >
                <Lock className="w-3.5 h-3.5 text-slate-500" />
                <span>Retry Payment (Blocked)</span>
              </button>
            )}

            {/* Blocked retry button when state is PENDING_VERIFICATION */}
            {txn.state === 'PENDING_VERIFICATION' && (
              <button
                type="button"
                disabled={true}
                title="Payment verification is pending. Please use Smart Reconcile before attempting another payment."
                className="px-3.5 py-2 rounded-lg bg-slate-800/90 text-slate-500 border border-slate-700/60 text-xs font-semibold cursor-not-allowed opacity-60 flex items-center gap-1.5"
              >
                <Lock className="w-3.5 h-3.5 text-slate-500" />
                <span>Retry Payment (Blocked)</span>
              </button>
            )}

            {/* Enabled retry button when state is confirmed FAILED */}
            {txn.state === 'FAILED' && (
              <button
                type="button"
                onClick={async () => {
                  setRetrying(true);
                  setRetryError(null);
                  try {
                    const res = await retryPayment(txn.id);
                    if (res && res.success) {
                      setSelectedTxnForExplanation(null);
                    } else {
                      setRetryError(res?.message || 'Retry failed');
                    }
                  } catch (err) {
                    setRetryError(err.message);
                  } finally {
                    setRetrying(false);
                  }
                }}
                disabled={retrying}
                className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-xs rounded-lg flex items-center gap-1.5 shadow-lg shadow-emerald-500/20 transition-all disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${retrying ? 'animate-spin' : ''}`} />
                <span>{retrying ? 'Retrying...' : 'Retry Payment (Fresh Key)'}</span>
              </button>
            )}

            {(txn.state === 'PENDING_VERIFICATION' || txn.state === 'OUTCOME_UNKNOWN') && (
              <button
                type="button"
                onClick={handleReconcileNow}
                className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-xs rounded-lg flex items-center gap-1.5 shadow-lg shadow-emerald-500/20 transition-all"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Reconcile via Smart Recovery
              </button>
            )}
          </div>
        </div>
        {retryError && (
          <div className="px-6 py-2 bg-rose-500/10 border-t border-rose-500/30 text-rose-300 text-xs">
            {retryError}
          </div>
        )}
      </div>
    </div>
  );
}
