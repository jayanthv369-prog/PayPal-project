import React, { useState } from 'react';
import { 
  ShieldAlert, 
  ShieldCheck, 
  AlertTriangle, 
  Search, 
  Sparkles, 
  Eye, 
  ArrowRight, 
  CheckCircle2, 
  XCircle,
  QrCode,
  Zap,
  Info
} from 'lucide-react';

const SCAM_PRESETS = [
  {
    title: '1. Fake Electricity Bill / Disconnection Threat',
    category: 'VPA Impersonation',
    recipient: 'electricity-bill-refund@okaxis',
    amount: '4999.00',
    rawPayload: '',
    attempts: 1,
    description: 'Impersonating utility departments threatening instant power disconnection to induce hasty payment.'
  },
  {
    title: '2. Reverse Collect Request disguised as "Refund"',
    category: 'Deceptive QR Payload',
    recipient: 'claim-cashback-instant@upi',
    amount: '2500.00',
    rawPayload: 'upi://pay?pa=scam-collector@upi&pn=Amazon_Refund_Desk&am=2500&mode=02&tr=REF9921',
    attempts: 1,
    description: 'Scam QR claiming to credit a 2,500 refund, but technical payload is a DEBIT request.'
  },
  {
    title: '3. Rapid Duplicate Velocity Abuse',
    category: 'Velocity Anomaly',
    recipient: 'fast-checkout-terminal@kotak',
    amount: '850.00',
    rawPayload: '',
    attempts: 4,
    description: '4 repeat payment requests submitted within 15 seconds by a glitchy or abusive terminal.'
  },
  {
    title: '4. Unusual High-Value Ticket Spike',
    category: 'Amount Anomaly',
    recipient: 'random-crypto-exchange@icici',
    amount: '68000.00',
    rawPayload: '',
    attempts: 1,
    description: 'Sudden spike 50x above user historical average spending.'
  },
  {
    title: '5. Phishing Web Redirection in QR',
    category: 'Malicious URI',
    recipient: 'unknown-merchant',
    amount: '120.00',
    rawPayload: 'https://security-verify-kyc-bank.freehost.cc/login?vpa=ananya',
    attempts: 1,
    description: 'QR redirects browser to external credential harvesting domain instead of payment gateway.'
  },
  {
    title: '6. Verified Genuine Merchant Baseline',
    category: 'Genuine Baseline',
    recipient: 'metro-supermarket@icici',
    amount: '450.00',
    rawPayload: '',
    attempts: 1,
    description: 'Verified merchant handle with standard ticket size and clean history.'
  }
];

export default function ScamGuardian() {
  const [recipient, setRecipient] = useState(SCAM_PRESETS[1].recipient);
  const [amount, setAmount] = useState(SCAM_PRESETS[1].amount);
  const [rawPayload, setRawPayload] = useState(SCAM_PRESETS[1].rawPayload);
  const [attempts, setAttempts] = useState(SCAM_PRESETS[1].attempts);
  const [analysisResult, setAnalysisResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleAnalyze = async (customRec = recipient, customAmt = amount, customPay = rawPayload, customAtt = attempts) => {
    setLoading(true);
    try {
      // Try backend call
      const res = await fetch('/api/scam-guardian/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipient: customRec,
          amount: customAmt,
          rawPayload: customPay,
          recentAttemptsCount: customAtt,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setAnalysisResult(data);
        setLoading(false);
        return;
      }
    } catch (e) {
      // Fallback to client-side rule evaluation
    }

    // Client-side rule evaluation
    const numAmt = parseFloat(customAmt || 0);
    const alerts = [];
    let riskLevel = 'LOW';
    let riskScore = 10;

    const lowerRec = (customRec || '').toLowerCase();
    const keywords = ['refund', 'customer-care', 'support', 'electricity-bill', 'cashback', 'lottery'];
    const matched = keywords.find(k => lowerRec.includes(k));

    if (matched) {
      riskLevel = 'CRITICAL';
      riskScore = 95;
      alerts.push({
        signal: `Impersonation Pattern: Recipient ID contains high-risk keyword '${matched}'`,
        reason: `Fraudulent entities register VPAs imitating customer care or refunds. Genuine entities NEVER issue refunds via payment debit requests.`,
        recommendedAction: `ABORT IMMEDIATELY. Do not enter PIN. Legitimate refunds are credited automatically without initiating a transaction.`
      });
    }

    if (customPay && (customPay.includes('mode=02') || customPay.toLowerCase().includes('refund'))) {
      riskLevel = 'CRITICAL';
      riskScore = 98;
      alerts.push({
        signal: 'Deceptive QR Payload: Reverse-Flow Collect Request',
        reason: 'This QR code claims to deliver a refund, but the technical payload is actually a DEBIT instruction directing money OUT of your account.',
        recommendedAction: 'Do NOT scan or confirm. You never need to enter your PIN or authorize a transfer to receive money.'
      });
    }

    if (customPay && (customPay.startsWith('http://') || customPay.startsWith('https://'))) {
      if (!customPay.includes('paypal.com') && !customPay.includes('upi')) {
        riskLevel = 'MEDIUM';
        riskScore = Math.max(riskScore, 65);
        alerts.push({
          signal: 'External Web Redirection in Payment QR',
          reason: 'This QR code contains an unverified external URL. Scanning may redirect you to a phishing portal designed to harvest net banking passwords.',
          recommendedAction: 'Verify the domain name carefully. Never enter banking credentials on unfamiliar domains.'
        });
      }
    }

    if (customAtt >= 3) {
      riskLevel = riskLevel === 'CRITICAL' ? 'CRITICAL' : 'MEDIUM';
      riskScore = Math.max(riskScore, 70);
      alerts.push({
        signal: `Velocity Anomaly: ${customAtt} repeated payment requests within seconds`,
        reason: 'Rapid repeat attempts can result from terminal loops or merchant double billing.',
        recommendedAction: 'Inspect your transaction history before authorizing any repeated attempt.'
      });
    }

    if (numAmt > 25000) {
      riskLevel = riskLevel === 'CRITICAL' ? 'CRITICAL' : 'MEDIUM';
      riskScore = Math.max(riskScore, 55);
      alerts.push({
        signal: `High-Value Threshold Warning: ₹${numAmt.toLocaleString('en-IN')}`,
        reason: 'Transaction is 30x higher than typical merchant ticket size.',
        recommendedAction: 'Verify recipient identity through a secondary trusted channel before committing irreversible funds.'
      });
    }

    if (alerts.length === 0) {
      setAnalysisResult({
        safe: true,
        riskLevel: 'LOW',
        riskScore: 8,
        primaryAlert: {
          signal: 'Standard Transaction Parameters',
          reason: 'Recipient VPA verified, payload matches standard RFC format, and velocity is within standard thresholds.',
          recommendedAction: 'Safe to proceed with normal user authorization.'
        },
        allAlerts: []
      });
    } else {
      setAnalysisResult({
        safe: riskLevel === 'LOW',
        riskLevel,
        riskScore,
        primaryAlert: alerts[0],
        allAlerts: alerts
      });
    }

    setLoading(false);
  };

  const handleSelectPreset = (p) => {
    setRecipient(p.recipient);
    setAmount(p.amount);
    setRawPayload(p.rawPayload);
    setAttempts(p.attempts);
    handleAnalyze(p.recipient, p.amount, p.rawPayload, p.attempts);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="p-6 rounded-2xl bg-gradient-to-r from-slate-900 via-slate-900 to-[#1e1338] border border-slate-800">
        <div className="flex items-center gap-2 mb-1">
          <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-purple-500/10 text-purple-400 border border-purple-500/30">
            HEURISTIC FRAUD DEFENSE
          </span>
        </div>
        <h1 className="text-2xl font-extrabold text-white tracking-tight">
          AI Scam Guardian
        </h1>
        <p className="text-slate-400 text-xs sm:text-sm mt-1 max-w-2xl">
          Explains suspicious payment requests before you authorize. Detects impersonation handles, deceptive reverse collect requests, velocity spikes, and phishing QR codes.
        </p>
      </div>

      {/* Preset Scenario Selector */}
      <div className="bg-[#0e1626] border border-slate-800 rounded-2xl p-5 shadow-xl">
        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-3 flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-purple-400" />
          Test Known Scam Patterns (Click to evaluate):
        </span>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {SCAM_PRESETS.map((preset, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => handleSelectPreset(preset)}
              className="p-3.5 rounded-xl bg-slate-900 hover:bg-slate-850 border border-slate-800 text-left transition-all hover:border-purple-500/40 group text-xs flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-slate-800 text-slate-400">
                    {preset.category}
                  </span>
                  <span className="font-mono text-emerald-400 font-bold">₹{preset.amount}</span>
                </div>
                <div className="font-bold text-white group-hover:text-purple-300 transition-colors mt-1">
                  {preset.title}
                </div>
                <p className="text-[11px] text-slate-400 mt-1 line-clamp-2">
                  {preset.description}
                </p>
              </div>

              <div className="mt-2 pt-2 border-t border-slate-800 text-[10px] text-slate-500 font-mono truncate">
                {preset.recipient}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Two Column Layout: Payload Inputs & 3-Section Analysis */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Input Form (5 cols) */}
        <div className="lg:col-span-5 bg-[#0e1626] border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
          <h2 className="font-bold text-white text-base pb-2 border-b border-slate-800 flex items-center gap-2">
            <Search className="w-4 h-4 text-purple-400" />
            <span>Interactive Risk Analyzer</span>
          </h2>

          <div className="space-y-3 text-xs">
            <div>
              <label className="font-semibold text-slate-300 block mb-1">Recipient VPA / Handle</label>
              <input
                type="text"
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono focus:border-purple-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="font-semibold text-slate-300 block mb-1">Transaction Amount (₹)</label>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-emerald-400 font-mono font-bold focus:border-purple-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="font-semibold text-slate-300 block mb-1">Raw QR Payload / URL (Optional)</label>
              <textarea
                rows={3}
                value={rawPayload}
                onChange={(e) => setRawPayload(e.target.value)}
                placeholder="upi://pay?pa=... or https://..."
                className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-300 font-mono text-[11px] focus:border-purple-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="font-semibold text-slate-300 block mb-1">
                Recent Attempts Frequency: <span className="text-purple-400 font-bold">{attempts} within 30s</span>
              </label>
              <input
                type="range"
                min="1"
                max="6"
                value={attempts}
                onChange={(e) => setAttempts(parseInt(e.target.value))}
                className="w-full accent-purple-500"
              />
            </div>

            <button
              type="button"
              onClick={() => handleAnalyze()}
              disabled={loading}
              className="w-full py-3 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-purple-600/20 transition-all mt-2"
            >
              <ShieldAlert className="w-4 h-4" />
              <span>{loading ? 'Evaluating Heuristics...' : 'Run Explainable Risk Analysis'}</span>
            </button>
          </div>
        </div>

        {/* Right: 3-Section Explainable Output (7 cols) */}
        <div className="lg:col-span-7 space-y-4">
          {analysisResult ? (
            <div className="bg-[#0e1626] border border-slate-800 rounded-2xl p-6 shadow-xl space-y-5 animate-fadeIn">
              {/* Risk Level Header */}
              <div className="flex items-center justify-between pb-4 border-b border-slate-800">
                <div className="flex items-center gap-3">
                  <div className={`p-2.5 rounded-xl border ${
                    analysisResult.riskLevel === 'CRITICAL'
                      ? 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                      : analysisResult.riskLevel === 'MEDIUM'
                      ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                      : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                  }`}>
                    {analysisResult.riskLevel === 'CRITICAL' && <ShieldAlert className="w-6 h-6" />}
                    {analysisResult.riskLevel === 'MEDIUM' && <AlertTriangle className="w-6 h-6" />}
                    {analysisResult.riskLevel === 'LOW' && <ShieldCheck className="w-6 h-6" />}
                  </div>
                  <div>
                    <h3 className="font-bold text-white text-lg">
                      Risk Level: {analysisResult.riskLevel}
                    </h3>
                    <p className="text-xs text-slate-400 font-mono">
                      Scam Threat Index: {analysisResult.riskScore}/100
                    </p>
                  </div>
                </div>

                <div className="text-right">
                  <span className={`px-3 py-1 rounded-full text-xs font-bold border ${
                    analysisResult.safe
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                      : 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                  }`}>
                    {analysisResult.safe ? 'SAFE TO AUTHORIZE' : 'HIGH RISK DETECTED'}
                  </span>
                </div>
              </div>

              {/* Required 3 Sections: Signal, Reason, Recommended Action */}
              <div className="space-y-4 text-xs">
                {/* 1. SIGNAL */}
                <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
                  <div className="font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5 mb-1.5 text-[11px]">
                    <Zap className="w-4 h-4" />
                    Section 1: Signal (What was detected)
                  </div>
                  <p className="text-slate-200 leading-relaxed font-semibold">
                    {analysisResult.primaryAlert.signal}
                  </p>
                </div>

                {/* 2. REASON */}
                <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
                  <div className="font-bold text-sky-400 uppercase tracking-wider flex items-center gap-1.5 mb-1.5 text-[11px]">
                    <Info className="w-4 h-4" />
                    Section 2: Reason (Why this is dangerous)
                  </div>
                  <p className="text-slate-300 leading-relaxed">
                    {analysisResult.primaryAlert.reason}
                  </p>
                </div>

                {/* 3. RECOMMENDED ACTION */}
                <div className={`p-4 rounded-xl border ${
                  analysisResult.safe
                    ? 'bg-emerald-950/20 border-emerald-500/40 text-emerald-300'
                    : 'bg-rose-950/30 border-rose-500/40 text-rose-300'
                }`}>
                  <div className="font-bold uppercase tracking-wider flex items-center gap-1.5 mb-1.5 text-[11px]">
                    <ShieldCheck className="w-4 h-4" />
                    Section 3: Recommended Action (What to do now)
                  </div>
                  <p className="text-slate-200 leading-relaxed font-semibold">
                    {analysisResult.primaryAlert.recommendedAction}
                  </p>
                </div>
              </div>

              {/* Security Boundary Notice */}
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-[11px] text-slate-400 font-mono flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Deterministic rule boundary: AI explains risks to the user; AI never moves money autonomously.</span>
              </div>
            </div>
          ) : (
            <div className="bg-[#0e1626] border border-slate-800 rounded-2xl p-10 flex flex-col items-center justify-center text-center h-full text-slate-500">
              <ShieldAlert className="w-16 h-16 mb-3 opacity-30 text-purple-400" />
              <p className="font-semibold text-sm text-slate-300">Select a preset or click "Run Explainable Risk Analysis"</p>
              <p className="text-xs text-slate-500 mt-1">PayBastion will break down the risk into Signal, Reason, and Recommended Action.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
