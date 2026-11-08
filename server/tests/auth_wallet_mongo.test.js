import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import request from 'supertest';
import mongoose from 'mongoose';
import app from '../index.js';
import { connectDB, disconnectDB } from '../config/database.js';
import { User } from '../models/User.js';
import { Wallet } from '../models/Wallet.js';
import { Transaction } from '../models/Transaction.js';
import { OfflinePassport } from '../models/OfflinePassport.js';
import { ReconciliationLog } from '../models/ReconciliationLog.js';
import { AuditLog } from '../models/AuditLog.js';
import { ScamAnalysis } from '../models/ScamAnalysis.js';
import { MockPaymentProvider, PayPalPaymentProvider, getProvider } from '../services/providers/PaymentProvider.js';

describe('PAYBASTION COMPLETE BACKEND & MONGODB INTEGRATION TESTS', () => {
  before(async () => {
    process.env.USE_MEMORY_DB = 'true';
    await connectDB();
  });

  after(async () => {
    await disconnectDB();
  });

  // ==========================================
  // 1. AUTHENTICATION TESTS
  // ==========================================
  describe('AUTHENTICATION & JWT SUITE', () => {
    const testUser = {
      name: 'Aditi Rao',
      email: `aditi.${Date.now()}@paybastion.dev`,
      password: 'SecurePassword123!',
    };
    let authToken = null;
    let userId = null;

    it('POST /api/auth/register: registers new user, hashes password, and creates wallet', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send(testUser)
        .expect(201);

      assert.strictEqual(res.body.success, true);
      assert.ok(res.body.token);
      assert.strictEqual(res.body.user.name, testUser.name);
      assert.strictEqual(res.body.user.email, testUser.email);
      assert.strictEqual(res.body.user.passwordHash, undefined, 'Password hash must never be returned in API response');

      // Verify wallet provisioned
      assert.ok(res.body.wallet);
      assert.strictEqual(res.body.wallet.balance, 5000);
      assert.strictEqual(res.body.wallet.isSimulated, true);

      authToken = res.body.token;
      userId = res.body.user.id;

      // Verify MongoDB document
      const dbUser = await User.findById(userId);
      assert.ok(dbUser);
      assert.notStrictEqual(dbUser.passwordHash, testUser.password, 'Password must be hashed with bcrypt');
      const isMatch = await dbUser.comparePassword(testUser.password);
      assert.strictEqual(isMatch, true, 'bcrypt comparePassword must verify valid password');
    });

    it('POST /api/auth/register: prevents duplicate email registration', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send(testUser)
        .expect(409);

      assert.strictEqual(res.body.code, 'USER_EXISTS');
    });

    it('POST /api/auth/register: rejects invalid email or short password', async () => {
      await request(app)
        .post('/api/auth/register')
        .send({ name: 'Test', email: 'not-an-email', password: '123' })
        .expect(400);
    });

    it('POST /api/auth/login: logs in user with valid credentials', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: testUser.email,
          password: testUser.password,
        })
        .expect(200);

      assert.strictEqual(res.body.success, true);
      assert.ok(res.body.token);
      assert.strictEqual(res.body.user.email, testUser.email);
      assert.strictEqual(res.body.user.passwordHash, undefined);
    });

    it('POST /api/auth/login: rejects incorrect password with 401', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: testUser.email,
          password: 'WrongPassword!',
        })
        .expect(401);

      assert.strictEqual(res.body.code, 'INVALID_CREDENTIALS');
    });

    it('GET /api/auth/me: returns authenticated user profile', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.user.email, testUser.email);
      assert.ok(res.body.wallet);
    });

    it('GET /api/auth/me: blocks unauthorized request with 401', async () => {
      await request(app)
        .get('/api/auth/me')
        .expect(401);
    });

    it('POST /api/auth/logout: returns logout confirmation', async () => {
      const res = await request(app)
        .post('/api/auth/logout')
        .expect(200);

      assert.strictEqual(res.body.success, true);
    });
  });

  // ==========================================
  // 2. WALLET MANAGEMENT TESTS
  // ==========================================
  describe('WALLET MANAGEMENT & SIMULATED TRANSFERS SUITE', () => {
    let userToken = null;
    let userId = null;

    before(async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'Rohit Verma',
          email: `rohit.${Date.now()}@paybastion.dev`,
          password: 'Password123!',
        });
      userToken = res.body.token;
      userId = res.body.user.id;
    });

    it('GET /api/wallet/balance: retrieves initial wallet balance', async () => {
      const res = await request(app)
        .get('/api/wallet/balance')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.wallet.balance, 5000);
      assert.strictEqual(res.body.wallet.isSimulated, true);
      assert.strictEqual(res.body.wallet.hasPin, false);
    });

    it('POST /api/wallet/set-pin: sets and hashes 4-6 digit numeric PIN', async () => {
      const res = await request(app)
        .post('/api/wallet/set-pin')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ pin: '4829' })
        .expect(200);

      assert.strictEqual(res.body.success, true);

      // Verify in DB that PIN is hashed
      const wallet = await Wallet.findOne({ userId });
      assert.ok(wallet.pinHash);
      assert.notStrictEqual(wallet.pinHash, '4829', 'PIN must be hashed with bcrypt');
      const isPinMatch = await wallet.comparePin('4829');
      assert.strictEqual(isPinMatch, true);
    });

    it('POST /api/wallet/verify-pin: verifies correct PIN', async () => {
      const res = await request(app)
        .post('/api/wallet/verify-pin')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ pin: '4829' })
        .expect(200);

      assert.strictEqual(res.body.verified, true);
    });

    it('POST /api/wallet/verify-pin: rejects wrong PIN with 401', async () => {
      const res = await request(app)
        .post('/api/wallet/verify-pin')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ pin: '0000' })
        .expect(401);

      assert.strictEqual(res.body.verified, false);
    });

    it('POST /api/wallet/add-demo-funds: credits simulated funds to balance', async () => {
      const res = await request(app)
        .post('/api/wallet/add-demo-funds')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ amount: 2500 })
        .expect(200);

      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.wallet.balance, 7500); // 5000 + 2500
    });

    it('POST /api/wallet/transfer: executes simulated transfer with PIN and idempotency', async () => {
      const idempotencyKey = `IDEMP-WLT-TEST-${Date.now()}`;
      const res = await request(app)
        .post('/api/wallet/transfer')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          recipient: 'merchant-tea@upi',
          recipientName: 'Bengaluru Chai Point',
          amount: 350.00,
          pin: '4829',
          idempotencyKey,
          note: 'Chai & Snacks',
        })
        .expect(200);

      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.wallet.balance, 7150); // 7500 - 350
      assert.strictEqual(res.body.transaction.status, 'CONFIRMED');
      assert.strictEqual(res.body.transaction.isSimulation, true);

      // Verify repeated call with same idempotencyKey returns cached response without duplicate debit
      const dupRes = await request(app)
        .post('/api/wallet/transfer')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          recipient: 'merchant-tea@upi',
          recipientName: 'Bengaluru Chai Point',
          amount: 350.00,
          pin: '4829',
          idempotencyKey,
        })
        .expect(200);

      assert.strictEqual(dupRes.body.duplicatePrevented, true);
      // Balance must NOT have decreased again
      const balanceCheck = await request(app)
        .get('/api/wallet/balance')
        .set('Authorization', `Bearer ${userToken}`);
      assert.strictEqual(balanceCheck.body.wallet.balance, 7150, 'Balance must remain 7150 (zero duplicate debit)');
    });

    it('POST /api/wallet/transfer: rejects transfer exceeding balance', async () => {
      const res = await request(app)
        .post('/api/wallet/transfer')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          recipient: 'luxury-auto@upi',
          amount: 999999.00,
          pin: '4829',
          idempotencyKey: `IDEMP-EXCEED-${Date.now()}`,
        })
        .expect(400);

      assert.strictEqual(res.body.code, 'INSUFFICIENT_FUNDS');
    });

    it('GET /api/wallet/transactions: lists user transaction history', async () => {
      const res = await request(app)
        .get('/api/wallet/transactions')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      assert.strictEqual(res.body.success, true);
      assert.ok(Array.isArray(res.body.transactions));
      assert.ok(res.body.transactions.length >= 1);
    });
  });

  // ==========================================
  // 3. PROVIDER ABSTRACTION & SMART RECOVERY
  // ==========================================
  describe('PROVIDER ABSTRACTION & SMART RECOVERY SUITE', () => {
    it('MockPaymentProvider: verifies SUCCESS, FAILED, PENDING, and TIMEOUT correctly', async () => {
      const provider = new MockPaymentProvider();

      const successResult = await provider.verifyStatus({ simulatedOutcome: 'SUCCESS' });
      assert.strictEqual(successResult.state, 'CONFIRMED');
      assert.strictEqual(successResult.isSimulation, true);
      assert.ok(successResult.reference);

      const failedResult = await provider.verifyStatus({ simulatedOutcome: 'FAILED' });
      assert.strictEqual(failedResult.state, 'FAILED');
      assert.strictEqual(failedResult.reference, null);

      const pendingResult = await provider.verifyStatus({ simulatedOutcome: 'PENDING' });
      assert.strictEqual(pendingResult.state, 'PENDING_VERIFICATION');

      const timeoutResult = await provider.verifyStatus({ simulatedOutcome: 'TIMEOUT' });
      assert.strictEqual(timeoutResult.state, 'OUTCOME_UNKNOWN');
    });

    it('getProvider: returns PayPalPaymentProvider for PayPal and MockPaymentProvider for UPI/Mock', () => {
      const p1 = getProvider('PAYPAL');
      assert.ok(p1 instanceof PayPalPaymentProvider);

      const p2 = getProvider('UPI_GATEWAY');
      assert.ok(p2 instanceof MockPaymentProvider);
    });

    it('ReconciliationLog model: stores reconciliation audit records', async () => {
      const log = await ReconciliationLog.create({
        transactionId: `TXN-REC-LOG-${Date.now()}`,
        previousStatus: 'OUTCOME_UNKNOWN',
        providerStatus: 'COMPLETED',
        finalStatus: 'CONFIRMED',
        provider: 'PAYPAL',
        providerReference: 'CAP-12345',
        details: { verificationNotes: 'OAuth verified' },
      });

      assert.ok(log._id);
      assert.strictEqual(log.finalStatus, 'CONFIRMED');
    });

    it('AuditLog model: stores structured immutable event logs', async () => {
      const audit = await AuditLog.create({
        action: 'SECURITY_CHECK_PASSED',
        resourceId: 'RES-01',
        details: { ip: '127.0.0.1' },
      });

      assert.ok(audit._id);
      assert.strictEqual(audit.action, 'SECURITY_CHECK_PASSED');
    });
  });

  // ==========================================
  // 4. PAYPAL REST API V2 & WEBHOOK
  // ==========================================
  describe('PAYPAL SANDBOX REST API & WEBHOOK SUITE', () => {
    it('POST /api/paypal/create-order: creates order and returns approval URL', async () => {
      const res = await request(app)
        .post('/api/paypal/create-order')
        .send({
          amount: '25.00',
          currency: 'USD',
          description: 'Automated Test Sandbox Order',
        })
        .expect(200);

      assert.strictEqual(res.body.success, true);
      assert.ok(res.body.orderId);
      assert.ok(res.body.approveUrl);
    });

    it('POST /api/paypal/capture-order: captures order and verifies status', async () => {
      // Create order first
      const orderRes = await request(app)
        .post('/api/paypal/create-order')
        .send({ amount: '30.00', currency: 'USD' });

      const orderId = orderRes.body.orderId;

      // Capture
      const captureRes = await request(app)
        .post('/api/paypal/capture-order')
        .send({ orderId })
        .expect(200);

      assert.strictEqual(captureRes.body.success, true);
      assert.strictEqual(captureRes.body.status, 'COMPLETED');

      // Duplicate capture prevention check
      const dupCapture = await request(app)
        .post('/api/paypal/capture-order')
        .send({ orderId })
        .expect(200);

      assert.strictEqual(dupCapture.body.duplicatePrevented, true);
    });

    it('POST /api/paypal/webhook: handles PayPal webhook event safely', async () => {
      const webhookPayload = {
        id: `WH-${Date.now()}`,
        event_type: 'PAYMENT.CAPTURE.COMPLETED',
        resource: {
          id: `CAP-WH-${Date.now()}`,
          status: 'COMPLETED',
          amount: { value: '15.00', currency_code: 'USD' },
        },
      };

      const res = await request(app)
        .post('/api/paypal/webhook')
        .send(webhookPayload)
        .expect(200);

      assert.strictEqual(res.body.received, true);
      assert.strictEqual(res.body.eventType, 'PAYMENT.CAPTURE.COMPLETED');
    });
  });

  // ==========================================
  // 5. SCAM GUARDIAN MODULAR DETECTION
  // ==========================================
  describe('SCAM GUARDIAN MODULAR DETECTION SUITE', () => {
    it('POST /api/scam-guardian/analyze: detects phishing VPA handle', async () => {
      const res = await request(app)
        .post('/api/scam-guardian/analyze')
        .send({
          recipient: 'electricity-bill-refund@okaxis',
          amount: '3000',
        })
        .expect(200);

      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.riskLevel, 'CRITICAL');
      assert.ok(res.body.riskScore >= 90);
      assert.strictEqual(res.body.requiresConfirmation, true);
      assert.ok(res.body.detectedReasons.length >= 1);
    });

    it('POST /api/scam-guardian/analyze: detects deceptive reverse collect QR payload', async () => {
      const res = await request(app)
        .post('/api/scam-guardian/analyze')
        .send({
          recipient: 'reward-claim@upi',
          amount: '1500',
          rawPayload: 'upi://pay?pa=cashback-collector@upi&mode=02&am=1500&refund=true',
        })
        .expect(200);

      assert.strictEqual(res.body.riskLevel, 'CRITICAL');
      assert.strictEqual(res.body.safe, false);
    });

    it('POST /api/scam-guardian/analyze: detects IP address URL in payload', async () => {
      const res = await request(app)
        .post('/api/scam-guardian/analyze')
        .send({
          recipient: 'merchant@upi',
          amount: '200',
          rawPayload: 'http://192.168.1.50/pay-now',
        })
        .expect(200);

      assert.ok(res.body.riskScore >= 70);
      assert.ok(res.body.detectedReasons.some(r => r.includes('Direct IP address')));
    });

    it('POST /api/scam-guardian/analyze: rates genuine transaction as LOW risk', async () => {
      const res = await request(app)
        .post('/api/scam-guardian/analyze')
        .send({
          recipient: 'supermarket@hdfc',
          amount: '450.00',
          recentAttemptsCount: 1,
        })
        .expect(200);

      assert.strictEqual(res.body.riskLevel, 'LOW');
      assert.strictEqual(res.body.safe, true);
      assert.strictEqual(res.body.requiresConfirmation, false);
    });
  });

  // ==========================================
  // 6. HEALTH CHECK VERIFICATION
  // ==========================================
  describe('HEALTH & READINESS SUITE', () => {
    it('GET /api/health: reports healthy status and both database connections', async () => {
      const res = await request(app)
        .get('/api/health')
        .expect(200);

      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.server, 'running');
      assert.strictEqual(res.body.database, 'connected');
      assert.strictEqual(res.body.databases.mongodb, 'connected');
      assert.strictEqual(res.body.databases.sqlite, 'connected');
    });
  });
});
