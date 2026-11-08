// PayPal Developer Sandbox Service Client
// Uses PayPal REST API v2 directly for zero-dependency reliability and full OAuth2 spec compliance.

import { getDatabase } from '../config/database.js';
import {
  createTransaction,
  getTransactionById,
  getTransactionByIdempotencyKey,
  updateTransactionState,
  TRANSACTION_STATES
} from './transactionService.js';
import { Transaction as MongoTransaction } from '../models/Transaction.js';
import { AuditLog } from '../models/AuditLog.js';
import { isDBConnected } from '../config/database.js';

const PAYPAL_API_BASE = process.env.PAYPAL_MODE === 'live'
  ? 'https://api-m.paypal.com'
  : 'https://api-m.sandbox.paypal.com';

let cachedAccessToken = null;
let tokenExpiresAt = 0;

/**
 * Check whether valid PayPal credentials are configured in environment
 */
export function isPayPalConfigured() {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
  return Boolean(
    clientId &&
    clientSecret &&
    clientId !== 'your_paypal_sandbox_client_id_here' &&
    clientSecret !== 'your_paypal_sandbox_client_secret_here'
  );
}

/**
 * Fetch OAuth2 Bearer Access Token from PayPal Sandbox
 */
export async function getPayPalAccessToken() {
  if (!isPayPalConfigured()) {
    return { configured: false, token: null };
  }

  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;

  // Reuse cached token if valid with 60s buffer
  if (cachedAccessToken && Date.now() < tokenExpiresAt - 60000) {
    return { configured: true, token: cachedAccessToken };
  }

  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(`${PAYPAL_API_BASE}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`PayPal Auth Failed (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    cachedAccessToken = data.access_token;
    tokenExpiresAt = Date.now() + (data.expires_in * 1000);

    return { configured: true, token: cachedAccessToken };
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}

/**
 * Create a PayPal Order in Sandbox and register in database
 */
export async function createPayPalOrder({
  amount,
  currency = 'USD',
  description = 'PayBastion Sandbox Transaction',
  userId = null,
}, db = null) {
  const database = db || getDatabase();

  const numAmount = parseFloat(amount);
  if (isNaN(numAmount) || numAmount <= 0) {
    throw new Error('Valid positive amount is required');
  }

  const { configured, token } = await getPayPalAccessToken();
  const clientOrigin = process.env.CLIENT_ORIGIN || process.env.CLIENT_URL || 'http://localhost:5173';

  if (!configured) {
    // Explicit DEMO MODE when credentials are not configured
    const simulatedOrderId = `SANDBOX-DEMO-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

    // Register demo order in persistent transaction database
    const txn = createTransaction({
      id: `PP-${simulatedOrderId}`,
      idempotencyKey: `IDEMP-PP-${simulatedOrderId}`,
      amount: numAmount,
      currency,
      sender: 'demo-buyer@paypal.sandbox',
      recipient: 'merchant-sandbox@paybastion.dev',
      recipientName: 'PayBastion Merchant Gateway',
      category: 'PayPal Demo Checkout',
      channel: 'PAYPAL_SANDBOX',
      state: TRANSACTION_STATES.PENDING_VERIFICATION,
      confidenceScore: 60,
      isSimulation: true,
      userExplanation: 'Simulated PayPal Sandbox order created. Demo credentials active.',
      technicalDiagnosis: 'DEMO MODE: No live credentials provided in environment.',
      safeToRetry: false,
      needsReconciliation: true,
      logs: [
        {
          timestamp: new Date().toISOString(),
          event: 'PAYPAL_ORDER_CREATED_DEMO',
          detail: `Created simulated PayPal sandbox order ${simulatedOrderId}`,
        },
      ],
    }, database);

    if (isDBConnected()) {
      try {
        await MongoTransaction.create({
          userId,
          transactionId: `PP-${simulatedOrderId}`,
          idempotencyKey: `IDEMP-PP-${simulatedOrderId}`,
          provider: 'PAYPAL',
          providerTransactionId: simulatedOrderId,
          amount: numAmount,
          currency,
          recipient: 'merchant-sandbox@paybastion.dev',
          recipientName: 'PayBastion Merchant Gateway',
          status: TRANSACTION_STATES.PENDING_VERIFICATION,
          channel: 'PAYPAL_SANDBOX',
          isSimulation: true,
          userExplanation: 'Simulated PayPal Sandbox order created (Demo Mode).',
          safeToRetry: false,
        });
      } catch (e) {
        // Continue
      }
    }

    return {
      success: true,
      demoMode: true,
      isSimulation: true,
      orderId: simulatedOrderId,
      status: 'CREATED',
      amount: numAmount,
      currency,
      message: 'Simulated Sandbox Demo Order generated (Configure PAYPAL_CLIENT_ID & PAYPAL_CLIENT_SECRET for live sandbox API)',
      approveUrl: `https://www.sandbox.paypal.com/checkoutnow?token=${simulatedOrderId}`,
      transaction: txn,
    };
  }

  const payload = {
    intent: 'CAPTURE',
    purchase_units: [
      {
        description: (description || 'PayBastion Sandbox Transaction').substring(0, 127),
        amount: {
          currency_code: currency,
          value: numAmount.toFixed(2),
        },
      },
    ],
    application_context: {
      brand_name: 'PayBastion AI Resilience',
      landing_page: 'NO_PREFERENCE',
      user_action: 'PAY_NOW',
      return_url: `${clientOrigin}/paypal-return`,
      cancel_url: `${clientOrigin}/paypal-cancel`,
    },
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 12000);

  try {
    const response = await fetch(`${PAYPAL_API_BASE}/v2/checkout/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'Prefer': 'return=representation',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || `PayPal Order Creation Error (${response.status})`);
    }

    const approveLink = data.links?.find(link => link.rel === 'approve')?.href;

    // Register in local transactions table
    const txn = createTransaction({
      id: `PP-${data.id}`,
      idempotencyKey: `IDEMP-PP-${data.id}`,
      amount: numAmount,
      currency,
      sender: 'sandbox-buyer@paypal.com',
      recipient: 'merchant-sandbox@paybastion.dev',
      recipientName: 'PayBastion Merchant Gateway',
      category: 'PayPal Sandbox Checkout',
      channel: 'PAYPAL_SANDBOX',
      state: TRANSACTION_STATES.PENDING_VERIFICATION,
      confidenceScore: 70,
      isSimulation: false,
      userExplanation: 'PayPal order created in Developer Sandbox. Awaiting approval and capture.',
      technicalDiagnosis: `PayPal Order ${data.id} registered. Gateway status ${data.status}.`,
      safeToRetry: false,
      needsReconciliation: true,
      logs: [
        {
          timestamp: new Date().toISOString(),
          event: 'PAYPAL_ORDER_CREATED',
          detail: `Official PayPal order ${data.id} registered with state ${data.status}`,
        },
      ],
    }, database);

    if (isDBConnected()) {
      try {
        await MongoTransaction.create({
          userId,
          transactionId: `PP-${data.id}`,
          idempotencyKey: `IDEMP-PP-${data.id}`,
          provider: 'PAYPAL',
          providerTransactionId: data.id,
          amount: numAmount,
          currency,
          recipient: 'merchant-sandbox@paybastion.dev',
          recipientName: 'PayBastion Merchant Gateway',
          status: TRANSACTION_STATES.PENDING_VERIFICATION,
          channel: 'PAYPAL_SANDBOX',
          isSimulation: false,
          userExplanation: 'PayPal order created in Developer Sandbox. Awaiting approval and capture.',
          safeToRetry: false,
        });
      } catch (e) {
        // Continue
      }
    }

    return {
      success: true,
      demoMode: false,
      isSimulation: false,
      orderId: data.id,
      status: data.status,
      approveUrl: approveLink,
      details: data,
      transaction: txn,
    };
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}

/**
 * Capture an Approved PayPal Order and verify before marking CONFIRMED
 */
export async function capturePayPalOrder(orderId, db = null) {
  const database = db || getDatabase();

  if (!orderId) {
    throw new Error('orderId is required for PayPal capture');
  }

  // Security check: Check that orderId belongs to a locally registered transaction
  let localTxn = getTransactionById(`PP-${orderId}`, database) ||
                 getTransactionByIdempotencyKey(`IDEMP-PP-${orderId}`, database) ||
                 getTransactionById(orderId, database);

  if (!localTxn && isDBConnected()) {
    try {
      const mTx = await MongoTransaction.findOne({
        $or: [
          { transactionId: `PP-${orderId}` },
          { providerTransactionId: orderId },
          { idempotencyKey: `IDEMP-PP-${orderId}` },
        ],
      });
      if (mTx) {
        localTxn = {
          id: mTx.transactionId,
          state: mTx.status,
          amount: mTx.amount,
          currency: mTx.currency,
          providerReference: mTx.providerTransactionId,
        };
      }
    } catch (e) {
      // Continue
    }
  }

  if (!localTxn) {
    throw new Error(`Security validation failed: PayPal order ${orderId} is not associated with a registered local transaction.`);
  }

  // Prevent duplicate capture if already confirmed
  if (localTxn.state === 'CONFIRMED') {
    return {
      success: true,
      duplicatePrevented: true,
      alreadyCaptured: true,
      orderId,
      status: 'COMPLETED',
      captureId: localTxn.providerReference,
      message: 'Order was already captured and confirmed in database. Duplicate capture prevented.',
      transaction: localTxn,
    };
  }

  const { configured, token } = await getPayPalAccessToken();

  if (!configured || orderId.startsWith('SANDBOX-DEMO-')) {
    // Explicit DEMO capture simulation
    const captureId = `CAP-DEMO-${Date.now()}`;
    const completedAt = new Date().toISOString();

    const updated = updateTransactionState(localTxn.id, TRANSACTION_STATES.CONFIRMED, {
      confidenceScore: 95,
      providerReference: captureId,
      reconciliationStatus: 'RECONCILED',
      safeToRetry: false,
      needsReconciliation: false,
      explanation: {
        userExplanation: 'Simulated Sandbox payment completed (DEMO MODE).',
        technicalDiagnosis: 'Simulated PayPal Sandbox capture verified without live credentials.',
        safeToRetry: false,
        recommendedAction: 'Demonstration transaction confirmed.',
      },
      logEvent: 'PAYPAL_ORDER_CAPTURED_DEMO',
      logDetail: `Simulated capture ${captureId} for order ${orderId}`,
    }, database);

    if (isDBConnected()) {
      try {
        await MongoTransaction.findOneAndUpdate(
          { $or: [{ transactionId: localTxn.id }, { providerTransactionId: orderId }] },
          {
            status: TRANSACTION_STATES.CONFIRMED,
            providerTransactionId: captureId,
            safeToRetry: false,
            reconciliationStatus: 'RECONCILED',
          }
        );
      } catch (e) {
        // Continue
      }
    }

    return {
      success: true,
      demoMode: true,
      isSimulation: true,
      orderId,
      captureId,
      status: 'COMPLETED',
      payer: {
        email_address: 'sandbox-buyer@paybastion.dev',
        name: { given_name: 'Resilient', surname: 'Tester' },
      },
      message: 'Simulated Sandbox Capture Verified (DEMO MODE: Fictional confirmation)',
      completedAt,
      transaction: updated,
    };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(`${PAYPAL_API_BASE}/v2/checkout/orders/${orderId}/capture`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'Prefer': 'return=representation',
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    const data = await response.json();

    if (!response.ok) {
      if (data.details?.some(d => d.issue === 'ORDER_ALREADY_CAPTURED')) {
        const updated = updateTransactionState(localTxn.id, TRANSACTION_STATES.CONFIRMED, {
          confidenceScore: 99,
          reconciliationStatus: 'RECONCILED',
          safeToRetry: false,
          needsReconciliation: false,
          logEvent: 'PAYPAL_ORDER_ALREADY_CAPTURED',
          logDetail: `Upstream confirmed order was already captured. Reconciled as CONFIRMED.`,
        }, database);

        return {
          success: true,
          demoMode: false,
          isSimulation: false,
          orderId,
          status: 'COMPLETED',
          message: 'PayPal confirmed order was already captured upstream. Reconciled.',
          transaction: updated,
        };
      }

      throw new Error(data.message || `PayPal Capture Error (${response.status})`);
    }

    const captureDetail = data.purchase_units?.[0]?.payments?.captures?.[0];
    const isCompleted = data.status === 'COMPLETED' || captureDetail?.status === 'COMPLETED';
    const targetState = isCompleted ? TRANSACTION_STATES.CONFIRMED : TRANSACTION_STATES.PENDING_VERIFICATION;
    const captureId = captureDetail?.id || `CAP-${data.id}`;

    const updated = updateTransactionState(localTxn.id, targetState, {
      confidenceScore: isCompleted ? 99 : 70,
      providerReference: captureId,
      reconciliationStatus: isCompleted ? 'RECONCILED' : 'PENDING',
      safeToRetry: false,
      needsReconciliation: !isCompleted,
      explanation: {
        userExplanation: isCompleted
          ? `PayPal Sandbox payment of $${localTxn.amount} successfully captured.`
          : 'PayPal capture in-flight; awaiting final confirmation.',
        technicalDiagnosis: `PayPal Order ${orderId} captured with status ${data.status}. Capture ID: ${captureId}.`,
        safeToRetry: false,
        recommendedAction: isCompleted ? 'Transaction is settled. Do not retry.' : 'Wait for capture completion.',
      },
      logEvent: 'PAYPAL_CAPTURE_VERIFIED',
      logDetail: `PayPal Capture ${captureId} verified with status ${data.status}`,
    }, database);

    if (isDBConnected()) {
      try {
        await MongoTransaction.findOneAndUpdate(
          { $or: [{ transactionId: localTxn.id }, { providerTransactionId: orderId }] },
          {
            status: targetState,
            providerTransactionId: captureId,
            safeToRetry: !isCompleted,
            reconciliationStatus: isCompleted ? 'RECONCILED' : 'PENDING',
          }
        );
      } catch (e) {
        // Continue
      }
    }

    return {
      success: true,
      demoMode: false,
      isSimulation: false,
      orderId: data.id,
      captureId,
      status: data.status,
      payer: data.payer,
      details: data,
      completedAt: new Date().toISOString(),
      transaction: updated,
    };
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}

/**
 * Inquire Order Status directly from PayPal
 */
export async function getPayPalOrderStatus(orderId) {
  if (!orderId) {
    throw new Error('orderId is required');
  }

  const { configured, token } = await getPayPalAccessToken();

  if (!configured || orderId.startsWith('SANDBOX-DEMO-')) {
    return {
      exists: true,
      demoMode: true,
      isSimulation: true,
      status: 'COMPLETED',
      verifiedBy: 'PayBastion Sandbox Reconciler (Simulated Demo)',
      note: 'Demo mode simulated response. Live PayPal API credentials not configured in environment.',
    };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(`${PAYPAL_API_BASE}/v2/checkout/orders/${orderId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (response.status === 404) {
      return { exists: false, status: 'NOT_FOUND' };
    }

    const data = await response.json();
    return {
      exists: true,
      demoMode: false,
      isSimulation: false,
      status: data.status,
      details: data,
    };
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}

/**
 * Verify PayPal Webhook Signature using official PayPal verification API
 */
export async function verifyPayPalWebhookSignature({
  headers = {},
  rawBody = '',
  webhookId = process.env.PAYPAL_WEBHOOK_ID || 'DEMO_WEBHOOK_ID',
}) {
  const { configured, token } = await getPayPalAccessToken();

  if (!configured) {
    // Demo verification
    return {
      verified: true,
      demoMode: true,
      message: 'Demo mode simulated webhook signature verified.',
    };
  }

  const payload = {
    auth_algo: headers['paypal-auth-algo'],
    cert_url: headers['paypal-cert-url'],
    transmission_id: headers['paypal-transmission-id'],
    transmission_sig: headers['paypal-transmission-sig'],
    transmission_time: headers['paypal-transmission-time'],
    webhook_id: webhookId,
    webhook_event: typeof rawBody === 'string' ? JSON.parse(rawBody) : rawBody,
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(`${PAYPAL_API_BASE}/v1/notifications/verify-webhook-signature`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    const data = await response.json();

    const isVerified = data.verification_status === 'SUCCESS';
    return {
      verified: isVerified,
      demoMode: false,
      status: data.verification_status,
      details: data,
    };
  } catch (err) {
    clearTimeout(timeoutId);
    return {
      verified: false,
      error: err.message,
    };
  }
}

export default {
  isPayPalConfigured,
  getPayPalAccessToken,
  createPayPalOrder,
  capturePayPalOrder,
  getPayPalOrderStatus,
  verifyPayPalWebhookSignature,
};
