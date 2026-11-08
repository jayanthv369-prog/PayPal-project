import React, { useState } from 'react';
import { usePayment } from '../context/PaymentContext';
import { 
  ShieldCheck, 
  QrCode, 
  RefreshCw, 
  Zap, 
  Mic, 
  ShieldAlert, 
  CreditCard, 
  Flame, 
  Wallet, 
  RotateCcw,
  Menu,
  X,
  User,
  LogOut
} from 'lucide-react';

export default function Navbar({ activeTab, setActiveTab }) {
  const { 
    resetDemoData, 
    user, 
    wallet, 
    setIsAuthModalOpen, 
    setIsWalletModalOpen, 
    logoutUser 
  } = usePayment();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: ShieldCheck },
    { id: 'offline', label: 'Offline Passport', icon: QrCode },
    { id: 'recovery', label: 'Smart Recovery', icon: RefreshCw },
    { id: 'confidence', label: 'Confidence Engine', icon: Zap },
    { id: 'voice', label: 'VoicePay AI', icon: Mic },
    { id: 'scam', label: 'Scam Guardian', icon: ShieldAlert },
    { id: 'credit', label: 'Credit Bridge', icon: CreditCard },
    { id: 'crashlab', label: 'Crash Lab', icon: Flame },
    { id: 'paypal', label: 'PayPal Sandbox', icon: Wallet },
  ];

  const handleSelectTab = (id) => {
    setActiveTab(id);
    setMobileMenuOpen(false);
  };

  return (
    <header className="bg-[#0b1222] border-b border-slate-800/80 sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Brand Logo */}
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => handleSelectTab('dashboard')}>
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-400 flex items-center justify-center text-slate-950 shadow-lg shadow-emerald-500/20">
              <ShieldCheck className="w-6 h-6 stroke-[2.5]" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-extrabold text-lg text-white tracking-tight">PayBastion</span>
                <span className="text-[10px] uppercase font-bold tracking-widest px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  AI RESILIENCE
                </span>
              </div>
              <p className="text-[11px] text-slate-400 hidden sm:block">Zero-Drop Payment Recovery Platform</p>
            </div>
          </div>

          {/* Desktop Navigation Links */}
          <nav className="hidden lg:flex items-center gap-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => handleSelectTab(item.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                    isActive
                      ? 'bg-slate-800 text-emerald-400 border border-slate-700 shadow-sm'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                  }`}
                >
                  <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-emerald-400' : 'text-slate-400'}`} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>

          {/* Right Controls */}
          <div className="flex items-center gap-2">
            {/* User & Wallet Status Pill */}
            {user ? (
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setIsWalletModalOpen(true)}
                  className="px-2.5 py-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs font-semibold flex items-center gap-1.5 transition-all shadow-sm"
                  title="Open Cyber Wallet"
                >
                  <Wallet className="w-3.5 h-3.5" />
                  <span className="font-mono">
                    ₹{wallet ? Number(wallet.balance).toLocaleString('en-IN') : '0'}
                  </span>
                  <span className="text-slate-400 font-normal hidden xl:inline">({user.name?.split(' ')[0] || user.email?.split('@')[0]})</span>
                </button>
                <button
                  onClick={logoutUser}
                  title="Sign Out"
                  className="p-1.5 rounded-lg bg-slate-850 hover:bg-slate-800 text-slate-400 hover:text-rose-400 border border-slate-800 transition-colors"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setIsAuthModalOpen(true)}
                className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold text-xs flex items-center gap-1.5 shadow-sm transition-all"
              >
                <User className="w-3.5 h-3.5" />
                <span>Sign In</span>
              </button>
            )}

            <button
              onClick={() => {
                if (window.confirm('Reset transactions and offline journals to default demo state?')) {
                  resetDemoData();
                }
              }}
              title="Reset Demo Data"
              className="px-2.5 py-1.5 rounded-lg bg-slate-850 hover:bg-slate-800 text-slate-400 hover:text-slate-200 text-xs font-medium border border-slate-800 flex items-center gap-1.5 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Reset Demo</span>
            </button>

            {/* Mobile Menu Toggle */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="lg:hidden p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="lg:hidden border-t border-slate-800 bg-[#090f1d] px-4 pt-2 pb-4 space-y-1">
          {/* Mobile Auth/Wallet Row */}
          <div className="pb-2 mb-2 border-b border-slate-800 flex items-center justify-between">
            {user ? (
              <div className="flex items-center justify-between w-full">
                <button
                  onClick={() => {
                    setIsWalletModalOpen(true);
                    setMobileMenuOpen(false);
                  }}
                  className="px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs font-semibold flex items-center gap-2"
                >
                  <Wallet className="w-4 h-4" />
                  <span>Wallet: ₹{wallet ? Number(wallet.balance).toLocaleString('en-IN') : '0'}</span>
                </button>
                <button
                  onClick={() => {
                    logoutUser();
                    setMobileMenuOpen(false);
                  }}
                  className="px-2.5 py-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-rose-400 text-xs flex items-center gap-1.5"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Logout</span>
                </button>
              </div>
            ) : (
              <button
                onClick={() => {
                  setIsAuthModalOpen(true);
                  setMobileMenuOpen(false);
                }}
                className="w-full py-2 rounded-lg bg-emerald-600 text-slate-950 font-bold text-xs flex items-center justify-center gap-2"
              >
                <User className="w-4 h-4" />
                <span>Sign In / Create Account</span>
              </button>
            )}
          </div>
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => handleSelectTab(item.id)}
                className={`w-full px-3 py-2.5 rounded-lg text-xs font-semibold flex items-center gap-2.5 ${
                  isActive
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                    : 'text-slate-300 hover:bg-slate-800'
                }`}
              >
                <Icon className="w-4 h-4 text-emerald-400" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </header>
  );
}
