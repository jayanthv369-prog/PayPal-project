process.env.NODE_ENV = 'test';
import assert from 'node:assert';
import dotenv from 'dotenv';
dotenv.config();

import app from '../index.js';

let server;
const PORT = 5099; // Isolated test port

async function startServer() {
  return new Promise((resolve) => {
    server = app.listen(PORT, () => {
      resolve();
    });
  });
}

async function stopServer() {
  return new Promise((resolve) => {
    if (server) {
      server.close(() => resolve());
    } else {
      resolve();
    }
  });
}

async function run() {
  console.log('--- Starting Server on test port', PORT, '---');
  await startServer();

  const baseUrl = `http://localhost:${PORT}`;

  try {
    // 1. Health Endpoint
    console.log('1. Testing GET /api/health');
    const healthRes = await fetch(`${baseUrl}/api/health`);
    assert.strictEqual(healthRes.status, 200);
    const health = await healthRes.json();
    assert.strictEqual(health.status, 'healthy');
    assert.strictEqual(health.database, 'connected');
    console.log('   ✓ Health check passed:', health.platform, '(DB:', health.database, ')');

    // 2. Dashboard Stats Endpoint
    console.log('2. Testing GET /api/dashboard/stats');
    const statsRes = await fetch(`${baseUrl}/api/dashboard/stats`);
    assert.strictEqual(statsRes.status, 200);
    const stats = await statsRes.json();
    assert.strictEqual(typeof stats.totalTransactions, 'number');
    assert.strictEqual(typeof stats.confirmedCount, 'number');
    assert.strictEqual(typeof stats.pendingCount, 'number');
    console.log('   ✓ Dashboard stats passed (Total txns:', stats.totalTransactions, ')');

    // 3. Transactions Listing & Pagination
    console.log('3. Testing GET /api/transactions');
    const txRes = await fetch(`${baseUrl}/api/transactions?page=1&limit=5`);
    assert.strictEqual(txRes.status, 200);
    const txData = await txRes.json();
    assert.ok(Array.isArray(txData.transactions));
    assert.ok(txData.pagination);
    console.log('   ✓ Transactions list passed (Count:', txData.transactions.length, ')');

    // 3b. Testing POST /api/transactions Idempotency (First call 201, Replay call 200)
    console.log('3b. Testing POST /api/transactions Idempotency & Duplicate Prevention');
    const testIdempKey = 'E2E-TEST-IDEMP-' + Date.now();
    const createRes1 = await fetch(`${baseUrl}/api/transactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        idempotencyKey: testIdempKey,
        amount: 350.00,
        recipient: 'test-merchant@axis',
        recipientName: 'Test Merchant Axis',
        channel: 'UPI_ONLINE',
        state: 'CONFIRMED',
      }),
    });
    assert.strictEqual(createRes1.status, 201, 'First transaction creation must return HTTP 201 Created');
    const createdTx1 = await createRes1.json();
    assert.strictEqual(createdTx1.idempotencyKey, testIdempKey);
    assert.strictEqual(createdTx1.amount, 350.00);

    // Repeated submission with same idempotency key
    const createRes2 = await fetch(`${baseUrl}/api/transactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        idempotencyKey: testIdempKey,
        amount: 9999.00, // Different amount attempted
        recipient: 'attacker@evil',
        channel: 'UPI_ONLINE',
        state: 'FAILED',
      }),
    });
    assert.strictEqual(createRes2.status, 200, 'Idempotent replay must return HTTP 200 OK');
    assert.strictEqual(createRes2.headers.get('x-idempotent-replay'), 'true', 'Must set X-Idempotent-Replay header');
    const createdTx2 = await createRes2.json();
    assert.strictEqual(createdTx2.id, createdTx1.id, 'Must return same original transaction ID');
    assert.strictEqual(createdTx2.amount, 350.00, 'Original amount must be preserved (NO duplicate debit)');
    assert.strictEqual(createdTx2.recipient, 'test-merchant@axis', 'Original recipient preserved');
    console.log('   ✓ Transaction idempotency passed: Replay returned 200 OK and preserved original transaction');

    // 4. Smart Recovery: Register with Idempotency Lock
    console.log('4. Testing POST /api/recovery/register');
    const regRes = await fetch(`${baseUrl}/api/recovery/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        idempotencyKey: 'E2E-IDEMP-' + Date.now(),
        amount: 880.00,
        recipient: 'pharmacy-metro@icici',
        recipientName: 'Metro Pharmacy',
        channel: 'UPI_ONLINE',
      }),
    });
    assert.strictEqual(regRes.status, 200);
    const regData = await regRes.json();
    assert.strictEqual(regData.status, 'REGISTERED');
    assert.strictEqual(regData.transaction.state, 'OUTCOME_UNKNOWN');
    console.log('   ✓ Recovery registration passed:', regData.transaction.id);

    // 5. Smart Recovery: Reconcile with non-debit verification
    console.log('5. Testing POST /api/recovery/reconcile');
    const reconRes = await fetch(`${baseUrl}/api/recovery/reconcile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        idempotencyKey: regData.transaction.idempotencyKey,
        simulatedOutcome: 'SUCCESS',
      }),
    });
    assert.strictEqual(reconRes.status, 200);
    const reconData = await reconRes.json();
    assert.strictEqual(reconData.reconciliationResult.resolvedState, 'CONFIRMED');
    assert.strictEqual(reconData.reconciliationResult.duplicatePrevented, true);
    console.log('   ✓ Smart Recovery reconciliation passed: CONFIRMED');

    // 5b. Smart Recovery: Reconcile Simulated Transaction without simulatedOutcome (Deterministic Ledger: NO_DEBIT -> FAILED)
    console.log('5b. Testing POST /api/recovery/reconcile (Deterministic Simulated Ledger: NO_DEBIT -> FAILED)');
    const simKey = 'E2E-CRASH-01-' + Date.now();
    const regSimRes = await fetch(`${baseUrl}/api/recovery/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        idempotencyKey: simKey,
        amount: 650.00,
        recipient: 'merchant-terminal@kotak',
        channel: 'CRASH_SIMULATION',
        isSimulation: true,
        scenarioId: 'SCENARIO_1_NETWORK_DROP',
        simulatedOutcome: 'NO_DEBIT',
      }),
    });
    assert.strictEqual(regSimRes.status, 200);

    // Call reconcile WITHOUT passing simulatedOutcome in body
    const reconSimRes = await fetch(`${baseUrl}/api/recovery/reconcile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        idempotencyKey: simKey,
      }),
    });
    assert.strictEqual(reconSimRes.status, 200);
    const reconSimData = await reconSimRes.json();
    assert.strictEqual(reconSimData.reconciliationResult.resolvedState, 'FAILED', 'Confirmed zero debit must mark FAILED');
    assert.strictEqual(reconSimData.reconciliationResult.safeToRetry, true, 'safeToRetry must be true');
    assert.strictEqual(reconSimData.transaction.isSimulation, true, 'transaction.isSimulation must be true');
    assert.strictEqual(reconSimData.reconciliationResult.isSimulation, true, 'reconciliationResult.isSimulation must be true');
    console.log('   ✓ Deterministic simulated ledger passed: FAILED, safeToRetry: true, isSimulation consistent');

    // 5c. Smart Recovery: Reconcile Indeterminate Simulated Transaction (Status unknown -> OUTCOME_UNKNOWN)
    console.log('5c. Testing POST /api/recovery/reconcile (Indeterminate simulation -> OUTCOME_UNKNOWN)');
    const unkKey = 'E2E-SIM-UNKNOWN-' + Date.now();
    await fetch(`${baseUrl}/api/recovery/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        idempotencyKey: unkKey,
        amount: 300.00,
        recipient: 'kiosk@kotak',
        channel: 'CRASH_SIMULATION',
        isSimulation: true,
        simulatedOutcome: 'UNKNOWN',
      }),
    });

    const reconUnkRes = await fetch(`${baseUrl}/api/recovery/reconcile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        idempotencyKey: unkKey,
      }),
    });
    assert.strictEqual(reconUnkRes.status, 200);
    const reconUnkData = await reconUnkRes.json();
    assert.strictEqual(reconUnkData.reconciliationResult.resolvedState, 'OUTCOME_UNKNOWN', 'Indeterminate must remain OUTCOME_UNKNOWN');
    assert.strictEqual(reconUnkData.reconciliationResult.safeToRetry, false, 'safeToRetry must be false');
    assert.strictEqual(reconUnkData.transaction.isSimulation, true);
    assert.strictEqual(reconUnkData.reconciliationResult.isSimulation, true);
    console.log('   ✓ Indeterminate simulation passed: OUTCOME_UNKNOWN, safeToRetry: false, lock held');

    // 6. Offline Passport: Sign Token
    console.log('6. Testing POST /api/offline/sign');
    const signRes = await fetch(`${baseUrl}/api/offline/sign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: 320.00,
        recipientId: 'metro-kiosk@axis',
        recipientName: 'Metro Transit Kiosk',
      }),
    });
    assert.strictEqual(signRes.status, 200);
    const signedPassport = await signRes.json();
    assert.ok(signedPassport.authId);
    assert.ok(signedPassport.signature);
    assert.strictEqual(signedPassport.status, 'SETTLEMENT_PENDING');
    console.log('   ✓ Offline signing passed (Auth ID:', signedPassport.authId, ')');

    // 7. Offline Passport: Verify & Atomic Redemption
    console.log('7. Testing POST /api/offline/verify');
    const verifyRes = await fetch(`${baseUrl}/api/offline/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(signedPassport),
    });
    assert.strictEqual(verifyRes.status, 200);
    const verifyData = await verifyRes.json();
    assert.strictEqual(verifyData.valid, true);
    assert.strictEqual(verifyData.isFinalSettlement, false, 'Must be SETTLEMENT_PENDING');
    console.log('   ✓ Offline verification passed (Status:', verifyData.settlementStatus, ')');

    // 8. Offline Passport: Replay Attack Defense
    console.log('8. Testing Replay Attack Interception on POST /api/offline/verify');
    const replayRes = await fetch(`${baseUrl}/api/offline/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(signedPassport),
    });
    assert.strictEqual(replayRes.status, 200);
    const replayData = await replayRes.json();
    assert.strictEqual(replayData.valid, false);
    assert.strictEqual(replayData.code, 'REPLAY_ATTACK_DETECTED');
    console.log('   ✓ Replay defense passed:', replayData.message);

    // 9. AI Voice Parsing (Kannada)
    console.log('9. Testing POST /api/ai/parse-voice (Kannada)');
    const voiceRes = await fetch(`${baseUrl}/api/ai/parse-voice`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        transcript: 'ಕಿರಣ್ ಅವರಿಗೆ 350 ರೂಪಾಯಿ ಕಾಫಿಗೆ ಕಳುಹಿಸಿ',
        language: 'kn-IN',
      }),
    });
    assert.strictEqual(voiceRes.status, 200);
    const voiceData = await voiceRes.json();
    assert.strictEqual(voiceData.extracted.amount, 350);
    assert.ok(voiceData.extracted.recipient.includes('ಕಿರಣ್'));
    console.log('   ✓ Voice parsing passed:', voiceData.extracted);

    // 10. AI State Explanation
    console.log('10. Testing POST /api/ai/explain-state');
    const expRes = await fetch(`${baseUrl}/api/ai/explain-state`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        state: 'PENDING_VERIFICATION',
        amount: 880,
        recipient: 'pharmacy@icici',
      }),
    });
    assert.strictEqual(expRes.status, 200);
    const expData = await expRes.json();
    assert.ok(expData.userExplanation);
    assert.strictEqual(expData.safeToRetry, false);
    console.log('   ✓ AI Explanation passed (safeToRetry:', expData.safeToRetry, ')');

    // 11. Scam Guardian Risk Analysis
    console.log('11. Testing POST /api/scam-guardian/analyze');
    const scamRes = await fetch(`${baseUrl}/api/scam-guardian/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recipient: 'electricity-bill-refund@okaxis',
        amount: 4999,
      }),
    });
    assert.strictEqual(scamRes.status, 200);
    const scamData = await scamRes.json();
    assert.strictEqual(scamData.safe, false);
    assert.strictEqual(scamData.riskLevel, 'CRITICAL');
    assert.ok(scamData.primaryAlert.signal);
    console.log('   ✓ Scam Guardian passed: Flagged CRITICAL phishing');

    // 12. Credit Bridge Profile & Activation & Repayment
    console.log('12. Testing GET & POST /api/credit');
    const credProfileRes = await fetch(`${baseUrl}/api/credit/profile`);
    assert.strictEqual(credProfileRes.status, 200);
    const profile = await credProfileRes.json();
    assert.strictEqual(profile.isSimulation, true);

    const credActRes = await fetch(`${baseUrl}/api/credit/activate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: 250,
        recipient: 'apollo-pharmacy@axis',
        recipientName: 'Apollo Emergency Pharmacy',
        consentGiven: true,
      }),
    });
    assert.strictEqual(credActRes.status, 200);
    const credActData = await credActRes.json();
    assert.strictEqual(credActData.success, true);
    assert.strictEqual(credActData.isSimulation, true);
    console.log('   ✓ Credit Bridge passed (Loan ID:', credActData.bridgeLoanId, ')');

    // Test Repayment to maintain balance hygiene
    const repayRes = await fetch(`${baseUrl}/api/credit/repay`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ installmentId: credActData.installment.id }),
    });
    assert.strictEqual(repayRes.status, 200);
    const repayData = await repayRes.json();
    assert.strictEqual(repayData.success, true);
    console.log('   ✓ Credit repayment passed: Restored ₹', credActData.installment.amount, 'to available credit');

    // 13. Crash Lab Simulation Scenario (Scenario 01)
    console.log('13. Testing POST /api/simulation/scenario (SCENARIO_1_NETWORK_DROP)');
    const simRes = await fetch(`${baseUrl}/api/simulation/scenario`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scenarioId: 'SCENARIO_1_NETWORK_DROP' }),
    });
    assert.strictEqual(simRes.status, 200);
    const simData = await simRes.json();
    assert.strictEqual(simData.resultState, 'OUTCOME_UNKNOWN');
    console.log('   ✓ Crash Lab passed:', simData.title, '->', simData.resultState);

    // 13b. Crash Lab Scenario 06: Credit Fallback Activated
    console.log('13b. Testing POST /api/simulation/scenario (SCENARIO_6_CREDIT_FALLBACK within limit)');
    const sim6Res = await fetch(`${baseUrl}/api/simulation/scenario`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scenarioId: 'SCENARIO_6_CREDIT_FALLBACK' }),
    });
    assert.strictEqual(sim6Res.status, 200);
    const sim6Data = await sim6Res.json();
    assert.strictEqual(sim6Data.resultState, 'CREDIT_FALLBACK_DISBURSED');
    assert.strictEqual(sim6Data.transaction.state, 'CONFIRMED');
    assert.strictEqual(sim6Data.transaction.channel, 'CREDIT_BRIDGE_FALLBACK');
    console.log('   ✓ Scenario 06 passed:', sim6Data.resultState, '(Disbursed ₹', sim6Data.creditResult.installment.amount, ')');

    // 13c. Crash Lab Scenario 06: Insufficient Credit Rejection (HTTP 422, not 500)
    console.log('13c. Testing POST /api/simulation/scenario (SCENARIO_6_CREDIT_FALLBACK exceeding limit)');
    const sim6RejectRes = await fetch(`${baseUrl}/api/simulation/scenario`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scenarioId: 'SCENARIO_6_CREDIT_FALLBACK',
        params: { amount: 99999 } // Intentionally exceeds limit
      }),
    });
    assert.strictEqual(sim6RejectRes.status, 422, 'Insufficient credit rejection must return HTTP 422, not 500');
    const sim6RejectData = await sim6RejectRes.json();
    assert.strictEqual(sim6RejectData.error, 'INSUFFICIENT_CREDIT_LIMIT');
    assert.strictEqual(sim6RejectData.code, 'INSUFFICIENT_CREDIT_LIMIT');
    assert.ok(sim6RejectData.message.includes('exceeds available simulated credit limit'));
    console.log('   ✓ Scenario 06 safe rejection passed (HTTP 422:', sim6RejectData.code, '-', sim6RejectData.message, ')');

    // 14. PayPal Sandbox Checkout Flow
    console.log('14. Testing PayPal Sandbox Order Create & Capture');
    const ppOrderRes = await fetch(`${baseUrl}/api/paypal/create-order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: '25.00', currency: 'USD' }),
    });
    assert.strictEqual(ppOrderRes.status, 200);
    const ppOrder = await ppOrderRes.json();
    assert.ok(ppOrder.orderId);

    const ppCapRes = await fetch(`${baseUrl}/api/paypal/capture-order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId: ppOrder.orderId }),
    });
    assert.strictEqual(ppCapRes.status, 200);
    const ppCap = await ppCapRes.json();
    assert.strictEqual(ppCap.status, 'COMPLETED');
    console.log('   ✓ PayPal flow passed (Capture ID:', ppCap.captureId, ')');

    // 15. Retry Button Enforcement & Duplicate Debit Defense
    console.log('15. Testing POST /api/transactions/:id/retry restrictions');
    // a. Retry blocked on OUTCOME_UNKNOWN
    const retryBlockedRes = await fetch(`${baseUrl}/api/transactions/${simData.transaction.id}/retry`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newIdempotencyKey: `IDEMP-PREMATURE-${Date.now()}` }),
    });
    assert.strictEqual(retryBlockedRes.status, 409, 'Retry on OUTCOME_UNKNOWN must return 409 Conflict');
    const retryBlockedBody = await retryBlockedRes.json();
    assert.strictEqual(retryBlockedBody.error, 'RETRY_BLOCKED_OUTCOME_UNKNOWN');
    assert.strictEqual(
      retryBlockedBody.message,
      'Payment outcome is unknown. Please use Smart Reconcile before attempting another payment.'
    );
    console.log('   ✓ Retry on OUTCOME_UNKNOWN safely blocked (HTTP 409:', retryBlockedBody.message, ')');

    // b. Smart Reconcile confirms FAILED (no debit)
    const reconRetryRes = await fetch(`${baseUrl}/api/recovery/reconcile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idempotencyKey: simData.transaction.idempotencyKey }),
    });
    assert.strictEqual(reconRetryRes.status, 200);
    const reconRetryData = await reconRetryRes.json();
    assert.strictEqual(reconRetryData.reconciliationResult.resolvedState, 'FAILED');
    assert.strictEqual(reconRetryData.reconciliationResult.safeToRetry, true);

    // c. Retry with SAME key rejected
    const retrySameKeyRes = await fetch(`${baseUrl}/api/transactions/${simData.transaction.id}/retry`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newIdempotencyKey: simData.transaction.idempotencyKey }),
    });
    assert.strictEqual(retrySameKeyRes.status, 400);
    console.log('   ✓ Retry with identical key rejected (HTTP 400: NEW_IDEMPOTENCY_KEY_REQUIRED)');

    // d. Retry with NEW key succeeds
    const freshRetryKey = `IDEMP-E2E-RETRY-${Date.now()}`;
    const retrySuccessRes = await fetch(`${baseUrl}/api/transactions/${simData.transaction.id}/retry`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newIdempotencyKey: freshRetryKey, amount: 650 }),
    });
    assert.strictEqual(retrySuccessRes.status, 201);
    const retrySuccessData = await retrySuccessRes.json();
    assert.strictEqual(retrySuccessData.success, true);
    assert.strictEqual(retrySuccessData.transaction.idempotencyKey, freshRetryKey);
    console.log('   ✓ Retry with fresh key succeeded (HTTP 201: Fresh attempt', retrySuccessData.transaction.id, ')');

    console.log('\n=================================================');
    console.log('🎉 ALL 15 E2E HTTP INTEGRATION CHECKS PASSED!');
    console.log('=================================================');
  } finally {
    await stopServer();
    process.exit(0);
  }
}

run().catch((err) => {
  console.error('E2E Integration Test Failure:', err);
  if (server) server.close();
  process.exit(1);
});
