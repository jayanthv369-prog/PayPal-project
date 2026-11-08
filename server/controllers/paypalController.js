import {
  createPayPalOrder,
  capturePayPalOrder,
  getPayPalOrderStatus,
  verifyPayPalWebhookSignature,
} from '../services/paypalClient.js';
import { updateTransactionState, TRANSACTION_STATES } from '../services/transactionService.js';
import { Transaction as MongoTransaction } from '../models/Transaction.js';
import { AuditLog } from '../models/AuditLog.js';
import { isDBConnected } from '../config/database.js';

export async function createOrder(req, res) {
  try {
    const { amount = '10.00', currency = 'USD', description } = req.body;

    if (isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
      return res.status(400).json({ error: 'Valid positive amount is required' });
    }

    const order = await createPayPalOrder({
      amount,
      currency,
      description,
      userId: req.userId || null,
    });
    res.json(order);
  } catch (error) {
    console.error('Create PayPal Order Error:', error);
    res.status(500).json({
      error: error.message || 'Failed to create PayPal sandbox order',
      hint: 'Check PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET in environment',
    });
  }
}

export async function captureOrder(req, res) {
  try {
    const { orderId } = req.body;
    if (!orderId) {
      return res.status(400).json({ error: 'orderId is required' });
    }

    const captureResult = await capturePayPalOrder(orderId);
    res.json(captureResult);
  } catch (error) {
    console.error('Capture PayPal Order Error:', error);
    res.status(400).json({
      error: error.message || 'Failed to capture PayPal sandbox order',
    });
  }
}

export async function getStatus(req, res) {
  try {
    const { orderId } = req.params;
    if (!orderId) {
      return res.status(400).json({ error: 'orderId parameter is required' });
    }

    const statusResult = await getPayPalOrderStatus(orderId);
    res.json(statusResult);
  } catch (error) {
    console.error('PayPal Order Status Check Error:', error);
    res.status(500).json({ error: error.message });
  }
}

export async function handleWebhook(req, res) {
  try {
    const verification = await verifyPayPalWebhookSignature({
      headers: req.headers,
      rawBody: req.body,
    });

    if (!verification.verified) {
      return res.status(400).json({ error: 'Webhook signature verification failed' });
    }

    const event = req.body;
    const eventType = event.event_type;
    const resource = event.resource || {};

    if (eventType === 'PAYMENT.CAPTURE.COMPLETED') {
      const orderId = resource.supplementary_data?.related_ids?.order_id;
      const captureId = resource.id;

      if (orderId) {
        updateTransactionState(`PP-${orderId}`, TRANSACTION_STATES.CONFIRMED, {
          providerReference: captureId,
          confidenceScore: 100,
          reconciliationStatus: 'RECONCILED',
          safeToRetry: false,
          logEvent: 'PAYPAL_WEBHOOK_CAPTURE_COMPLETED',
          logDetail: `Webhook verified capture ${captureId} for order ${orderId}`,
        });

        if (isDBConnected()) {
          try {
            await MongoTransaction.findOneAndUpdate(
              { $or: [{ transactionId: `PP-${orderId}` }, { providerTransactionId: orderId }] },
              {
                status: TRANSACTION_STATES.CONFIRMED,
                providerTransactionId: captureId,
                safeToRetry: false,
                reconciliationStatus: 'RECONCILED',
              }
            );

            await AuditLog.create({
              action: 'PAYPAL_WEBHOOK_PROCESSED',
              resourceId: orderId,
              details: { eventType, captureId },
            });
          } catch (e) {
            // Continue
          }
        }
      }
    }

    res.status(200).json({ received: true, eventType });
  } catch (err) {
    console.error('PayPal Webhook Error:', err);
    res.status(500).json({ error: err.message });
  }
}

export default {
  createOrder,
  captureOrder,
  getStatus,
  handleWebhook,
};
