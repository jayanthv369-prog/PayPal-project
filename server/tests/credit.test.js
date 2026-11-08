import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import Database from 'better-sqlite3';
import { initializeDatabase } from '../database/init.js';
import {
  getCreditProfile,
  activateCreditBridge,
  repayCreditInstallment,
  getCreditTransactions,
} from '../services/creditService.js';
import { runCrashLabScenario } from '../services/simulationService.js';

describe('TEMPORARY CREDIT BRIDGE (SIMULATION) TESTS', () => {
  let db;

  beforeEach(() => {
    db = new Database(':memory:');
    initializeDatabase(db);
  });

  it('retrieves simulated credit profile and demonstrates disclaimer', () => {
    const profile = getCreditProfile('CUST-IN-89210', db);
    assert.ok(profile);
    assert.strictEqual(profile.userName, 'Ananya Sharma');
    assert.strictEqual(profile.isSimulation, true);
    assert.ok(profile.disclaimer.includes('DEMONSTRATION ONLY'));
    assert.strictEqual(typeof profile.creditLimit, 'number');
    assert.strictEqual(typeof profile.availableCredit, 'number');
    assert.ok(Array.isArray(profile.repaymentSchedule));
  });

  it('requires explicit user consent before activating credit buffer', () => {
    assert.throws(() => {
      activateCreditBridge({
        amount: 500,
        consentGiven: false, // User did not check consent box
      }, db);
    }, (err) => {
      assert.strictEqual(err.status, 400);
      assert.strictEqual(err.code, 'CONSENT_REQUIRED');
      return true;
    });
  });

  it('activates simulated emergency credit and schedules 7-day installment', () => {
    const initialProfile = getCreditProfile('CUST-IN-89210', db);
    const initialAvailable = initialProfile.availableCredit;

    const result = activateCreditBridge({
      amount: 250.00,
      recipient: 'apollo-pharmacy@axis',
      recipientName: 'Apollo Emergency Pharmacy',
      consentGiven: true,
      targetTxnId: 'TXN-OUTAGE-MED-01',
    }, db);

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.isSimulation, true);
    assert.ok(result.bridgeLoanId);
    assert.ok(result.installment);
    assert.strictEqual(result.installment.amount, 250.00);
    assert.ok(result.installment.dueDate);

    // Profile balances must be updated
    const updatedProfile = getCreditProfile('CUST-IN-89210', db);
    assert.strictEqual(updatedProfile.availableCredit, initialAvailable - 250.00);
    assert.strictEqual(updatedProfile.utilizedCredit, initialProfile.utilizedCredit + 250.00);
  });

  it('rejects credit request exceeding available simulated balance with HTTP 422 and INSUFFICIENT_CREDIT_LIMIT', () => {
    const profile = getCreditProfile('CUST-IN-89210', db);
    const excessAmount = profile.availableCredit + 5000;

    assert.throws(() => {
      activateCreditBridge({
        amount: excessAmount,
        consentGiven: true,
      }, db);
    }, (err) => {
      assert.strictEqual(err.status, 422, 'Must return HTTP 422 Unprocessable Entity, not 500');
      assert.strictEqual(err.code, 'INSUFFICIENT_CREDIT_LIMIT');
      assert.ok(err.message.includes(`exceeds available simulated credit limit of ₹${profile.availableCredit}`));
      assert.strictEqual(err.details.requestedAmount, excessAmount);
      assert.strictEqual(err.details.availableCredit, profile.availableCredit);
      return true;
    });

    // Balances must remain unchanged
    const profileAfter = getCreditProfile('CUST-IN-89210', db);
    assert.strictEqual(profileAfter.availableCredit, profile.availableCredit);
    assert.strictEqual(profileAfter.utilizedCredit, profile.utilizedCredit);
  });

  it('prevents duplicate activation via idempotency key', () => {
    const idempKey = 'IDEMP-CREDIT-ONCE-ONLY';

    const res1 = activateCreditBridge({
      amount: 200,
      consentGiven: true,
      idempotencyKey: idempKey,
    }, db);
    assert.strictEqual(res1.success, true);

    const res2 = activateCreditBridge({
      amount: 200,
      consentGiven: true,
      idempotencyKey: idempKey,
    }, db);
    assert.strictEqual(res2.success, true);
    assert.strictEqual(res2.duplicatePrevented, true);
  });

  it('allows repaying simulated credit installments', () => {
    const profileBefore = getCreditProfile('CUST-IN-89210', db);
    const initialUtilized = profileBefore.utilizedCredit;
    const installment = profileBefore.repaymentSchedule.find(i => i.status === 'PENDING');
    assert.ok(installment);

    const repayResult = repayCreditInstallment({
      installmentId: installment.id,
    }, db);

    assert.strictEqual(repayResult.success, true);
    assert.strictEqual(repayResult.creditProfile.utilizedCredit, initialUtilized - installment.amount);
  });

  // Scenario 06: Successful execution within available credit limit
  it('Scenario 06: successfully activates credit fallback within available credit producing CREDIT_FALLBACK_DISBURSED', async () => {
    const profileBefore = getCreditProfile('CUST-IN-89210', db);
    const available = profileBefore.availableCredit;

    const result = await runCrashLabScenario('SCENARIO_6_CREDIT_FALLBACK', {}, db);

    assert.strictEqual(result.scenarioId, 'SCENARIO_6_CREDIT_FALLBACK');
    assert.strictEqual(result.resultState, 'CREDIT_FALLBACK_DISBURSED');
    assert.strictEqual(result.isSimulation, true);
    assert.ok(result.creditResult.success);
    assert.strictEqual(result.transaction.state, 'CONFIRMED');
    assert.strictEqual(result.transaction.channel, 'CREDIT_BRIDGE_FALLBACK');

    // Verify audit log has CREDIT_BRIDGE_DISBURSED
    const auditLogs = db.prepare(`
      SELECT * FROM audit_logs
      WHERE entity_id = ? AND event = 'CREDIT_BRIDGE_DISBURSED'
    `).all(result.transaction.id);
    assert.ok(auditLogs.length > 0);

    // Profile balances updated safely
    const profileAfter = getCreditProfile('CUST-IN-89210', db);
    assert.strictEqual(profileAfter.availableCredit, available - result.creditResult.installment.amount);
  });

  // Scenario 06: Rejection when requested amount exceeds available credit
  it('Scenario 06: safely rejects insufficient credit with HTTP 422 without corrupting database', async () => {
    const profileBefore = getCreditProfile('CUST-IN-89210', db);
    const excessiveAmount = profileBefore.availableCredit + 500;

    await assert.rejects(
      async () => {
        await runCrashLabScenario('SCENARIO_6_CREDIT_FALLBACK', { amount: excessiveAmount }, db);
      },
      (err) => {
        assert.strictEqual(err.status, 422, 'Expected business-rule rejection must return HTTP 422, not 500');
        assert.strictEqual(err.code, 'INSUFFICIENT_CREDIT_LIMIT');
        assert.ok(err.message.includes('exceeds available simulated credit limit'));
        return true;
      }
    );

    // Confirm balance remains unchanged
    const profileAfter = getCreditProfile('CUST-IN-89210', db);
    assert.strictEqual(profileAfter.availableCredit, profileBefore.availableCredit);
    assert.strictEqual(profileAfter.utilizedCredit, profileBefore.utilizedCredit);
  });
});
