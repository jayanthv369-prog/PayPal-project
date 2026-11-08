import React, { useState } from 'react';
import { NetworkProvider } from './context/NetworkContext';
import { PaymentProvider, usePayment } from './context/PaymentContext';
import NetworkStatusBanner from './components/NetworkStatusBanner';
import Navbar from './components/Navbar';
import StateExplanationModal from './components/StateExplanationModal';
import AuthModal from './components/AuthModal';
import WalletModal from './components/WalletModal';

// Pages
import Dashboard from './pages/Dashboard';
import OfflinePassport from './pages/OfflinePassport';
import SmartRecovery from './pages/SmartRecovery';
import PaymentConfidenceEngine from './pages/PaymentConfidenceEngine';
import VoicePay from './pages/VoicePay';
import ScamGuardian from './pages/ScamGuardian';
import CreditBridge from './pages/CreditBridge';
import CrashLab from './pages/CrashLab';
import PayPalIntegration from './pages/PayPalIntegration';

import { ShieldCheck, Heart, Github, Terminal, Cpu } from 'lucide-react';

function AppContent() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const { 
    user, 
    setUser, 
    setWallet, 
    isAuthModalOpen, 
    setIsAuthModalOpen, 
    isWalletModalOpen, 
    setIsWalletModalOpen 
  } = usePayment();

  return (
    <div className="min-h-screen flex flex-col bg-[#080d19] text-slate-100">
      {/* Network Health & Simulation Switcher Banner */}
      <NetworkStatusBanner />

      {/* Primary Brand Navigation */}
      <Navbar activeTab={activeTab} setActiveTab={setActiveTab} />

      {/* Main Page Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {activeTab === 'dashboard' && <Dashboard setActiveTab={setActiveTab} />}
        {activeTab === 'offline' && <OfflinePassport />}
        {activeTab === 'recovery' && <SmartRecovery />}
        {activeTab === 'confidence' && <PaymentConfidenceEngine />}
        {activeTab === 'voice' && <VoicePay />}
        {activeTab === 'scam' && <ScamGuardian />}
        {activeTab === 'credit' && <CreditBridge />}
        {activeTab === 'crashlab' && <CrashLab />}
        {activeTab === 'paypal' && <PayPalIntegration />}
      </main>

      {/* Global State Explanation Modal */}
      <StateExplanationModal />

      {/* Authentication Modal */}
      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        onAuthSuccess={(u, w) => {
          setUser(u);
          if (w) setWallet(w);
        }}
      />

      {/* Cyber Wallet Modal */}
      <WalletModal
        isOpen={isWalletModalOpen}
        onClose={() => setIsWalletModalOpen(false)}
        user={user}
        onBalanceUpdate={(balance) => setWallet(prev => ({ ...prev, balance }))}
      />

      {/* Footer */}
      <footer className="border-t border-slate-800/80 bg-[#060a14] py-6 px-4 mt-12">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span className="font-bold text-white">PayBastion AI</span>
            <span>• Payment Resilience & Interruption Recovery Platform</span>
          </div>

          <div className="flex flex-wrap items-center gap-4 text-[11px]">
            <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-300 font-mono">
              React + Vite + Node Express + Tailwind
            </span>
            <span className="text-slate-500 font-mono">
              Deterministic Invariant: Zero Duplicate Debits
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default function App() {
  return (
    <NetworkProvider>
      <PaymentProvider>
        <AppContent />
      </PaymentProvider>
    </NetworkProvider>
  );
}
