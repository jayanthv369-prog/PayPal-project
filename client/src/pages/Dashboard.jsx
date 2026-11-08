import React, { useState, useEffect } from 'react';
import { usePayment } from '../context/PaymentContext';
import { useNetwork } from '../context/NetworkContext';
import { api } from '../utils/api';
import ConfidenceBadge from '../components/ConfidenceBadge';
import { 
  ShieldCheck, 
  RotateCw, 
  AlertTriangle, 
  QrCode, 
  Mic, 
  Flame, 
  CheckCircle2, 
  ArrowUpRight, 
  Search, 
  Filter, 
  CreditCard,
  RefreshCw,
  ExternalLink,
  Lock
} from 'lucide-react';

export default function Dashboard({ setActiveTab }) {
  const { transactions, setSelectedTxnForExplanation, reconcileTransaction, retryPayment, offlinePassports } = usePayment();
  const { networkMode } = useNetwork();
  const [filterState, setFilterState] = useState('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [apiStats, setApiStats] = useState(null);

  // Fetch real statistics from database API
  useEffect(() => {
    let isMounted = true;
    api.fetchDashboardStats()
      .then(data => {
        if (isMounted && data) {
          setApiStats(data);
        }
      })
      .catch(err => {
        console.warn('Dashboard stats API fetch note (using calculated stats):', err.message);
      });
    return () => { isMounted = false; };
  }, [transactions]);

  // Real Database Metrics calculations (API backed with calculated fallback)
  const pendingTxns = transactions.filter(t => t.state === 'PENDING_VERIFICATION' || t.state === 'OUTCOME_UNKNOWN');
  const recoveredTxns = transactions.filter(t => t.reconciliationStatus === 'RECONCILED' && t.state === 'CONFIRMED');
  const calculatedRecoveredAmount = recoveredTxns.reduce((sum, t) => sum + (parseFloat(t.amount) || 0), 0);

  const recoveredAmount = apiStats ? apiStats.recoveredFunds : calculatedRecoveredAmount;
  const pendingCount = apiStats ? apiStats.pendingCount : pendingTxns.length;
  const offlineTokensCount = apiStats ? apiStats.offlineCount : transactions.filter(t => t.state === 'OFFLINE_AUTHORIZATION').length;
  const scamThreatsBlocked = apiStats ? apiStats.scamThreatsBlocked : transactions.filter(t => t.state === 'NEEDS_REVIEW').length;

  // Filtered transactions
  const filteredTransactions = transactions.filter(t => {
    const matchesFilter = 
      filterState === 'ALL' ||
      (filterState === 'PENDING' && (t.state === 'PENDING_VERIFICATION' || t.state === 'OUTCOME_UNKNOWN')) ||
      (filterState === 'CONFIRMED' && t.state === 'CONFIRMED') ||
      (filterState === 'OFFLINE' && t.state === 'OFFLINE_AUTHORIZATION') ||
      (filterState === 'FLAGGED' && t.state === 'NEEDS_REVIEW');

    const matchesSearch = 
      t.recipient.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (t.recipientName && t.recipientName.toLowerCase().includes(searchTerm.toLowerCase())) ||
      t.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.amount.toString().includes(searchTerm);

    return matchesFilter && matchesSearch;
  });

  return (
    <div className="space-y-6">
      {/* Top Welcome & Resilience Status Banner */}
      <div className="p-6 rounded-2xl bg-gradient-to-r from-slate-900 via-slate-900 to-[#0e1e30] border border-slate-800 relative overflow-hidden shadow-xl">
        <div className="absolute right-0 top-0 bottom-0 w-1/3 bg-radial from-emerald-500/10 to-transparent pointer-events-none" />
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                ACTIVE SHIELD: ZERO DUPLICATE DEBITS
              </span>
            </div>
            <h1 className="text-2xl font-extrabold text-white tracking-tight">
              PayBastion Resilience Mission Control
            </h1>
            <p className="text-slate-400 text-xs sm:text-sm mt-1 max-w-2xl">
              Deterministic recovery platform preventing double debits during network dropouts, enabling signed offline payment passports, and providing transparent AI explanations.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setActiveTab('crashlab')}
              className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-bold text-xs flex items-center gap-2 shadow-lg shadow-orange-500/20 transition-all"
            >
              <Flame className="w-4 h-4" />
              Launch Crash Lab
            </button>
            <button
              onClick={() => setActiveTab('offline')}
              className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs flex items-center gap-2 border border-slate-700 transition-all"
            >
              <QrCode className="w-4 h-4 text-emerald-400" />
              Offline Passport
            </button>
          </div>
        </div>
      </div>

      {/* Hero Resilience Metrics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1 */}
        <div className="glass-card p-5 rounded-2xl border border-slate-800 hover:border-emerald-500/30 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Recovered Funds</span>
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <RotateCw className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-white">₹{recoveredAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
            <p className="text-[11px] text-emerald-400 flex items-center gap-1 mt-1 font-medium">
              <CheckCircle2 className="w-3.5 h-3.5" />
              100% duplicate charges avoided
            </p>
          </div>
        </div>

        {/* Card 2 */}
        <div className="glass-card p-5 rounded-2xl border border-slate-800 hover:border-amber-500/30 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Uncertain / In-Flight</span>
            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-white">{pendingCount}</div>
            <p className="text-[11px] text-amber-400 flex items-center gap-1 mt-1 font-medium">
              Idempotency locked for verification
            </p>
          </div>
        </div>

        {/* Card 3 */}
        <div className="glass-card p-5 rounded-2xl border border-slate-800 hover:border-sky-500/30 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Offline Passports</span>
            <div className="p-2 rounded-xl bg-sky-500/10 text-sky-400 border border-sky-500/20">
              <QrCode className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-white">{offlineTokensCount}</div>
            <p className="text-[11px] text-sky-400 flex items-center gap-1 mt-1 font-medium">
              Signed HMAC • Settlement Pending
            </p>
          </div>
        </div>

        {/* Card 4 */}
        <div className="glass-card p-5 rounded-2xl border border-slate-800 hover:border-purple-500/30 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Scam Threats Blocked</span>
            <div className="p-2 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20">
              <ShieldCheck className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-white">{scamThreatsBlocked}</div>
            <p className="text-[11px] text-purple-400 flex items-center gap-1 mt-1 font-medium">
              AI Scam Guardian rules active
            </p>
          </div>
        </div>
      </div>

      {/* Quick Access Feature Banners */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Banner 1: VoicePay AI */}
        <div 
          onClick={() => setActiveTab('voice')}
          className="p-4 rounded-xl bg-gradient-to-br from-slate-900 to-[#121c2f] border border-slate-800 hover:border-emerald-500/40 cursor-pointer transition-all group"
        >
          <div className="flex items-start justify-between">
            <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 group-hover:scale-110 transition-transform">
              <Mic className="w-5 h-5" />
            </div>
            <ArrowUpRight className="w-4 h-4 text-slate-500 group-hover:text-emerald-400 transition-colors" />
          </div>
          <h3 className="font-bold text-white text-sm mt-3">VoicePay AI (Kannada & English)</h3>
          <p className="text-xs text-slate-400 mt-1">
            Voice-command transfers with multilingual speech recognition, Kannada text parsing, and audio read-back confirmation.
          </p>
        </div>

        {/* Banner 2: AI Scam Guardian */}
        <div 
          onClick={() => setActiveTab('scam')}
          className="p-4 rounded-xl bg-gradient-to-br from-slate-900 to-[#121c2f] border border-slate-800 hover:border-purple-500/40 cursor-pointer transition-all group"
        >
          <div className="flex items-start justify-between">
            <div className="p-2.5 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20 group-hover:scale-110 transition-transform">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <ArrowUpRight className="w-4 h-4 text-slate-500 group-hover:text-purple-400 transition-colors" />
          </div>
          <h3 className="font-bold text-white text-sm mt-3">AI Scam Guardian</h3>
          <p className="text-xs text-slate-400 mt-1">
            Detects suspicious VPA handles, reverse-flow collect requests disguised as refunds, and malicious QR codes.
          </p>
        </div>

        {/* Banner 3: Temporary Credit Bridge */}
        <div 
          onClick={() => setActiveTab('credit')}
          className="p-4 rounded-xl bg-gradient-to-br from-slate-900 to-[#121c2f] border border-slate-800 hover:border-sky-500/40 cursor-pointer transition-all group"
        >
          <div className="flex items-start justify-between">
            <div className="p-2.5 rounded-xl bg-sky-500/10 text-sky-400 border border-sky-500/20 group-hover:scale-110 transition-transform">
              <CreditCard className="w-5 h-5" />
            </div>
            <ArrowUpRight className="w-4 h-4 text-slate-500 group-hover:text-sky-400 transition-colors" />
          </div>
          <h3 className="font-bold text-white text-sm mt-3">Temporary Credit Bridge</h3>
          <p className="text-xs text-slate-400 mt-1">
            Simulated emergency intermediary credit fallback when bank networks fail during critical merchant purchases.
          </p>
        </div>
      </div>

      {/* Main Ledger Table */}
      <div className="bg-[#0e1626] border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        {/* Table Controls */}
        <div className="p-4 sm:p-5 border-b border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-900/60">
          <div>
            <h2 className="font-bold text-white text-base flex items-center gap-2">
              <span>Transaction Resilience Ledger</span>
              <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-slate-800 text-slate-300">
                {filteredTransactions.length} records
              </span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Live audit journal with cryptographic timestamps and confidence state tracking
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Search */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                placeholder="Search recipient or ID..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8 pr-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500 w-44"
              />
            </div>

            {/* Filter pills */}
            <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800 text-[11px]">
              {['ALL', 'PENDING', 'CONFIRMED', 'OFFLINE', 'FLAGGED'].map((f) => (
                <button
                  key={f}
                  onClick={() => setFilterState(f)}
                  className={`px-2 py-1 rounded-md font-medium transition-colors ${
                    filterState === f
                      ? 'bg-slate-800 text-emerald-400 font-semibold'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Table Content */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-900/90 text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-800">
              <tr>
                <th className="py-3 px-4">Transaction / ID</th>
                <th className="py-3 px-4">Recipient</th>
                <th className="py-3 px-4">Amount</th>
                <th className="py-3 px-4">Channel</th>
                <th className="py-3 px-4">Confidence Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filteredTransactions.map((txn) => {
                const isPendingOrUnknown = txn.state === 'PENDING_VERIFICATION' || txn.state === 'OUTCOME_UNKNOWN';

                return (
                  <tr key={txn.id} className="hover:bg-slate-900/40 transition-colors">
                    {/* ID & Time */}
                    <td className="py-3.5 px-4 font-mono">
                      <div className="font-semibold text-slate-200">{txn.id}</div>
                      <div className="text-[11px] text-slate-500">
                        {new Date(txn.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </div>
                    </td>

                    {/* Recipient */}
                    <td className="py-3.5 px-4">
                      <div className="font-semibold text-white">{txn.recipientName || txn.recipient}</div>
                      <div className="text-[11px] text-slate-400 font-mono">{txn.recipient}</div>
                    </td>

                    {/* Amount */}
                    <td className="py-3.5 px-4 font-mono font-bold text-slate-100">
                      {txn.currency === 'USD' ? '$' : '₹'}
                      {Number(txn.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </td>

                    {/* Channel */}
                    <td className="py-3.5 px-4">
                      <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-slate-800 text-slate-300 border border-slate-700">
                        {txn.channel}
                      </span>
                    </td>

                    {/* Status Badge */}
                    <td className="py-3.5 px-4">
                      <ConfidenceBadge
                        state={txn.state}
                        onClick={() => setSelectedTxnForExplanation(txn)}
                      />
                    </td>

                    {/* Action buttons */}
                    <td className="py-3.5 px-4 text-right space-x-2">
                      {isPendingOrUnknown ? (
                        <button
                          onClick={() => reconcileTransaction(txn.id)}
                          className="px-2.5 py-1 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 border border-emerald-500/30 rounded-lg text-xs font-semibold inline-flex items-center gap-1 transition-all"
                        >
                          <RefreshCw className="w-3 h-3" />
                          Reconcile
                        </button>
                      ) : txn.state === 'FAILED' ? (
                        <>
                          <button
                            onClick={() => retryPayment(txn.id)}
                            className="px-2.5 py-1 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 border border-emerald-500/30 rounded-lg text-xs font-semibold inline-flex items-center gap-1 transition-all"
                            title="Retry failed payment with a new idempotency key"
                          >
                            <RefreshCw className="w-3 h-3" />
                            Retry
                          </button>
                          <button
                            onClick={() => setSelectedTxnForExplanation(txn)}
                            className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium inline-flex items-center gap-1 border border-slate-700 transition-colors"
                          >
                            <span>Diagnose</span>
                            <ExternalLink className="w-3 h-3" />
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => setSelectedTxnForExplanation(txn)}
                          className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium inline-flex items-center gap-1 border border-slate-700 transition-colors"
                        >
                          <span>Diagnose</span>
                          <ExternalLink className="w-3 h-3" />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
