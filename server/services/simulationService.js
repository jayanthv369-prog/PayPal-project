import { getDatabase } from '../config/database.js';
import { createTransaction, updateTransactionState, TRANSACTION_STATES } from './transactionService.js';
import { registerRecoveryTransaction, reconcileRecoveryTransaction } from './recoveryService.js';
import { createAndSignOfflinePassport, verifyOfflinePassport } from './cryptoSigner.js';
import { analyzeScamRisk } from './scamDetectionService.js';
import { activateCreditBridge, getCreditProfile } from './creditService.js';

export async function runCrashLabScenario(scenarioId, params = {}, db = null) {
  const database = db || getDatabase();
  const logs = [];
  const addLog = (step, desc) => {
    logs.push({
      time: new Date().toLocaleTimeString(),
      step,
      desc,
      timestamp: new Date().toISOString(),
    });
  };

  switch (scenarioId) {
    case 'SCENARIO_1_NETWORK_DROP': {
      addLog('Init', 'User authorizes ₹650 payment to Crash Lab Test Merchant');
      addLog('Drop', 'Cellular tower hands off; 100% packet loss simulated');

      const isRetry = Boolean(params?.isRetry);
      const txId = params?.txId || `TXN-CRASH-01-${Date.now().toString().slice(-4)}-${Math.random().toString(36).substring(2, 5).toUpperCase()}`;
      const idempotencyKey = params?.idempotencyKey || `IDEMP-CRASH-01-${Date.now()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

      if (isRetry && params?.idempotencyKey) {
        const existingTx = getTransactionByIdempotencyKey(params.idempotencyKey, database);
        if (existingTx && (existingTx.state === 'OUTCOME_UNKNOWN' || existingTx.state === 'PENDING_VERIFICATION')) {
          addLog('Retry Blocked', 'Payment outcome is unknown. Please use Smart Reconcile before attempting another payment.');
          const err = new Error('Payment outcome is unknown. Please use Smart Reconcile before attempting another payment.');
          err.status = 409;
          err.code = 'RETRY_BLOCKED_OUTCOME_UNKNOWN';
          err.details = {
            state: existingTx.state,
            safeToRetry: false,
            transactionId: existingTx.id,
            recommendedAction: 'Payment outcome is unknown. Please use Smart Reconcile before attempting another payment.',
          };
          throw err;
        }
      }

      if (isRetry) {
        addLog('Retry Attempt', `Client attempting retry with key: ${idempotencyKey}`);
      }

      const txn = createTransaction({
        id: txId,
        idempotencyKey,
        amount: 650.00,
        currency: 'INR',
        sender: 'user-ananya@okaxis',
        recipient: 'merchant-terminal@kotak',
        recipientName: 'Crash Lab Test Merchant',
        category: 'Crash Simulation',
        channel: 'CRASH_SIMULATION',
        state: TRANSACTION_STATES.OUTCOME_UNKNOWN,
        confidenceScore: 30,
        isSimulation: true,
        safeToRetry: false,
        needsReconciliation: true,
        userExplanation: 'Network dropped during payment transmission. Outcome is unknown.',
        technicalDiagnosis: 'Packet drop on egress. Retrying locked by idempotency engine.',
        logs: [
          { timestamp: new Date().toISOString(), event: 'CRASH_SIMULATION_DROP', detail: 'Socket severed during bank transmission.' }
        ]
      }, database);

      if (txn._isExisting) {
        addLog('Idempotent Catch', `Duplicate debit prevented! Retaining existing record ${txn.id} in state ${txn.state}`);
      }

      addLog('Hold', 'PayBastion marks OUTCOME_UNKNOWN; locks retry button to prevent double-charging');
      addLog('Audit', `Transaction ${txn.id} recorded in persistent ledger with idempotency lock`);

      return {
        scenarioId,
        title: 'Network Failure During Payment',
        resultState: TRANSACTION_STATES.OUTCOME_UNKNOWN,
        isSimulation: true,
        isExisting: Boolean(txn._isExisting),
        logs,
        transaction: txn,
        message: 'Transaction held in OUTCOME_UNKNOWN. Safe retry locked until status inquiry completes.',
      };
    }

    case 'SCENARIO_2_TIMEOUT_ACK': {
      addLog('Debit', 'User transfers ₹1,200 to Metro Supermarket; bank debits account');
      addLog('Timeout', 'Gateway response webhook times out (504 Gateway Timeout)');

      const txId = params?.txId || `TXN-CRASH-02-${Date.now().toString().slice(-4)}-${Math.random().toString(36).substring(2, 5).toUpperCase()}`;
      const idempotencyKey = params?.idempotencyKey || `IDEMP-CRASH-02-${Date.now()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

      // Register initial in-flight transaction
      registerRecoveryTransaction({
        idempotencyKey,
        amount: 1200.00,
        recipient: 'metro-supermarket@icici',
        recipientName: 'Metro Supermarket',
        sender: 'user-ananya@okaxis',
        channel: 'UPI_ONLINE',
        state: TRANSACTION_STATES.PENDING_VERIFICATION,
      }, database);

      addLog('Inquiry', 'Smart Recovery initiates non-debit status inquiry with clearinghouse');

      // Reconcile with simulated provider confirmation
      const reconciliation = await reconcileRecoveryTransaction({
        idempotencyKey,
        simulatedOutcome: 'SUCCESS',
      }, database);

      addLog('Reconcile', `Clearinghouse confirms UTR-${Date.now().toString().slice(-8)}. Updated to CONFIRMED. ZERO duplicate debit!`);

      return {
        scenarioId,
        title: 'Payment Succeeds but ACK Times Out',
        resultState: TRANSACTION_STATES.CONFIRMED,
        isSimulation: true,
        logs,
        transaction: reconciliation.transaction,
        reconciliationResult: reconciliation.reconciliationResult,
        message: 'Original transaction verified and confirmed without duplicate debit.',
      };
    }

    case 'SCENARIO_3_REPLAY_ATTACK': {
      addLog('Issue', 'Creating valid signed offline payment passport for ₹350');

      // 1. Create a real offline passport
      const passport = createAndSignOfflinePassport({
        amount: 350.00,
        recipientId: 'metro-transit-kiosk@axis',
        recipientName: 'Metro Transit Kiosk',
        senderId: 'user-ananya@paybastion',
        expiryMinutes: 15,
      }, database);

      addLog('First Scan', `Offline token (Nonce: ${passport.nonce.substring(0, 12)}...) submitted and accepted`);
      const firstScanResult = verifyOfflinePassport(passport, database);

      addLog('Second Scan', 'Malicious actor submits identical token a second time to merchant terminal');
      const secondScanResult = verifyOfflinePassport(passport, database);

      addLog('Nonce Match', 'Persistent SQLite non-repudiation registry flags duplicate nonce');
      addLog('Hard Reject', `Terminal hard-rejects: ${secondScanResult.code}`);

      return {
        scenarioId,
        title: 'Offline Authorization is Reused (Replay Attack)',
        resultState: secondScanResult.code,
        isSimulation: true,
        logs,
        firstScan: firstScanResult,
        secondScan: secondScanResult,
        replayBlocked: !secondScanResult.valid,
        message: 'Persistent nonce tracking successfully blocked replay double-spending attack.',
      };
    }

    case 'SCENARIO_4_EXPIRED_AUTH': {
      addLog('Issue', 'Creating offline token with validity window in the past');

      // Create an expired payload
      const expiredPayload = {
        authId: `AUTH-EXPIRED-${Date.now().toString(36).toUpperCase()}`,
        senderId: 'user-ananya@paybastion',
        recipientId: 'kiosk-express@axis',
        recipientName: 'Kiosk Express',
        amount: 450.00,
        currency: 'INR',
        nonce: `nonce-exp-${Date.now()}`,
        createdAt: new Date(Date.now() - 30 * 60000).toISOString(),
        expiresAt: new Date(Date.now() - 15 * 60000).toISOString(), // expired 15m ago
        signature: 'd9e8f172a6c8b0918237192837bc901a88291029381726a8',
      };

      addLog('Verify', 'Merchant terminal scanner validates TTL boundary against RTC clock');
      const scanResult = verifyOfflinePassport(expiredPayload, database);

      addLog('Reject', `Verification failed: ${scanResult.message}`);

      return {
        scenarioId,
        title: 'Authorization Token Expires',
        resultState: scanResult.code,
        isSimulation: true,
        logs,
        scanResult,
        expiredBlocked: !scanResult.valid,
        message: 'Expired offline authorization token declined by merchant terminal.',
      };
    }

    case 'SCENARIO_5_SUSPICIOUS_SCAM': {
      addLog('Scan', 'User scans QR claiming "Instant Electricity Bill Refund"');

      const suspiciousQR = 'upi://pay?pa=electricity-bill-refund@okaxis&pn=Power_Dept_Support&am=4999&mode=02&tr=REF9921';
      addLog('Parse', 'Guardian parses payload parameters (reverse collect mode=02 & impersonation handle)');

      const analysis = analyzeScamRisk({
        recipient: 'electricity-bill-refund@okaxis',
        amount: 4999.00,
        rawPayload: suspiciousQR,
        recentAttemptsCount: 1,
      });

      addLog('Block', `Risk level ${analysis.riskLevel} (Score: ${analysis.riskScore}/100). Payment paused.`);

      // Persist flagged transaction in database
      const txId = params?.txId || `TXN-CRASH-05-${Date.now().toString().slice(-4)}-${Math.random().toString(36).substring(2, 5).toUpperCase()}`;
      const idempotencyKey = params?.idempotencyKey || `IDEMP-CRASH-05-${Date.now()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
      const txn = createTransaction({
        id: txId,
        idempotencyKey,
        amount: 4999.00,
        currency: 'INR',
        sender: 'user-ananya@okaxis',
        recipient: 'electricity-bill-refund@okaxis',
        recipientName: 'Power Dept Support Desk',
        category: 'Utilities Phishing',
        channel: 'UPI_ONLINE',
        state: TRANSACTION_STATES.NEEDS_REVIEW,
        confidenceScore: 12,
        isSimulation: true,
        safeToRetry: false,
        scamAlert: analysis.primaryAlert,
        userExplanation: 'Scam Guardian flagged this transaction as a high-risk phishing reverse collect request.',
        technicalDiagnosis: 'Detected reverse debit parameters (mode=02) and spoofed utility VPA handle.',
        logs: [
          { timestamp: new Date().toISOString(), event: 'SCAM_GUARDIAN_INTERCEPT', detail: analysis.primaryAlert.signal }
        ]
      }, database);

      addLog('Explain', `AI presents explainable 3-part diagnosis: Signal, Reason, Recommended Action`);

      return {
        scenarioId,
        title: 'Suspicious Transaction / Scam Detected',
        resultState: TRANSACTION_STATES.NEEDS_REVIEW,
        isSimulation: true,
        logs,
        transaction: txn,
        analysis,
        message: 'Scam Guardian intercepted fraudulent reverse-collect QR code before funds committed.',
      };
    }

    case 'SCENARIO_6_CREDIT_FALLBACK': {
      const profile = getCreditProfile('CUST-IN-89210', database);
      const available = profile ? profile.availableCredit : 0;

      // Determine test amount:
      // If caller explicitly specifies amount (e.g. testing insufficient credit with ₹450), use it.
      // Otherwise default to an amount within the user's available simulated credit limit.
      let testAmount;
      if (params?.amount !== undefined) {
        testAmount = parseFloat(params.amount);
      } else {
        // Standard emergency prescription test: ₹250.00 if within available credit,
        // or an amount within remaining available balance.
        if (available >= 250) {
          testAmount = 250.00;
        } else if (available > 0) {
          testAmount = Math.max(10.00, Math.floor(available * 0.5));
        } else {
          testAmount = 250.00;
        }
      }

      addLog('Outage', `Bank switches report HTTP 500 downtime during pharmacy prescription payment (₹${testAmount.toFixed(2)})`);
      addLog('Offer', 'Credit Bridge detects critical medical purchase; prompts simulated fallback');
      addLog('Consent', 'User grants explicit simulation consent');

      const creditResult = activateCreditBridge({
        userId: 'CUST-IN-89210',
        amount: testAmount,
        recipient: 'emergency-pharmacy@axis',
        recipientName: 'Apollo Emergency Pharmacy',
        targetTxnId: `TXN-OUTAGE-${Date.now()}`,
        consentGiven: true,
      }, database);

      addLog('Disburse', `Simulated credit pool disbursed ₹${testAmount.toFixed(2)} to merchant under loan ${creditResult.bridgeLoanId}`);
      addLog('Schedule', `7-day zero-interest repayment scheduled for ${creditResult.installment.dueDate}`);

      return {
        scenarioId,
        title: 'Credit Fallback is Activated (Simulation)',
        resultState: 'CREDIT_FALLBACK_DISBURSED',
        isSimulation: true,
        logs,
        creditResult,
        transaction: creditResult.transaction,
        message: 'Simulated Temporary Credit Bridge successfully disbursed emergency buffer.',
      };
    }

    default:
      throw new Error(`Unknown scenario ID: ${scenarioId}`);
  }
}
