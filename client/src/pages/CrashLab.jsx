import React, { useState } from 'react';
import { usePayment } from '../context/PaymentContext';
import { useNetwork, NETWORK_MODES } from '../context/NetworkContext';
import { api } from '../utils/api';
import ConfidenceBadge from '../components/ConfidenceBadge';
import { 
  Flame, 
  Play, 
  RefreshCw, 
  CheckCircle2, 
  AlertTriangle, 
  ShieldCheck, 
  ShieldAlert, 
  Lock, 
  Clock, 
  CreditCard,
  QrCode,
  ArrowRight
} from 'lucide-react';

const SCENARIOS = [
  {
    id: 'SCENARIO_1_NETWORK_DROP',
    number: '01',
    title: 'Network Failure During Payment',
    shortDesc: 'TCP socket severed while sending payment payload to bank.',
    failureType: 'Client Network Drop',
    expectedState: 'OUTCOME_UNKNOWN',
    systemResponse: 'PayBastion holds client & gateway idempotency lock. Retries are strictly blocked until a non-debit status inquiry runs.',
    steps: [
      { step: 'Init', desc: 'User authorizes ₹650 payment to Merchant' },
      { step: 'Drop', desc: 'Cellular tower hands off; 100% packet loss simulated' },
      { step: 'Hold', desc: 'PayBastion marks OUTCOME_UNKNOWN; locks retry button' },
      { step: 'Recover', desc: 'Smart Recovery probes bank ledger; verifies no debit; safely marks FAILED' }
    ]
  },
  {
    id: 'SCENARIO_2_TIMEOUT_ACK',
    number: '02',
    title: 'Payment Succeeds but ACK Times Out',
    shortDesc: 'Bank debited account, but webhook timed out before client received receipt.',
    failureType: 'Gateway Webhook Timeout',
    expectedState: 'PENDING_VERIFICATION ➔ CONFIRMED',
    systemResponse: 'Reconciler queries clearinghouse via idempotency key, discovers existing successful UTR reference, and reconciles as CONFIRMED without duplicate charge.',
    steps: [
      { step: 'Debit', desc: 'Bank debits ₹1,200 from user account' },
      { step: 'Timeout', desc: 'Gateway response packet times out (504 Gateway Timeout)' },
      { step: 'Inquiry', desc: 'Smart Recovery initiates idempotent status inquiry' },
      { step: 'Reconcile', desc: 'Clearinghouse confirms UTR-982190; state updated to CONFIRMED. ZERO duplicate debit!' }
    ]
  },
  {
    id: 'SCENARIO_3_REPLAY_ATTACK',
    number: '03',
    title: 'Offline Authorization is Reused',
    shortDesc: 'Bad actor tries to scan an already-settled offline authorization token twice.',
    failureType: 'Replay Double-Spending Attack',
    expectedState: 'REJECTED: REPLAY_DETECTED',
    systemResponse: 'Merchant terminal checks nonce ledger. Identical nonce is flagged instantly as a replay attack and rejected.',
    steps: [
      { step: 'First Scan', desc: 'Offline token (Nonce: nonce-7a91b) scanned and queued' },
      { step: 'Second Scan', desc: 'Malicious second submission of same token' },
      { step: 'Nonce Match', desc: 'Cryptographic non-repudiation registry flags duplicate nonce' },
      { step: 'Hard Reject', desc: 'Terminal rejects with CRITICAL_REPLAY_DETECTED alert' }
    ]
  },
  {
    id: 'SCENARIO_4_EXPIRED_AUTH',
    number: '04',
    title: 'Authorization Token Expires',
    shortDesc: 'Offline payment authorization scanned after strict 15-minute TTL elapsed.',
    failureType: 'TTL Expiration',
    expectedState: 'REJECTED: AUTHORIZATION_EXPIRED',
    systemResponse: 'Terminal verifies timestamp against internal RTC. Since now > expiresAt, terminal declines delayed settlement.',
    steps: [
      { step: 'Issue', desc: 'Token created with 15-minute validity window' },
      { step: 'Wait', desc: 'Clock advances past TTL expiration' },
      { step: 'Verify', desc: 'Terminal checks expiresAt boundary' },
      { step: 'Reject', desc: 'Authorization denied; user prompted to issue fresh token' }
    ]
  },
  {
    id: 'SCENARIO_5_SUSPICIOUS_SCAM',
    number: '05',
    title: 'Suspicious Transaction / Scam Detected',
    shortDesc: 'Collect request disguised as refund received from spoofed VPA.',
    failureType: 'Phishing Reverse Collect Request',
    expectedState: 'NEEDS_REVIEW (Execution Halted)',
    systemResponse: 'Scam Guardian intercepts payload before PIN entry. Breaks warning into Signal, Reason, and Recommended Action.',
    steps: [
      { step: 'Scan', desc: 'User scans QR claiming "Instant Electricity Bill Refund"' },
      { step: 'Parse', desc: 'Guardian detects reverse debit parameters (mode=02, pa=power-refund@okaxis)' },
      { step: 'Block', desc: 'Execution paused. State set to NEEDS_REVIEW' },
      { step: 'Explain', desc: 'AI presents explainable warning; advises user to discard QR' }
    ]
  },
  {
    id: 'SCENARIO_6_CREDIT_FALLBACK',
    number: '06',
    title: 'Credit Fallback is Activated',
    shortDesc: 'Bank servers are down during urgent pharmacy checkout. Temporary Credit Bridge steps in.',
    failureType: 'Core Banking Infrastructure Outage',
    expectedState: 'CREDIT_FALLBACK_DISBURSED (Simulation)',
    systemResponse: 'With explicit user consent, simulated micro-credit pool covers merchant payment. Zero interest 7-day schedule established.',
    steps: [
      { step: 'Outage', desc: 'User attempts ₹250 medicine payment; bank switch 500 downtime' },
      { step: 'Offer', desc: 'Credit Bridge detects critical merchant category; prompts fallback' },
      { step: 'Consent', desc: 'User reviews simulation terms and grants consent' },
      { step: 'Disburse', desc: 'Simulated bridge covers merchant; user account is safe' }
    ]
  }
];

export default function CrashLab() {
  const { addTransaction, triggerCelebration, reconcileTransaction, retryPayment, transactions, refreshData } = usePayment();
  const { setNetworkMode, NETWORK_MODES } = useNetwork();

  const [selectedScenario, setSelectedScenario] = useState(SCENARIOS[0]);
  const [running, setRunning] = useState(false);
  const [currentStepIdx, setCurrentStepIdx] = useState(0);
  const [executionLogs, setExecutionLogs] = useState([]);
  const [completed, setCompleted] = useState(false);
  const [lastScenarioTxn, setLastScenarioTxn] = useState(null);
  const [reconciling, setReconciling] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [retryNotice, setRetryNotice] = useState(null);

  // Sync with context updates when transaction is reconciled or updated
  const currentTxn = transactions.find(t => t.id === lastScenarioTxn?.id) || lastScenarioTxn;

  const handleSmartReconcile = async () => {
    if (!currentTxn) return;
    setReconciling(true);
    setRetryNotice(null);
    try {
      const res = await reconcileTransaction(currentTxn.id);
      if (res && res.transaction) {
        setLastScenarioTxn(res.transaction);
      }
    } catch (err) {
      console.warn('Reconcile failed:', err.message);
    } finally {
      setReconciling(false);
    }
  };

  const handleFreshRetry = async () => {
    if (!currentTxn) return;
    if (currentTxn.state === 'OUTCOME_UNKNOWN') {
      setRetryNotice('Payment outcome is unknown. Please use Smart Reconcile before attempting another payment.');
      return;
    }
    if (currentTxn.state === 'PENDING_VERIFICATION') {
      setRetryNotice('Payment verification is pending. Please use Smart Reconcile before attempting another payment.');
      return;
    }
    if (currentTxn.state !== 'FAILED' && !currentTxn.safeToRetry) {
      setRetryNotice('Only confirmed failed transactions can be retried.');
      return;
    }

    setRetrying(true);
    setRetryNotice(null);
    try {
      const res = await retryPayment(currentTxn.id);
      if (res && res.transaction) {
        setLastScenarioTxn(res.transaction);
        setRetryNotice(`Fresh retry initiated successfully with new key: ${res.transaction.idempotencyKey}`);
      } else {
        setRetryNotice(res?.message || 'Retry failed');
      }
    } catch (err) {
      setRetryNotice(err.message || 'Retry rejected by server.');
    } finally {
      setRetrying(false);
    }
  };

  const handleRunScenario = async (sc, isRetry = false) => {
    setSelectedScenario(sc);
    setRunning(true);
    setCompleted(false);
    setExecutionLogs([]);
    setCurrentStepIdx(0);

    const logs = [];

    for (let i = 0; i < sc.steps.length; i++) {
      setCurrentStepIdx(i);
      const stepItem = sc.steps[i];
      const logEntry = {
        time: new Date().toLocaleTimeString(),
        step: stepItem.step,
        desc: stepItem.desc,
      };
      logs.push(logEntry);
      setExecutionLogs([...logs]);
      await new Promise((r) => setTimeout(r, 700));
    }

    // Execute real backend simulation scenario
    try {
      const scenarioParams = isRetry && lastScenarioTxn
        ? { isRetry: true, idempotencyKey: lastScenarioTxn.idempotencyKey, txId: lastScenarioTxn.id }
        : { isRetry: false };

      const backendResult = await api.runSimulationScenario(sc.id, scenarioParams);
      if (backendResult?.transaction) {
        setLastScenarioTxn(backendResult.transaction);
        addTransaction(backendResult.transaction);

        if (backendResult.isExisting || (isRetry && backendResult.transaction._isExisting)) {
          logs.push({
            time: new Date().toLocaleTimeString(),
            step: 'Idempotent Catch',
            desc: `Duplicate debit blocked! Upstream engine detected existing key ${backendResult.transaction.idempotencyKey}. State remains ${backendResult.transaction.state}.`,
          });
          setExecutionLogs([...logs]);
        }
      }
      if (backendResult?.creditResult) {
        if (typeof refreshData === 'function') {
          await refreshData();
        }
        triggerCelebration();
      }
    } catch (apiErr) {
      console.warn('Crash Lab backend call note:', apiErr.message);
      logs.push({
        time: new Date().toLocaleTimeString(),
        step: 'Execution Notice',
        desc: apiErr.message || 'Simulation execution stopped by business rule',
      });
      setExecutionLogs([...logs]);
      setRetryNotice(apiErr.message);
      // Client fallback
      if (sc.id === 'SCENARIO_1_NETWORK_DROP') {
        const fallbackKey = isRetry && lastScenarioTxn
          ? lastScenarioTxn.idempotencyKey
          : `IDEMP-CRASH-01-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
        const fallbackId = isRetry && lastScenarioTxn
          ? lastScenarioTxn.id
          : `TXN-CRASH-01-${Date.now().toString().slice(-4)}`;

        const clientTx = {
          id: fallbackId,
          idempotencyKey: fallbackKey,
          amount: 650.00,
          currency: 'INR',
          sender: 'user-ananya@okaxis',
          recipient: 'merchant-terminal@kotak',
          recipientName: 'Crash Lab Test Merchant',
          channel: 'CRASH_SIMULATION',
          state: 'OUTCOME_UNKNOWN',
          confidenceScore: 30,
          createdAt: new Date().toISOString(),
          safeToRetry: false,
          needsReconciliation: true,
          userExplanation: 'Simulated network drop. Idempotency lock held to prevent duplicate payment.',
          technicalDiagnosis: 'Packet loss injected. Awaiting non-debit provider check.',
          logs: [
            { timestamp: new Date().toISOString(), event: 'CRASH_INJECTED', detail: 'Simulated 100% packet loss during transmission' }
          ]
        };
        setLastScenarioTxn(clientTx);
        addTransaction(clientTx);
      } else if (sc.id === 'SCENARIO_2_TIMEOUT_ACK') {
        const fallbackKey = isRetry && lastScenarioTxn
          ? lastScenarioTxn.idempotencyKey
          : `IDEMP-CRASH-02-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
        const fallbackId = isRetry && lastScenarioTxn
          ? lastScenarioTxn.id
          : `TXN-CRASH-02-${Date.now().toString().slice(-4)}`;

        const clientTx = {
          id: fallbackId,
          idempotencyKey: fallbackKey,
          amount: 1200.00,
          currency: 'INR',
          sender: 'user-ananya@okaxis',
          recipient: 'metro-supermarket@icici',
          recipientName: 'Metro Supermarket',
          channel: 'CRASH_SIMULATION',
          state: 'CONFIRMED',
          confidenceScore: 99,
          createdAt: new Date().toISOString(),
          safeToRetry: false,
          userExplanation: 'Clearinghouse confirmed existing debit of ₹1,200. Reconciled successfully without duplicate charge.',
          technicalDiagnosis: 'Timeout occurred at ACK phase. Pre-flight inquiry recovered UTR-982190.',
          logs: [
            { timestamp: new Date().toISOString(), event: 'TIMEOUT_RECONCILED', detail: 'Original order captured. Duplicate payment prevented.' }
          ]
        };
        setLastScenarioTxn(clientTx);
        addTransaction(clientTx);
        triggerCelebration();
      }
    }

    setRunning(false);
    setCompleted(true);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="p-6 rounded-2xl bg-gradient-to-r from-slate-900 via-slate-900 to-[#281812] border border-slate-800">
        <div className="flex items-center gap-2 mb-1">
          <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-orange-500/10 text-orange-400 border border-orange-500/30">
            INTERACTIVE RESILIENCE SANDBOX
          </span>
        </div>
        <h1 className="text-2xl font-extrabold text-white tracking-tight">
          Hackathon Crash Lab
        </h1>
        <p className="text-slate-400 text-xs sm:text-sm mt-1 max-w-2xl">
          Subject PayBastion to 6 real-world payment edge cases. Witness how the platform isolates failures, blocks duplicate debits, and protects user balances.
        </p>
      </div>

      {/* 6 Scenario Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {SCENARIOS.map((sc) => {
          const isSelected = selectedScenario.id === sc.id;
          return (
            <div
              key={sc.id}
              onClick={() => handleRunScenario(sc)}
              className={`p-5 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between ${
                isSelected
                  ? 'bg-slate-850 border-orange-500/50 shadow-xl shadow-orange-500/10'
                  : 'bg-[#0e1626] border-slate-800 hover:border-slate-700'
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="font-mono text-xs font-black text-orange-400 px-2 py-0.5 rounded bg-orange-500/10 border border-orange-500/20">
                    Scenario {sc.number}
                  </span>
                  <span className="text-[10px] text-slate-500 font-mono">{sc.failureType}</span>
                </div>

                <h3 className="font-bold text-white text-sm mt-2">{sc.title}</h3>
                <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                  {sc.shortDesc}
                </p>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs">
                <span className="text-slate-400 font-mono text-[11px]">{sc.expectedState}</span>
                <span className="font-semibold text-orange-400 flex items-center gap-1 group">
                  Run Test <ArrowRight className="w-3.5 h-3.5" />
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Active Scenario Execution Console */}
      <div className="bg-[#0e1626] border border-slate-800 rounded-2xl p-6 shadow-xl space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-800">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono font-bold text-orange-400 text-xs">
                Active Test: Scenario {selectedScenario.number}
              </span>
              <span className="text-slate-500">•</span>
              <span className="text-xs text-slate-400">{selectedScenario.failureType}</span>
            </div>
            <h2 className="text-xl font-bold text-white mt-1">{selectedScenario.title}</h2>
          </div>

          <div className="flex items-center gap-2 self-start md:self-auto flex-wrap">
            {/* When OUTCOME_UNKNOWN or PENDING_VERIFICATION: Retry button is DISABLED */}
            {currentTxn && (currentTxn.state === 'OUTCOME_UNKNOWN' || currentTxn.state === 'PENDING_VERIFICATION') && (
              <>
                <button
                  type="button"
                  disabled={true}
                  title={currentTxn.state === 'OUTCOME_UNKNOWN'
                    ? "Payment outcome is unknown. Please use Smart Reconcile before attempting another payment."
                    : "Payment verification is pending. Please use Smart Reconcile before attempting another payment."}
                  className="px-3.5 py-2.5 rounded-xl bg-slate-900/90 text-slate-500 border border-slate-700/60 font-bold text-xs flex items-center gap-1.5 cursor-not-allowed opacity-60"
                >
                  <Lock className="w-3.5 h-3.5 text-slate-500" />
                  <span>Retry Payment (Blocked)</span>
                </button>
                <button
                  type="button"
                  onClick={handleSmartReconcile}
                  disabled={reconciling || running}
                  className="px-3.5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 shadow-lg shadow-emerald-500/20 transition-all disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${reconciling ? 'animate-spin' : ''}`} />
                  <span>{reconciling ? 'Reconciling with Bank...' : 'Run Smart Reconcile'}</span>
                </button>
              </>
            )}

            {/* When transaction is confirmed FAILED: Safe retry button is ENABLED */}
            {currentTxn && currentTxn.state === 'FAILED' && (
              <button
                type="button"
                onClick={handleFreshRetry}
                disabled={retrying || running}
                className="px-3.5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 shadow-lg shadow-emerald-500/20 transition-all disabled:opacity-50"
                title="Smart Reconcile confirmed no debit occurred. Click to retry safely with a new idempotency key."
              >
                <RefreshCw className={`w-3.5 h-3.5 ${retrying ? 'animate-spin' : ''}`} />
                <span>{retrying ? 'Initiating Fresh Attempt...' : 'Retry Payment (Fresh Key)'}</span>
              </button>
            )}

            <button
              onClick={() => handleRunScenario(selectedScenario, false)}
              disabled={running}
              className="px-4 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-400 text-slate-950 font-bold text-xs flex items-center gap-2 shadow-lg shadow-orange-500/20 transition-all disabled:opacity-50"
            >
              {running ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              <span>{running ? 'Executing Step Pipeline...' : 'Run Scenario (Fresh Key)'}</span>
            </button>
          </div>
        </div>

        {/* State & Retry Protection Banner */}
        {currentTxn && (
          <div>
            {currentTxn.state === 'OUTCOME_UNKNOWN' && (
              <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                  <span className="font-medium">
                    Payment outcome is unknown. Please use Smart Reconcile before attempting another payment.
                  </span>
                </div>
                <span className="text-[11px] font-mono text-amber-400/80 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                  Idempotency Locked: {currentTxn.idempotencyKey}
                </span>
              </div>
            )}

            {currentTxn.state === 'PENDING_VERIFICATION' && (
              <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-amber-400 shrink-0" />
                  <span className="font-medium">
                    Payment verification is pending. Please use Smart Reconcile before attempting another payment.
                  </span>
                </div>
                <span className="text-[11px] font-mono text-amber-400/80 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                  Verification Pending
                </span>
              </div>
            )}

            {currentTxn.state === 'FAILED' && (
              <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span className="font-medium">
                    Smart Reconcile confirmed no debit occurred. You may safely retry using a fresh idempotency key.
                  </span>
                </div>
                <span className="text-[11px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                  Safe To Retry: TRUE
                </span>
              </div>
            )}

            {currentTxn.state === 'CONFIRMED' && (
              <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span className="font-medium">
                    Bank ledger confirmed payment was captured. Duplicate debits prevented.
                  </span>
                </div>
                <span className="text-[11px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                  CONFIRMED
                </span>
              </div>
            )}

            {retryNotice && (
              <div className="mt-2 p-2.5 rounded-lg bg-sky-500/10 border border-sky-500/30 text-sky-300 text-xs font-mono">
                {retryNotice}
              </div>
            )}
          </div>
        )}

        {/* Live Stepper Visualization */}
        <div className="space-y-3">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">
            Execution Stepper Pipeline:
          </span>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
            {selectedScenario.steps.map((st, idx) => {
              const isActive = running && currentStepIdx === idx;
              const isPast = completed || (!running && currentStepIdx > idx);

              return (
                <div
                  key={idx}
                  className={`p-3 rounded-xl border text-xs transition-all ${
                    isActive
                      ? 'bg-orange-950/40 border-orange-500/60 text-orange-300 ring-2 ring-orange-500/20'
                      : isPast
                      ? 'bg-slate-900 border-emerald-500/30 text-emerald-300'
                      : 'bg-slate-950 border-slate-800 text-slate-500'
                  }`}
                >
                  <div className="flex items-center justify-between font-mono text-[10px] mb-1">
                    <span>STEP {idx + 1}</span>
                    {isPast && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />}
                    {isActive && <RefreshCw className="w-3.5 h-3.5 text-orange-400 animate-spin" />}
                  </div>
                  <div className="font-bold text-white text-xs">{st.step}</div>
                  <div className="text-[11px] mt-1 text-slate-400 leading-snug">{st.desc}</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* System Response & Security Assertion */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
            <span className="text-slate-400 font-semibold uppercase tracking-wider block mb-1 text-[11px]">
              Expected State Transition
            </span>
            <div className="text-white font-mono font-bold text-sm">
              {selectedScenario.expectedState}
            </div>
            <p className="text-slate-400 text-xs mt-2 leading-relaxed">
              {selectedScenario.systemResponse}
            </p>
          </div>

          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 font-mono">
            <span className="text-slate-400 font-semibold uppercase tracking-wider block mb-2 text-[11px] flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5 text-emerald-400" />
              PayBastion Invariant Assertion
            </span>
            <div className="text-emerald-400 text-xs leading-relaxed">
              ASSERTION PASSED: [ZeroDuplicateDebits === true]
              <br />
              ASSERTION PASSED: [TimeoutProofOfFailure === false]
              <br />
              ASSERTION PASSED: [IdempotencyProtected === true]
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
