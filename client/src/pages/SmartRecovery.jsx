import React, { useState } from 'react';
import { usePayment } from '../context/PaymentContext';
import { useNetwork } from '../context/NetworkContext';
import { api } from '../utils/api';
import ConfidenceBadge from '../components/ConfidenceBadge';
import { 
  RefreshCw, 
  RotateCw, 
  AlertTriangle, 
  CheckCircle2, 
  Lock, 
  KeyRound, 
  Zap, 
  Play, 
  Clock, 
  ShieldCheck, 
  ArrowRight,
  Database,
  History
} from 'lucide-react';

export default function SmartRecovery() {
  const { transactions, reconcileTransaction, addTransaction, setSelectedTxnForExplanation } = usePayment();
  const { networkMode, setNetworkMode, NETWORK_MODES } = useNetwork();

  const [simulating, setSimulating] = useState(false);
  const [reconcilingId, setReconcilingId] = useState(null);
  const [activeStep, setActiveStep] = useState(0);

  // Filter in-flight/uncertain transactions
  const uncertainTransactions = transactions.filter(
    (t) => t.state === 'PENDING_VERIFICATION' || t.state === 'OUTCOME_UNKNOWN'
  );

  /**
   * Interactive Interrupted Payment Simulator
   */
  const handleSimulateInterruption = async () => {
    setSimulating(true);
    setActiveStep(1); // Step 1: Idempotency Key Lock

    const tempTxnId = `TXN-INTERRUPT-${Date.now().toString().slice(-5)}`;
    const idempotencyKey = `IDEMP-RECOVER-${Date.now()}`;
    const amount = 780.00;
    const recipient = 'grocery-mart@icici';
    const recipientName = 'Apollo Pharmacy & Essentials';

    // Step 1: Acquire client & backend idempotency lock
    try {
      await api.registerRecoveryTransaction({
        idempotencyKey,
        amount,
        recipient,
        recipientName,
        channel: 'UPI_ONLINE',
        state: 'OUTCOME_UNKNOWN',
      });
    } catch (e) { /* fallback to local */ }
    await new Promise((r) => setTimeout(r, 800));
    setActiveStep(2); // Step 2: Sending payment instruction to bank

    // Step 2: Dispatch payment
    await new Promise((r) => setTimeout(r, 1200));
    setActiveStep(3); // Step 3: Connection drop / Timeout detected

    // Step 3: Network break occurs!
    await new Promise((r) => setTimeout(r, 900));

    const interruptedTxn = {
      id: tempTxnId,
      idempotencyKey,
      amount,
      currency: 'INR',
      sender: 'user-ananya@okaxis',
      recipient,
      recipientName,
      category: 'Medical & Pharmacy',
      channel: 'UPI_ONLINE',
      state: 'OUTCOME_UNKNOWN',
      confidenceScore: 32,
      createdAt: new Date().toISOString(),
      needsReconciliation: true,
      safeToRetry: false,
      userExplanation: 'The cellular data stream was interrupted while awaiting the bank clearinghouse acknowledgement. The transaction state is currently unknown.',
      technicalDiagnosis: 'TCP socket severed during gateway roundtrip. Idempotency lock held to block duplicate user attempts.',
      logs: [
        { timestamp: new Date().toISOString(), event: 'LOCK_ACQUIRED', detail: `Idempotency key ${idempotencyKey} assigned.` },
        { timestamp: new Date(Date.now() + 600).toISOString(), event: 'DISPATCHED_TO_GATEWAY', detail: 'Payload forwarded to upstream switch.' },
        { timestamp: new Date(Date.now() + 1800).toISOString(), event: 'TCP_RESET_RECEIVED', detail: 'Connection severed mid-transit. Awaiting Smart Reconciler inquiry.' }
      ]
    };

    addTransaction(interruptedTxn);
    setActiveStep(4); // Step 4: Transaction held in Outcome Unknown
    setSimulating(false);
  };

  /**
   * Run Smart Reconcile on an in-flight transaction
   */
  const handleReconcile = async (txnId) => {
    setReconcilingId(txnId);
    await reconcileTransaction(txnId, 'SUCCESS');
    setReconcilingId(null);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="p-6 rounded-2xl bg-gradient-to-r from-slate-900 via-slate-900 to-[#102434] border border-slate-800">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                AI RECONCILIATION ENGINE
              </span>
            </div>
            <h1 className="text-2xl font-extrabold text-white tracking-tight">
              Smart Recovery AI
            </h1>
            <p className="text-slate-400 text-xs sm:text-sm mt-1 max-w-2xl">
              Prevents duplicate debits during payment dropouts. Queries the original provider ledger via idempotency keys before permitting any retry.
            </p>
          </div>

          <button
            onClick={handleSimulateInterruption}
            disabled={simulating}
            className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-bold text-xs flex items-center gap-2 shadow-lg shadow-orange-500/20 transition-all disabled:opacity-50 self-start md:self-auto"
          >
            {simulating ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            <span>{simulating ? 'Simulating Interruption...' : 'Simulate Interrupted Payment'}</span>
          </button>
        </div>
      </div>

      {/* Step Visualizer when simulating */}
      {simulating && (
        <div className="p-5 rounded-2xl bg-slate-900 border border-amber-500/30 shadow-xl space-y-3 animate-fadeIn">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-amber-400 flex items-center gap-2">
              <RefreshCw className="w-4 h-4 animate-spin" />
              Live Interruption Lifecycle Simulation:
            </span>
            <span className="text-slate-400 font-mono">Step {activeStep} of 4</span>
          </div>

          <div className="grid grid-cols-4 gap-2 text-xs">
            <div className={`p-2.5 rounded-xl border ${activeStep >= 1 ? 'bg-slate-800 border-emerald-500/40 text-emerald-300' : 'bg-slate-950 border-slate-800 text-slate-500'}`}>
              <div className="font-bold">1. Idempotency Lock</div>
              <div className="text-[10px]">Client acquires one-time lock</div>
            </div>
            <div className={`p-2.5 rounded-xl border ${activeStep >= 2 ? 'bg-slate-800 border-emerald-500/40 text-emerald-300' : 'bg-slate-950 border-slate-800 text-slate-500'}`}>
              <div className="font-bold">2. Payment Dispatched</div>
              <div className="text-[10px]">In-flight to bank clearinghouse</div>
            </div>
            <div className={`p-2.5 rounded-xl border ${activeStep >= 3 ? 'bg-rose-950/40 border-rose-500/40 text-rose-300' : 'bg-slate-950 border-slate-800 text-slate-500'}`}>
              <div className="font-bold">3. Network Socket Drop</div>
              <div className="text-[10px]">Connection severed mid-transit</div>
            </div>
            <div className={`p-2.5 rounded-xl border ${activeStep >= 4 ? 'bg-amber-950/40 border-amber-500/40 text-amber-300' : 'bg-slate-950 border-slate-800 text-slate-500'}`}>
              <div className="font-bold">4. Outcome Unknown</div>
              <div className="text-[10px]">Retry blocked; inquiry queued</div>
            </div>
          </div>
        </div>
      )}

      {/* Core Principle Callout */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="glass-card p-4 rounded-xl border border-slate-800">
          <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400 uppercase tracking-wider mb-1">
            <ShieldCheck className="w-4 h-4" />
            Rule 1: Timeout ≠ Failure
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">
            A network drop or timeout does not mean money did not move. Upstream banking cores settle asynchronously.
          </p>
        </div>

        <div className="glass-card p-4 rounded-xl border border-slate-800">
          <div className="flex items-center gap-2 text-xs font-semibold text-sky-400 uppercase tracking-wider mb-1">
            <Lock className="w-4 h-4" />
            Rule 2: Mandatory Inquiry First
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">
            Before permitting any retry, PayBastion queries the clearinghouse with the original idempotency key to prevent paying twice.
          </p>
        </div>

        <div className="glass-card p-4 rounded-xl border border-slate-800">
          <div className="flex items-center gap-2 text-xs font-semibold text-amber-400 uppercase tracking-wider mb-1">
            <Database className="w-4 h-4" />
            Rule 3: Non-Repudiation Sync
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">
            When online connectivity resumes, transaction journals automatically reconcile against provider reference records.
          </p>
        </div>
      </div>

      {/* Uncertain Transactions Waiting for Recovery */}
      <div className="bg-[#0e1626] border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between bg-slate-900/60">
          <div>
            <h2 className="font-bold text-white text-base flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              <span>Uncertain Transactions Queue</span>
              <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                {uncertainTransactions.length} Pending Inquiry
              </span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              These transactions timed out mid-flight. Idempotency locks are engaged to protect your account.
            </p>
          </div>
        </div>

        {uncertainTransactions.length === 0 ? (
          <div className="p-10 text-center text-slate-400 text-xs space-y-2">
            <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto opacity-80" />
            <div className="font-bold text-sm text-slate-200">All Transactions Reconciled</div>
            <p className="text-slate-500">
              No uncertain transactions in queue. Click <span className="text-amber-400 font-semibold">"Simulate Interrupted Payment"</span> above to test the recovery flow.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-800/60">
            {uncertainTransactions.map((txn) => (
              <div key={txn.id} className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-slate-900/30 transition-colors">
                <div className="space-y-1.5 max-w-xl">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-white text-sm">{txn.id}</span>
                    <ConfidenceBadge state={txn.state} size="sm" onClick={() => setSelectedTxnForExplanation(txn)} />
                    <span className="text-[11px] text-slate-500 font-mono">
                      {new Date(txn.createdAt).toLocaleTimeString()}
                    </span>
                  </div>
                  <div className="text-xs text-slate-300 flex items-center gap-3">
                    <span>Recipient: <strong className="text-white">{txn.recipientName || txn.recipient}</strong></span>
                    <span>•</span>
                    <span>Amount: <strong className="text-emerald-400 font-mono">₹{Number(txn.amount).toFixed(2)}</strong></span>
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    {txn.userExplanation}
                  </p>
                  <div className="text-[11px] text-slate-500 font-mono flex items-center gap-1.5">
                    <KeyRound className="w-3 h-3 text-sky-400" />
                    <span>Idempotency Lock: {txn.idempotencyKey}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => setSelectedTxnForExplanation(txn)}
                    className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium border border-slate-700"
                  >
                    View Diagnosis
                  </button>

                  <button
                    onClick={() => handleReconcile(txn.id)}
                    disabled={reconcilingId === txn.id}
                    className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-bold text-xs flex items-center gap-1.5 shadow-lg shadow-emerald-500/20 transition-all"
                  >
                    {reconcilingId === txn.id ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Querying Bank...</span>
                      </>
                    ) : (
                      <>
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>Run Smart Reconcile</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
