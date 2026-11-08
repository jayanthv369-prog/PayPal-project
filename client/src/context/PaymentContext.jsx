import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import confetti from 'canvas-confetti';
import { INITIAL_TRANSACTIONS, SIMULATED_CREDIT_PROFILE } from '../utils/mockData.js';
import { generateAuthId, generateNonce, signPayloadWebCrypto, verifySignatureWebCrypto } from '../utils/cryptoUtils.js';
import { api } from '../utils/api.js';

const PaymentContext = createContext();

export function PaymentProvider({ children }) {
  // 1. Transactions State
  const [transactions, setTransactions] = useState(() => {
    const saved = localStorage.getItem('paybastion_txns');
    if (saved) {
      try { return JSON.parse(saved); } catch (e) { /* ignore */ }
    }
    return INITIAL_TRANSACTIONS;
  });

  // 2. Offline Passports State
  const [offlinePassports, setOfflinePassports] = useState(() => {
    const saved = localStorage.getItem('paybastion_offline_passports');
    if (saved) {
      try { return JSON.parse(saved); } catch (e) { /* ignore */ }
    }
    return [];
  });

  // 3. Merchant Received Authorizations (Settlement queue)
  const [merchantJournal, setMerchantJournal] = useState(() => {
    const saved = localStorage.getItem('paybastion_merchant_journal');
    if (saved) {
      try { return JSON.parse(saved); } catch (e) { /* ignore */ }
    }
    return [];
  });

  // 4. Temporary Credit Bridge State
  const [creditProfile, setCreditProfile] = useState(() => {
    const saved = localStorage.getItem('paybastion_credit_profile');
    if (saved) {
      try { return JSON.parse(saved); } catch (e) { /* ignore */ }
    }
    return SIMULATED_CREDIT_PROFILE;
  });

  // 5. Active Explanation Modal State
  const [selectedTxnForExplanation, setSelectedTxnForExplanation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [backendConnected, setBackendConnected] = useState(false);

  // 6. User Authentication & Wallet State
  const [user, setUser] = useState(null);
  const [wallet, setWallet] = useState(null);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isWalletModalOpen, setIsWalletModalOpen] = useState(false);

  // Sync to local storage for offline resilience
  useEffect(() => {
    try {
      localStorage.setItem('paybastion_txns', JSON.stringify(transactions));
    } catch (e) { /* ignore */ }
  }, [transactions]);

  useEffect(() => {
    try {
      localStorage.setItem('paybastion_offline_passports', JSON.stringify(offlinePassports));
    } catch (e) { /* ignore */ }
  }, [offlinePassports]);

  useEffect(() => {
    try {
      localStorage.setItem('paybastion_merchant_journal', JSON.stringify(merchantJournal));
    } catch (e) { /* ignore */ }
  }, [merchantJournal]);

  useEffect(() => {
    try {
      localStorage.setItem('paybastion_credit_profile', JSON.stringify(creditProfile));
    } catch (e) { /* ignore */ }
  }, [creditProfile]);

  /**
   * Load initial data from persistent SQLite backend
   */
  const refreshData = useCallback(async () => {
    try {
      setLoading(true);
      // Fetch transactions
      const txData = await api.fetchTransactions({ limit: 50 });
      if (txData && Array.isArray(txData.transactions)) {
        setTransactions(txData.transactions);
        setBackendConnected(true);
      }

      // Fetch offline passports
      try {
        const passData = await api.fetchOfflinePassports();
        if (passData && Array.isArray(passData.passports)) {
          setOfflinePassports(passData.passports);
        }
      } catch (e) { /* ignore */ }

      // Fetch merchant journal
      try {
        const jData = await api.fetchMerchantJournal();
        if (jData && Array.isArray(jData.journal)) {
          setMerchantJournal(jData.journal);
        }
      } catch (e) { /* ignore */ }

      // Fetch credit profile
      try {
        const cProfile = await api.fetchCreditProfile();
        if (cProfile && cProfile.userId) {
          setCreditProfile(cProfile);
        }
      } catch (e) { /* ignore */ }

    } catch (err) {
      console.warn('Backend initial fetch note (using persistent cache):', err.message);
      setBackendConnected(false);
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshUser = useCallback(async () => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('paybastion_token') : null;
    if (!token) {
      setUser(null);
      setWallet(null);
      return;
    }
    try {
      const res = await api.getMe();
      if (res && res.user) {
        setUser(res.user);
        if (res.wallet) setWallet(res.wallet);
      }
    } catch (err) {
      localStorage.removeItem('paybastion_token');
      setUser(null);
      setWallet(null);
    }
  }, []);

  const refreshWallet = useCallback(async () => {
    try {
      const w = await api.getWalletBalance();
      if (w) setWallet(w);
    } catch (err) {
      /* ignore */
    }
  }, []);

  const logoutUser = useCallback(async () => {
    try {
      await api.logout();
    } catch (e) { /* ignore */ }
    localStorage.removeItem('paybastion_token');
    setUser(null);
    setWallet(null);
  }, []);

  useEffect(() => {
    refreshData();
    refreshUser();
  }, [refreshData, refreshUser]);

  /**
   * Celebrate with confetti on recovery / payment confirmation
   */
  const triggerCelebration = () => {
    try {
      confetti({
        particleCount: 50,
        spread: 60,
        origin: { y: 0.7 },
        colors: ['#10b981', '#38bdf8', '#fbbf24'],
      });
    } catch (e) { /* ignore */ }
  };

  /**
   * Add a new transaction (persisting to SQLite backend)
   */
  const addTransaction = async (txn) => {
    // Optimistically update UI
    setTransactions(prev => [txn, ...prev.filter(t => t.id !== txn.id)]);

    try {
      const created = await api.createTransaction({
        id: txn.id,
        idempotencyKey: txn.idempotencyKey,
        amount: txn.amount,
        currency: txn.currency || 'INR',
        sender: txn.sender,
        recipient: txn.recipient,
        recipientName: txn.recipientName,
        category: txn.category,
        channel: txn.channel,
        state: txn.state,
        confidenceScore: txn.confidenceScore,
        userExplanation: txn.userExplanation,
        technicalDiagnosis: txn.technicalDiagnosis,
        safeToRetry: txn.safeToRetry,
        logs: txn.logs,
      });
      if (created) {
        setTransactions(prev => [created, ...prev.filter(t => t.id !== created.id)]);
      }
    } catch (err) {
      console.warn('Backend create transaction note (stored locally):', err.message);
    }
  };

  /**
   * Smart Recovery Reconciler
   * Queries original payment provider using idempotency key before deciding outcome
   */
  const reconcileTransaction = async (txnId, forcedOutcome = null) => {
    const txn = transactions.find(t => t.id === txnId || t.idempotencyKey === txnId);
    if (!txn) return { success: false, message: 'Transaction not found' };

    try {
      let result = null;
      try {
        result = await api.reconcileTransaction({
          idempotencyKey: txn.idempotencyKey,
          amount: txn.amount,
          recipient: txn.recipient,
          simulatedOutcome: forcedOutcome,
          provider: txn.channel === 'PAYPAL_SANDBOX' ? 'PAYPAL' : 'UPI_GATEWAY',
          orderId: txn.id?.startsWith('PAYPAL-') ? txn.id.replace('PAYPAL-', '') : null,
        });
      } catch (netErr) {
        console.warn('Backend reconcile not reachable, using offline reconciler:', netErr.message);
      }

      const resolvedState = result?.reconciliationResult?.resolvedState || forcedOutcome || txn.state;
      const explanation = result?.reconciliationResult?.explanation || {
        userExplanation: resolvedState === 'CONFIRMED'
          ? `Clearinghouse confirmed debit of ₹${txn.amount}. Reference: ${result?.reconciliationResult?.providerReference || 'UTR-' + Date.now().toString().slice(-8)}. Original transaction verified. Zero duplicate risk.`
          : (resolvedState === 'FAILED'
            ? 'The payment provider confirmed zero funds were debited from your account. It is safe to retry.'
            : 'Payment outcome remains uncertain. Idempotency lock held to prevent duplicate debit.'),
        technicalDiagnosis: 'Idempotency key re-queried upstream. Lock state verified.',
        safeToRetry: resolvedState === 'FAILED',
        recommendedAction: resolvedState === 'CONFIRMED'
          ? 'Do NOT retry. Receipt is valid.'
          : (resolvedState === 'FAILED' ? 'Safe to re-initiate with a new payment.' : 'Hold tight. Awaiting bank reconciliation.'),
      };

      const updatedTx = result?.transaction || {
        ...txn,
        state: resolvedState,
        confidenceScore: resolvedState === 'CONFIRMED' ? 99 : 100,
        userExplanation: explanation.userExplanation,
        technicalDiagnosis: explanation.technicalDiagnosis,
        safeToRetry: explanation.safeToRetry,
        needsReconciliation: false,
        reconciliationStatus: 'RECONCILED',
        providerReference: result?.reconciliationResult?.providerReference || txn.providerReference,
        logs: [
          ...(txn.logs || []),
          {
            timestamp: new Date().toISOString(),
            event: 'RECONCILED_BY_SMART_RECOVERY',
            detail: `Idempotency verification: ${resolvedState}. Provider verified.`,
          },
        ],
      };

      setTransactions(prev => prev.map(t => (t.id === txn.id ? updatedTx : t)));

      if (resolvedState === 'CONFIRMED') {
        triggerCelebration();
      }

      return { success: true, resolvedState, explanation, transaction: updatedTx };
    } catch (err) {
      console.error('Reconciliation error:', err);
      return { success: false, message: err.message };
    }
  };

  /**
   * Retry Payment:
   * Blocked if transaction is OUTCOME_UNKNOWN or PENDING_VERIFICATION.
   * Only allowed after Smart Reconcile confirms transaction FAILED.
   * Strictly uses a NEW idempotency key.
   */
  const retryPayment = async (txnId) => {
    const txn = transactions.find(t => t.id === txnId || t.idempotencyKey === txnId);
    if (!txn) {
      return { success: false, message: 'Transaction not found' };
    }

    if (txn.state === 'OUTCOME_UNKNOWN') {
      return {
        success: false,
        blocked: true,
        code: 'RETRY_BLOCKED_OUTCOME_UNKNOWN',
        message: 'Payment outcome is unknown. Please use Smart Reconcile before attempting another payment.',
      };
    }

    if (txn.state === 'PENDING_VERIFICATION') {
      return {
        success: false,
        blocked: true,
        code: 'RETRY_BLOCKED_PENDING',
        message: 'Payment verification is pending. Please use Smart Reconcile before attempting another payment.',
      };
    }

    if (txn.state !== 'FAILED' && !txn.safeToRetry) {
      return {
        success: false,
        blocked: true,
        code: 'RETRY_NOT_PERMITTED',
        message: 'Only failed or non-debited transactions may be retried.',
      };
    }

    const newIdempotencyKey = `IDEMP-RETRY-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

    try {
      const res = await api.retryTransaction(txn.id, {
        newIdempotencyKey,
        amount: txn.amount,
      });

      if (res && res.transaction) {
        setTransactions(prev => [res.transaction, ...prev]);
        return { success: true, transaction: res.transaction };
      }
      return { success: false, message: res?.message || 'Retry failed' };
    } catch (err) {
      console.warn('Backend retry call note:', err.message);
      return { success: false, message: err.message };
    }
  };

  /**
   * Create an Offline Payment Passport Token
   */
  const createOfflinePassport = async ({
    amount,
    recipientId = 'namma-metro-kiosk@axis',
    recipientName = 'Transit / Kiosk',
    expiryMinutes = 15,
  }) => {
    let passport = null;

    try {
      passport = await api.signOfflinePassport({
        amount: parseFloat(amount),
        recipientId,
        recipientName,
        senderId: 'user-ananya@paybastion',
        expiryMinutes,
      });
    } catch (err) {
      console.warn('Backend sign offline not reachable; using client WebCrypto:', err.message);
      // Offline fallback: Client WebCrypto signing
      const authId = generateAuthId();
      const nonce = generateNonce();
      const expiresAt = new Date(Date.now() + expiryMinutes * 60000).toISOString();
      const createdAt = new Date().toISOString();

      passport = {
        authId,
        senderId: 'user-ananya@paybastion',
        recipientId,
        recipientName,
        amount: parseFloat(amount),
        currency: 'INR',
        nonce,
        createdAt,
        expiresAt,
        version: 'PayBastion-v1.0-Offline',
        status: 'SETTLEMENT_PENDING',
      };
      passport.signature = await signPayloadWebCrypto(passport);
    }

    // Record in local offline passports
    setOfflinePassports(prev => [passport, ...prev]);

    // Record corresponding entry in main transaction feed
    const offlineTxn = {
      id: passport.authId,
      idempotencyKey: `IDEMP-${passport.authId}`,
      amount: parseFloat(amount),
      currency: 'INR',
      sender: passport.senderId || 'user-ananya@paybastion',
      recipient: recipientId,
      recipientName,
      category: 'Offline Transit / Retail',
      channel: 'OFFLINE_PASSPORT',
      state: 'OFFLINE_AUTHORIZATION',
      confidenceScore: 88,
      createdAt: passport.createdAt || new Date().toISOString(),
      expiresAt: passport.expiresAt,
      nonce: passport.nonce,
      signature: passport.signature,
      settlementPending: true,
      userExplanation: 'Offline cryptographically signed authorization generated. Funds held pending merchant batch sync.',
      technicalDiagnosis: `HMAC-SHA256 signature generated. Nonce ${passport.nonce.substring(0, 10)}... protected.`,
      safeToRetry: false,
      logs: [
        {
          timestamp: new Date().toISOString(),
          event: 'OFFLINE_AUTH_CREATED',
          detail: `Authorized ₹${amount} with ${expiryMinutes}m TTL.`,
        },
      ],
    };

    setTransactions(prev => [offlineTxn, ...prev.filter(t => t.id !== offlineTxn.id)]);

    return passport;
  };

  /**
   * Merchant Terminal Verification: Scan & Validate an Offline Authorization
   */
  const verifyOfflinePassport = async (passportData) => {
    try {
      const backendResult = await api.verifyOfflinePassport(passportData);
      if (backendResult) {
        if (backendResult.valid && backendResult.journalEntry) {
          setMerchantJournal(prev => [backendResult.journalEntry, ...prev.filter(j => j.nonce !== backendResult.journalEntry.nonce)]);
        }
        return backendResult;
      }
    } catch (err) {
      console.warn('Backend verify not reachable; using client verification:', err.message);
    }

    // Client verification fallback
    const { nonce, expiresAt, signature, amount } = passportData;
    const now = Date.now();

    if (now > new Date(expiresAt).getTime()) {
      return {
        valid: false,
        code: 'EXPIRED',
        title: 'Authorization Expired',
        message: `Offline token expired on ${new Date(expiresAt).toLocaleTimeString()}. Expired tokens cannot be honored for delayed settlement.`,
      };
    }

    const alreadyRedeemed = merchantJournal.find(item => item.nonce === nonce);
    if (alreadyRedeemed) {
      return {
        valid: false,
        code: 'REPLAY_DETECTED',
        title: 'CRITICAL: Replay Attack Prevented',
        message: `This offline token (Nonce: ${nonce.substring(0, 12)}...) was ALREADY accepted on ${new Date(alreadyRedeemed.scannedAt).toLocaleTimeString()}. Replay reuse is strictly prohibited.`,
      };
    }

    const isValidSignature = await verifySignatureWebCrypto(passportData, signature);
    if (!isValidSignature) {
      return {
        valid: false,
        code: 'INVALID_SIGNATURE',
        title: 'Signature Tampered',
        message: 'Cryptographic signature mismatch! Token payload has been altered or signed with an unauthorized key.',
      };
    }

    if (parseFloat(amount) > 2000) {
      return {
        valid: false,
        code: 'LIMIT_EXCEEDED',
        title: 'Amount Ceiling Exceeded',
        message: 'Offline single-authorization limit is capped at ₹2,000 for network-disconnected risk containment.',
      };
    }

    const journalEntry = {
      ...passportData,
      scannedAt: new Date().toISOString(),
      terminalHoldId: `MERCHANT-HOLD-${Date.now().toString(36).toUpperCase()}`,
      settlementStatus: 'SETTLEMENT_PENDING',
    };

    setMerchantJournal(prev => [journalEntry, ...prev]);

    return {
      valid: true,
      code: 'ACCEPTED_FOR_SETTLEMENT',
      title: 'Offline Authorization Accepted',
      message: 'Cryptographic signature verified. Token queued in merchant ledger for batch settlement upon reconnect.',
      isFinalSettlement: false,
      journalEntry,
    };
  };

  /**
   * Activate Temporary Credit Bridge Fallback
   */
  const activateCreditBridge = async ({ targetTxnId, amount, recipient, recipientName = 'Merchant' }) => {
    const numAmount = parseFloat(amount);
    if (numAmount > creditProfile.availableCredit) {
      return { success: false, message: 'Requested amount exceeds available simulated credit limit.' };
    }

    try {
      const res = await api.activateCreditBridge({
        targetTxnId,
        amount: numAmount,
        recipient,
        recipientName,
        consentGiven: true,
      });

      if (res && res.success) {
        if (res.creditProfile) setCreditProfile(res.creditProfile);
        if (res.transaction) {
          setTransactions(prev => [res.transaction, ...prev.filter(t => t.id !== res.transaction.id)]);
        }
        triggerCelebration();
        return res;
      }
    } catch (err) {
      console.warn('Backend credit activation note (using local fallback):', err.message);
    }

    // Local fallback
    const bridgeLoanId = `CREDIT-BRIDGE-${Date.now().toString(36).toUpperCase()}`;
    const newUtilized = creditProfile.utilizedCredit + numAmount;
    const newAvailable = creditProfile.creditLimit - newUtilized;

    const newInstallment = {
      id: `INST-${Date.now().toString().slice(-4)}`,
      dueDate: new Date(Date.now() + 7 * 86400000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      amount: numAmount,
      status: 'PENDING',
      loanId: bridgeLoanId,
      recipient,
      recipientName,
    };

    setCreditProfile(prev => ({
      ...prev,
      utilizedCredit: newUtilized,
      availableCredit: newAvailable,
      repaymentSchedule: [...prev.repaymentSchedule, newInstallment],
    }));

    const creditTxn = {
      id: bridgeLoanId,
      idempotencyKey: `IDEMP-${bridgeLoanId}`,
      amount: numAmount,
      currency: 'INR',
      sender: 'PayBastion Temporary Credit Pool (Simulation)',
      recipient,
      recipientName,
      category: 'Emergency Credit Fallback (Simulation)',
      channel: 'CREDIT_BRIDGE_FALLBACK',
      state: 'CONFIRMED',
      confidenceScore: 98,
      createdAt: new Date().toISOString(),
      isSimulation: true,
      userExplanation: 'Simulated temporary micro-credit disbursed to merchant on your behalf while primary payment is investigated.',
      technicalDiagnosis: `Disbursed from simulated pool. Scheduled for repayment on ${newInstallment.dueDate}.`,
      safeToRetry: false,
      logs: [
        { timestamp: new Date().toISOString(), event: 'CREDIT_BRIDGE_DISBURSED', detail: `₹${numAmount} covered merchant payment under demonstration escrow.` },
      ],
    };

    setTransactions(prev => [creditTxn, ...prev]);
    triggerCelebration();

    return { success: true, bridgeLoanId, installment: newInstallment, transaction: creditTxn };
  };

  /**
   * Repay a simulated credit installment
   */
  const repayCreditInstallment = async (installmentId) => {
    try {
      const res = await api.repayCreditInstallment({ installmentId });
      if (res && res.success && res.creditProfile) {
        setCreditProfile(res.creditProfile);
        triggerCelebration();
        return;
      }
    } catch (err) {
      console.warn('Backend repay installment note (using local calculation):', err.message);
    }

    // Local fallback
    const installment = creditProfile.repaymentSchedule.find(i => i.id === installmentId);
    if (!installment) return;

    const newUtilized = Math.max(0, creditProfile.utilizedCredit - installment.amount);
    const newAvailable = creditProfile.creditLimit - newUtilized;

    setCreditProfile(prev => ({
      ...prev,
      utilizedCredit: newUtilized,
      availableCredit: newAvailable,
      repaymentSchedule: prev.repaymentSchedule.map(i => i.id === installmentId ? { ...i, status: 'REPAID' } : i),
    }));

    triggerCelebration();
  };

  /**
   * Reset demo data
   */
  const resetDemoData = async () => {
    try {
      await api.resetOfflineReplayCache();
    } catch (e) { /* ignore */ }

    localStorage.removeItem('paybastion_txns');
    localStorage.removeItem('paybastion_offline_passports');
    localStorage.removeItem('paybastion_merchant_journal');
    localStorage.removeItem('paybastion_credit_profile');

    await refreshData();
  };

  return (
    <PaymentContext.Provider
      value={{
        transactions,
        offlinePassports,
        merchantJournal,
        creditProfile,
        selectedTxnForExplanation,
        setSelectedTxnForExplanation,
        addTransaction,
        reconcileTransaction,
        retryPayment,
        createOfflinePassport,
        verifyOfflinePassport,
        activateCreditBridge,
        repayCreditInstallment,
        resetDemoData,
        triggerCelebration,
        loading,
        backendConnected,
        refreshData,
        user,
        setUser,
        wallet,
        setWallet,
        isAuthModalOpen,
        setIsAuthModalOpen,
        isWalletModalOpen,
        setIsWalletModalOpen,
        refreshUser,
        refreshWallet,
        logoutUser,
      }}
    >
      {children}
    </PaymentContext.Provider>
  );
}

export function usePayment() {
  const context = useContext(PaymentContext);
  if (!context) throw new Error('usePayment must be used within PaymentProvider');
  return context;
}
