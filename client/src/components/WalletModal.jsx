import React, { useState, useEffect } from 'react';
import { api } from '../utils/api';
import { 
  Wallet, 
  X, 
  PlusCircle, 
  Send, 
  KeyRound, 
  CheckCircle2, 
  AlertCircle, 
  Clock, 
  Receipt, 
  ArrowUpRight, 
  ShieldCheck, 
  Sparkles,
  Info
} from 'lucide-react';

export default function WalletModal({ isOpen, onClose, user, onBalanceUpdate }) {
  const [wallet, setWallet] = useState(null);
  const [activeTab, setActiveTab] = useState('overview'); // 'overview' | 'add_funds' | 'transfer' | 'pin'
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [receipt, setReceipt] = useState(null);

  // Form states
  const [demoAmount, setDemoAmount] = useState(1000);
  const [transferRecipient, setTransferRecipient] = useState('');
  const [transferAmount, setTransferAmount] = useState('');
  const [transferPin, setTransferPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [transactions, setTransactions] = useState([]);

  useEffect(() => {
    if (isOpen && user) {
      loadWalletData();
    }
  }, [isOpen, user]);

  const loadWalletData = async () => {
    try {
      setLoading(true);
      setError('');
      const balanceData = await api.getWalletBalance();
      setWallet(balanceData);
      
      const txData = await api.getWalletTransactions({ limit: 10 });
      if (txData && txData.transactions) {
        setTransactions(txData.transactions);
      }
    } catch (err) {
      setError(err.message || 'Failed to load wallet');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const handleAddDemoFunds = async (amountToAdd) => {
    try {
      setLoading(true);
      setError('');
      setSuccess('');
      const res = await api.addDemoFunds(Number(amountToAdd));
      setWallet(prev => ({
        ...prev,
        balance: res.wallet.balance,
        currency: res.wallet.currency,
      }));
      setSuccess(`Successfully added ₹${amountToAdd.toLocaleString('en-IN')} simulated test funds.`);
      if (onBalanceUpdate) onBalanceUpdate(res.wallet.balance);
      loadWalletData();
    } catch (err) {
      setError(err.message || 'Failed to add funds');
    } finally {
      setLoading(false);
    }
  };

  const handleSetPin = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (newPin.length !== 4 || !/^\d{4}$/.test(newPin)) {
      setError('PIN must be exactly 4 numeric digits');
      return;
    }

    if (newPin !== confirmPin) {
      setError('PIN confirmation does not match');
      return;
    }

    try {
      setLoading(true);
      await api.setWalletPin(newPin);
      setSuccess('Wallet PIN updated securely.');
      setNewPin('');
      setConfirmPin('');
      loadWalletData();
    } catch (err) {
      setError(err.message || 'Failed to set PIN');
    } finally {
      setLoading(false);
    }
  };

  const handleTransfer = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setReceipt(null);

    const amt = parseFloat(transferAmount);
    if (isNaN(amt) || amt <= 0) {
      setError('Please enter a valid positive transfer amount');
      return;
    }

    if (!transferPin || transferPin.length !== 4) {
      setError('Please provide your 4-digit security PIN');
      return;
    }

    try {
      setLoading(true);
      const idempotencyKey = `wt_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      const res = await api.walletTransfer({
        recipientEmail: transferRecipient,
        amount: amt,
        pin: transferPin,
        idempotencyKey,
      });

      setSuccess(`Transferred ₹${amt.toLocaleString('en-IN')} to ${transferRecipient}`);
      setReceipt(res.transaction);
      setTransferAmount('');
      setTransferRecipient('');
      setTransferPin('');
      loadWalletData();
      if (onBalanceUpdate && res.wallet) {
        onBalanceUpdate(res.wallet.balance);
      }
    } catch (err) {
      setError(err.message || 'Transfer failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fadeIn">
      <div className="bg-[#0e1626] border border-slate-800 rounded-2xl p-6 max-w-xl w-full shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <Wallet className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-white text-base flex items-center gap-2">
                PayBastion Cyber Wallet
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  SIMULATED
                </span>
              </h3>
              <p className="text-xs text-slate-400">Authenticated user: {user?.email}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Balance Card */}
        <div className="bg-gradient-to-br from-slate-900 to-[#121d33] border border-slate-800 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">Available Balance</span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-3xl font-extrabold text-white font-mono">
                ₹{wallet ? Number(wallet.balance).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00'}
              </span>
              <span className="text-xs font-semibold text-emerald-400 font-mono">INR</span>
            </div>
            <div className="flex items-center gap-1.5 mt-2 text-[11px] text-amber-400/90 bg-amber-500/10 px-2 py-1 rounded border border-amber-500/20">
              <Info className="w-3.5 h-3.5 shrink-0" />
              <span>Simulated demo funds. Not legal tender.</span>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setActiveTab('add_funds')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                activeTab === 'add_funds'
                  ? 'bg-emerald-500 text-slate-950 font-bold'
                  : 'bg-slate-800 hover:bg-slate-700 text-emerald-400 border border-slate-700'
              }`}
            >
              <PlusCircle className="w-3.5 h-3.5" />
              <span>Add Demo Funds</span>
            </button>
            <button
              onClick={() => setActiveTab('transfer')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                activeTab === 'transfer'
                  ? 'bg-emerald-500 text-slate-950 font-bold'
                  : 'bg-slate-800 hover:bg-slate-700 text-emerald-400 border border-slate-700'
              }`}
            >
              <Send className="w-3.5 h-3.5" />
              <span>Direct Transfer</span>
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-800 gap-2">
          {[
            { id: 'overview', label: 'Ledger History', icon: Clock },
            { id: 'add_funds', label: 'Top-Up Demo', icon: PlusCircle },
            { id: 'transfer', label: 'Peer Transfer', icon: Send },
            { id: 'pin', label: 'Security PIN', icon: KeyRound },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id);
                  setError('');
                  setSuccess('');
                }}
                className={`pb-2.5 px-3 text-xs font-medium flex items-center gap-1.5 border-b-2 transition-colors ${
                  isActive
                    ? 'border-emerald-400 text-emerald-400 font-semibold'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Alerts */}
        {error && (
          <div className="p-3 rounded-xl bg-rose-950/20 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="p-3 rounded-xl bg-emerald-950/20 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{success}</span>
          </div>
        )}

        {/* Tab Content: OVERVIEW / TRANSACTIONS */}
        {activeTab === 'overview' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span className="font-semibold text-slate-300">Recent Wallet Operations</span>
              <button onClick={loadWalletData} className="hover:text-white">Refresh</button>
            </div>

            {transactions.length === 0 ? (
              <div className="text-center py-8 text-slate-500 text-xs border border-dashed border-slate-800 rounded-xl">
                No recent wallet transactions. Add demo funds or make a peer transfer.
              </div>
            ) : (
              <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                {transactions.map((tx) => {
                  const isCredit = tx.recipient === user?._id || tx.recipient === user?.email;
                  return (
                    <div
                      key={tx.transactionId || tx._id}
                      className="p-3 rounded-xl bg-slate-900/60 border border-slate-800/80 flex items-center justify-between text-xs"
                    >
                      <div className="flex items-center gap-2.5">
                        <div className={`p-1.5 rounded-lg ${isCredit ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}`}>
                          <ArrowUpRight className={`w-3.5 h-3.5 ${isCredit ? 'rotate-180' : ''}`} />
                        </div>
                        <div>
                          <div className="font-medium text-white flex items-center gap-1.5">
                            <span>{isCredit ? 'Received / Top-Up' : 'Sent Transfer'}</span>
                            <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 font-mono">
                              {tx.status}
                            </span>
                          </div>
                          <div className="text-[10px] text-slate-500 font-mono">
                            {new Date(tx.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • Ref: {tx.transactionId?.substring(0, 16)}...
                          </div>
                        </div>
                      </div>
                      <div className={`font-mono font-bold ${isCredit ? 'text-emerald-400' : 'text-slate-300'}`}>
                        {isCredit ? '+' : '-'}₹{Number(tx.amount).toLocaleString('en-IN')}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Tab Content: ADD DEMO FUNDS */}
        {activeTab === 'add_funds' && (
          <div className="space-y-4 text-xs">
            <p className="text-slate-300">
              Select or enter simulated funds to credit to your sandbox balance for development and feature testing:
            </p>

            <div className="grid grid-cols-4 gap-2">
              {[500, 1000, 2000, 5000].map((amt) => (
                <button
                  key={amt}
                  type="button"
                  onClick={() => setDemoAmount(amt)}
                  className={`py-2 px-3 rounded-xl font-mono font-bold transition-all ${
                    demoAmount === amt
                      ? 'bg-emerald-500 text-slate-950 border border-emerald-400'
                      : 'bg-slate-900 border border-slate-800 text-slate-300 hover:border-slate-700'
                  }`}
                >
                  +₹{amt}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <input
                type="number"
                min="1"
                max="50000"
                value={demoAmount}
                onChange={(e) => setDemoAmount(Math.max(1, parseInt(e.target.value) || 0))}
                className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono focus:border-emerald-500 focus:outline-none"
              />
              <button
                type="button"
                disabled={loading}
                onClick={() => handleAddDemoFunds(demoAmount)}
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-bold shrink-0 disabled:opacity-50"
              >
                {loading ? 'Crediting...' : 'Add Funds'}
              </button>
            </div>
          </div>
        )}

        {/* Tab Content: PEER TRANSFER */}
        {activeTab === 'transfer' && (
          <form onSubmit={handleTransfer} className="space-y-3 text-xs">
            <div>
              <label className="font-semibold text-slate-300 block mb-1">Recipient PayBastion Email</label>
              <input
                type="email"
                value={transferRecipient}
                onChange={(e) => setTransferRecipient(e.target.value)}
                placeholder="recipient@paybastion.dev"
                required
                className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white focus:border-emerald-500 focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="font-semibold text-slate-300 block mb-1">Amount (₹ INR)</label>
                <input
                  type="number"
                  min="1"
                  step="any"
                  value={transferAmount}
                  onChange={(e) => setTransferAmount(e.target.value)}
                  placeholder="e.g. 250"
                  required
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-300 block mb-1">4-Digit Security PIN</label>
                <input
                  type="password"
                  maxLength="4"
                  value={transferPin}
                  onChange={(e) => setTransferPin(e.target.value)}
                  placeholder="••••"
                  required
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono tracking-widest text-center focus:border-emerald-500 focus:outline-none"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-bold disabled:opacity-50 flex items-center justify-center gap-2 mt-2"
            >
              <Send className="w-4 h-4" />
              <span>{loading ? 'Processing Transfer...' : 'Confirm Atomic Transfer'}</span>
            </button>

            {receipt && (
              <div className="p-3 mt-3 rounded-xl bg-slate-900 border border-slate-800 text-[11px] font-mono space-y-1">
                <div className="text-emerald-400 font-bold flex items-center gap-1.5">
                  <Receipt className="w-3.5 h-3.5" />
                  <span>Transfer Receipt</span>
                </div>
                <div className="text-slate-400">Transaction ID: {receipt.transactionId}</div>
                <div className="text-slate-400">Status: {receipt.status}</div>
                <div className="text-slate-400">Amount: ₹{receipt.amount} {receipt.currency}</div>
              </div>
            )}
          </form>
        )}

        {/* Tab Content: SECURITY PIN */}
        {activeTab === 'pin' && (
          <form onSubmit={handleSetPin} className="space-y-3 text-xs">
            <p className="text-slate-400 text-[11px]">
              Set or update your 4-digit PIN for authorizing wallet transfers. PINs are salted with bcrypt and never stored in plain text.
            </p>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="font-semibold text-slate-300 block mb-1">New 4-Digit PIN</label>
                <input
                  type="password"
                  maxLength="4"
                  value={newPin}
                  onChange={(e) => setNewPin(e.target.value)}
                  placeholder="••••"
                  required
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono tracking-widest text-center focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-300 block mb-1">Confirm PIN</label>
                <input
                  type="password"
                  maxLength="4"
                  value={confirmPin}
                  onChange={(e) => setConfirmPin(e.target.value)}
                  placeholder="••••"
                  required
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono tracking-widest text-center focus:border-emerald-500 focus:outline-none"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-750 text-emerald-400 font-bold border border-slate-700 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <KeyRound className="w-4 h-4" />
              <span>{loading ? 'Updating...' : 'Set 4-Digit Security PIN'}</span>
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
