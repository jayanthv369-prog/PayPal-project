import React, { useState, useEffect } from 'react';
import { usePayment } from '../context/PaymentContext';
import { 
  Wallet, 
  CheckCircle2, 
  AlertTriangle, 
  ExternalLink, 
  Key, 
  ShieldCheck, 
  RefreshCw, 
  Copy, 
  Check, 
  ArrowRight,
  Info
} from 'lucide-react';

export default function PayPalIntegration() {
  const { addTransaction, triggerCelebration } = usePayment();

  const [amount, setAmount] = useState('15.00');
  const [currency, setCurrency] = useState('USD');
  const [description, setDescription] = useState('PayBastion Sandbox Resilience Test');
  const [loading, setLoading] = useState(false);
  const [statusOrderId, setStatusOrderId] = useState('');
  const [statusResult, setStatusResult] = useState(null);
  const [lastOrder, setLastOrder] = useState(null);
  const [copied, setCopied] = useState(false);
  const [isConfigured, setIsConfigured] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Check health and whether PayPal credentials are configured
  useEffect(() => {
    fetch('/api/health')
      .then((res) => res.json())
      .then((data) => {
        setIsConfigured(data.paypalConfigured || false);
      })
      .catch(() => {
        setIsConfigured(false);
      });
  }, []);

  /**
   * Step 1: Create Order via Server API
   */
  const handleCreateOrder = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');
    setStatusResult(null);

    try {
      const res = await fetch('/api/paypal/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount, currency, description }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create PayPal order');

      setLastOrder(data);
      setStatusOrderId(data.orderId);

      // Auto-simulate capture for seamless hackathon demonstration
      await handleCaptureOrder(data.orderId);
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Step 2: Capture Order via Server API
   */
  const handleCaptureOrder = async (orderIdToCapture) => {
    try {
      const res = await fetch('/api/paypal/capture-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: orderIdToCapture }),
      });

      const captureData = await res.json();
      if (!res.ok) throw new Error(captureData.error || 'Capture failed');

      setLastOrder((prev) => ({ ...prev, capture: captureData }));

      // Add to main PayBastion transaction ledger with strict sandbox demarcation
      const txn = {
        id: captureData.captureId || `PAYPAL-${orderIdToCapture}`,
        idempotencyKey: `IDEMP-PP-${orderIdToCapture}`,
        amount: parseFloat(amount),
        currency,
        sender: captureData.payer?.email_address || 'sandbox-buyer@paypal.com',
        recipient: 'merchant-sandbox@paybastion.dev',
        recipientName: 'PayBastion Merchant Gateway',
        category: 'PayPal Sandbox Checkout',
        channel: 'PAYPAL_SANDBOX',
        state: 'CONFIRMED',
        confidenceScore: 100,
        createdAt: new Date().toISOString(),
        safeToRetry: false,
        userExplanation: captureData.demoMode
          ? 'PayPal Sandbox test payment verified by server-side reconciler. (Demo Mode)'
          : 'Live PayPal Sandbox payment captured and verified via PayPal REST API v2.',
        technicalDiagnosis: `Captured order ${orderIdToCapture}. Payer: ${captureData.payer?.email_address}. Nonce lock released.`,
        logs: [
          { timestamp: new Date().toISOString(), event: 'PAYPAL_ORDER_CREATED', detail: `Order ID: ${orderIdToCapture}` },
          { timestamp: new Date().toISOString(), event: 'PAYPAL_CAPTURED', detail: `Capture ID: ${captureData.captureId}. Settlement verified.` }
        ]
      };

      addTransaction(txn);
      triggerCelebration();
    } catch (err) {
      setErrorMsg(err.message);
    }
  };

  /**
   * Check order status directly from server API
   */
  const handleCheckStatus = async () => {
    if (!statusOrderId.trim()) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/paypal/status/${statusOrderId.trim()}`);
      const data = await res.json();
      setStatusResult(data);
    } catch (e) {
      setStatusResult({ error: 'Server status check unreachable.' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="p-6 rounded-2xl bg-gradient-to-r from-slate-900 via-slate-900 to-[#10243d] border border-slate-800">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/30">
                OFFICIAL PAYPAL REST API V2 INTEGRATION
              </span>
              <span className={`px-2 py-0.5 rounded text-[11px] font-semibold border ${
                isConfigured 
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                  : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
              }`}>
                {isConfigured ? 'LIVE SANDBOX CREDENTIALS DETECTED' : 'HIGH-FIDELITY DEMO MODE'}
              </span>
            </div>
            <h1 className="text-2xl font-extrabold text-white tracking-tight">
              PayPal Developer Sandbox Integration
            </h1>
            <p className="text-slate-400 text-xs sm:text-sm mt-1 max-w-2xl">
              Server-side order creation, tokenized capture, and automated status reconciliation. Real sandbox credentials never touch the frontend browser.
            </p>
          </div>

          <a
            href="https://developer.paypal.com/dashboard/applications/sandbox"
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs flex items-center gap-2 border border-slate-700 transition-all self-start md:self-auto"
          >
            <span>PayPal Developer Portal</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>

      {/* Strict Demarcation Notice */}
      <div className="p-4 rounded-xl bg-sky-950/20 border border-sky-500/30 text-sky-300 text-xs flex items-start gap-3">
        <ShieldCheck className="w-5 h-5 text-sky-400 shrink-0 mt-0.5" />
        <div className="leading-relaxed">
          <span className="font-bold">Protocol Demarcation Invariant: </span>
          PayPal Sandbox transactions represent official international clearinghouse checkouts, and are kept strictly distinct from PayBastion local Offline Passports and Simulated Credit Bridge loans. Credentials reside strictly in <code className="bg-black/40 px-1 py-0.5 rounded font-mono text-white">server/.env</code> and are never leaked to client javascript.
        </div>
      </div>

      {/* Two Column Layout: Checkout Bench vs Verification Output */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Test Checkout Form (5 cols) */}
        <div className="lg:col-span-5 bg-[#0e1626] border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
          <h2 className="font-bold text-white text-base pb-2 border-b border-slate-800 flex items-center gap-2">
            <Wallet className="w-4 h-4 text-blue-400" />
            <span>Sandbox Checkout Test Bench</span>
          </h2>

          <form onSubmit={handleCreateOrder} className="space-y-4 text-xs">
            <div>
              <label className="font-semibold text-slate-300 block mb-1">Payment Amount</label>
              <div className="flex gap-2">
                <input
                  type="number"
                  step="0.01"
                  min="0.50"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-emerald-400 font-mono font-bold text-sm focus:border-blue-500 focus:outline-none"
                  required
                />
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  className="px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono"
                >
                  <option value="USD">USD ($)</option>
                  <option value="EUR">EUR (€)</option>
                  <option value="GBP">GBP (£)</option>
                </select>
              </div>
            </div>

            <div>
              <label className="font-semibold text-slate-300 block mb-1">Order Description</label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white focus:border-blue-500 focus:outline-none"
              />
            </div>

            {errorMsg && (
              <div className="p-3 rounded-xl bg-rose-950/20 border border-rose-500/30 text-rose-300 text-xs">
                {errorMsg}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-blue-500/20 transition-all"
            >
              <Wallet className="w-4 h-4" />
              <span>{loading ? 'Creating & Capturing Order...' : `Execute Sandbox Payment (${currency} ${amount})`}</span>
            </button>
          </form>

          {/* Quick Status Lookup Tool */}
          <div className="mt-6 pt-4 border-t border-slate-800 space-y-2">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">
              Server-Side Order Status Inquiry:
            </span>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Enter Order ID..."
                value={statusOrderId}
                onChange={(e) => setStatusOrderId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono text-xs focus:border-blue-500 focus:outline-none"
              />
              <button
                type="button"
                onClick={handleCheckStatus}
                className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold shrink-0"
              >
                Inquire
              </button>
            </div>
            {statusResult && (
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 font-mono text-[11px] text-slate-300">
                <pre className="overflow-x-auto">{JSON.stringify(statusResult, null, 2)}</pre>
              </div>
            )}
          </div>
        </div>

        {/* Right: Capture & Verification Receipt Output (7 cols) */}
        <div className="lg:col-span-7 space-y-4">
          {lastOrder ? (
            <div className="bg-[#0e1626] border border-slate-800 rounded-2xl p-6 shadow-xl space-y-5 animate-fadeIn">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                  <h3 className="font-bold text-white text-base">PayPal Sandbox Verification Receipt</h3>
                </div>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  {lastOrder.capture?.status || 'COMPLETED'}
                </span>
              </div>

              {/* Receipt details */}
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2 text-xs">
                <div className="flex justify-between py-1 border-b border-slate-800">
                  <span className="text-slate-400">Order ID:</span>
                  <span className="font-mono text-white font-semibold">{lastOrder.orderId}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-800">
                  <span className="text-slate-400">Capture ID:</span>
                  <span className="font-mono text-emerald-400 font-semibold">{lastOrder.capture?.captureId}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-800">
                  <span className="text-slate-400">Amount Paid:</span>
                  <span className="font-mono text-white font-bold text-sm">
                    {lastOrder.currency} {lastOrder.amount}
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-800">
                  <span className="text-slate-400">Payer Account:</span>
                  <span className="text-sky-300 font-mono">{lastOrder.capture?.payer?.email_address}</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-slate-400">Execution Mode:</span>
                  <span className="text-slate-300 font-semibold">
                    {lastOrder.demoMode ? 'Deterministic Sandbox Emulation' : 'Live PayPal REST API v2 Sandbox'}
                  </span>
                </div>
              </div>

              {/* Explanation message */}
              <p className="text-xs text-slate-300 leading-relaxed bg-slate-900/80 p-3 rounded-xl border border-slate-800">
                {lastOrder.message || 'Payment capture verified through server-side OAuth2 bearer tokens. Added to PayBastion resilience journal.'}
              </p>
            </div>
          ) : (
            <div className="bg-[#0e1626] border border-slate-800 rounded-2xl p-10 flex flex-col items-center justify-center text-center h-full text-slate-500">
              <Wallet className="w-16 h-16 mb-3 opacity-30 text-blue-400" />
              <p className="font-semibold text-sm text-slate-300">Ready for Sandbox Checkout</p>
              <p className="text-xs text-slate-500 mt-1">
                Enter an amount on the left to initiate a server-side PayPal Sandbox order and capture.
              </p>
            </div>
          )}

          {/* Setup Instructions Card */}
          <div className="bg-[#0e1626] border border-slate-800 rounded-2xl p-6 shadow-xl space-y-3">
            <h3 className="font-bold text-white text-sm flex items-center gap-2">
              <Key className="w-4 h-4 text-amber-400" />
              <span>How to Add Your Live PayPal Sandbox Credentials</span>
            </h3>

            <div className="text-xs text-slate-300 space-y-2 leading-relaxed">
              <p>
                1. Visit the <a href="https://developer.paypal.com/dashboard/applications/sandbox" target="_blank" rel="noopener noreferrer" className="text-sky-400 underline">PayPal Developer Dashboard</a> and open your Sandbox App.
              </p>
              <p>
                2. Copy your <strong>Client ID</strong> and <strong>Secret Key</strong>.
              </p>
              <p>
                3. Open <code className="bg-slate-950 px-1.5 py-0.5 rounded text-emerald-400 font-mono">paybastion/server/.env</code> and paste your credentials:
              </p>
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 font-mono text-[11px] text-slate-300">
                PAYPAL_MODE=sandbox
                <br />
                PAYPAL_CLIENT_ID=your_sandbox_client_id_here
                <br />
                PAYPAL_CLIENT_SECRET=your_sandbox_secret_key_here
              </div>
              <p className="text-slate-400 text-[11px]">
                4. Restart the server. PayBastion will immediately switch from the high-fidelity demo emulator to direct live PayPal REST API v2 calls!
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
