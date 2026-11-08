import { getPayPalOrderStatus } from '../paypalClient.js';
import { mapProviderStatusToState, TRANSACTION_STATES } from '../../utils/transactionState.js';

/**
 * Base Abstract Payment Provider Interface
 */
export class PaymentProvider {
  constructor(name) {
    this.name = name;
  }

  async verifyStatus({ transactionId, idempotencyKey, providerReference, orderId }) {
    throw new Error('verifyStatus must be implemented by concrete PaymentProvider subclass');
  }
}

/**
 * Official PayPal REST API Provider
 */
export class PayPalPaymentProvider extends PaymentProvider {
  constructor() {
    super('PAYPAL');
  }

  async verifyStatus({ transactionId, idempotencyKey, providerReference, orderId }) {
    const targetOrderId = orderId ||
      (transactionId && transactionId.startsWith('PP-') ? transactionId.replace('PP-', '') : null) ||
      (idempotencyKey && idempotencyKey.startsWith('IDEMP-PP-') ? idempotencyKey.replace('IDEMP-PP-', '') : null) ||
      providerReference;

    if (!targetOrderId) {
      return {
        providerStatus: 'UNKNOWN',
        state: TRANSACTION_STATES.OUTCOME_UNKNOWN,
        reference: null,
        isSimulation: false,
        detail: 'No PayPal Order ID found associated with this transaction record',
      };
    }

    try {
      const order = await getPayPalOrderStatus(targetOrderId);
      if (!order.exists) {
        return {
          providerStatus: 'NOT_FOUND',
          state: TRANSACTION_STATES.OUTCOME_UNKNOWN,
          reference: null,
          isSimulation: Boolean(order.demoMode),
          detail: 'Order ID not found on PayPal servers. Cannot declare outcome.',
        };
      }

      if (order.status === 'COMPLETED') {
        return {
          providerStatus: 'COMPLETED',
          state: TRANSACTION_STATES.CONFIRMED,
          reference: `PP-CAP-${targetOrderId}`,
          isSimulation: Boolean(order.demoMode),
          detail: order.demoMode
            ? 'PayPal Sandbox demo order confirmed in simulated test harness.'
            : `PayPal REST API verified capture COMPLETED for order ${targetOrderId}.`,
        };
      } else if (order.status === 'VOIDED' || order.status === 'CANCELLED') {
        return {
          providerStatus: order.status,
          state: TRANSACTION_STATES.FAILED,
          reference: null,
          isSimulation: Boolean(order.demoMode),
          detail: `PayPal REST API returned terminal cancellation status: ${order.status}`,
        };
      } else {
        return {
          providerStatus: order.status || 'PENDING',
          state: TRANSACTION_STATES.PENDING_VERIFICATION,
          reference: null,
          isSimulation: Boolean(order.demoMode),
          detail: `PayPal order status is ${order.status || 'PENDING'}. Capture is still awaiting buyer or webhook confirmation.`,
        };
      }
    } catch (err) {
      return {
        providerStatus: 'NETWORK_TIMEOUT',
        state: TRANSACTION_STATES.OUTCOME_UNKNOWN,
        reference: null,
        isSimulation: false,
        detail: `PayPal inquiry failed: ${err.message}. Holding OUTCOME_UNKNOWN lock.`,
      };
    }
  }
}

/**
 * Mock Payment Provider for Hackathon / Sandbox Testing
 * Clearly labelled as DEMO SIMULATION.
 * Never represents mock responses as actual bank confirmations.
 */
export class MockPaymentProvider extends PaymentProvider {
  constructor() {
    super('MOCK_PAYMENT_PROVIDER');
  }

  async verifyStatus({ transactionId, idempotencyKey, simulatedOutcome, metadata }) {
    // Check outcome instruction
    let desiredOutcome = simulatedOutcome || metadata?.simulatedOutcome;

    if (!desiredOutcome) {
      const idUpper = String(transactionId || '').toUpperCase();
      const keyUpper = String(idempotencyKey || '').toUpperCase();

      if (idUpper.includes('CRASH-01') || keyUpper.includes('NO-DEBIT') || keyUpper.includes('NO_DEBIT')) {
        desiredOutcome = 'FAILED';
      } else if (idUpper.includes('CRASH-02') || keyUpper.includes('CONFIRMED')) {
        desiredOutcome = 'SUCCESS';
      } else if (idUpper.includes('UNKNOWN') || keyUpper.includes('INDETERMINATE') || keyUpper.includes('TIMEOUT')) {
        desiredOutcome = 'TIMEOUT';
      } else if (idUpper.includes('PENDING')) {
        desiredOutcome = 'PENDING';
      } else {
        // Safe default: indeterminate, NEVER assume success!
        desiredOutcome = 'UNKNOWN';
      }
    }

    const outcome = String(desiredOutcome).toUpperCase();

    if (outcome === 'SUCCESS' || outcome === 'CONFIRMED' || outcome === 'COMPLETED') {
      return {
        providerStatus: 'COMPLETED',
        state: TRANSACTION_STATES.CONFIRMED,
        reference: `MOCK-DEMO-REF-${Date.now().toString().slice(-8)}`,
        isSimulation: true,
        detail: '[DEMO SIMULATION]: Mock payment gateway simulated verified credit settlement. (Not a real bank confirmation)',
      };
    }

    if (outcome === 'FAILED' || outcome === 'REJECTED' || outcome === 'CANCELLED' || outcome === 'NO_DEBIT') {
      return {
        providerStatus: 'FAILED',
        state: TRANSACTION_STATES.FAILED,
        reference: null,
        isSimulation: true,
        detail: '[DEMO SIMULATION]: Mock payment gateway confirmed zero funds were debited before interruption. Safe to retry.',
      };
    }

    if (outcome === 'PENDING' || outcome === 'PROCESSING') {
      return {
        providerStatus: 'PENDING',
        state: TRANSACTION_STATES.PENDING_VERIFICATION,
        reference: null,
        isSimulation: true,
        detail: '[DEMO SIMULATION]: Mock payment gateway reports payment is in-flight. Awaiting final response.',
      };
    }

    // Default: NETWORK_TIMEOUT or UNKNOWN
    return {
      providerStatus: 'TIMEOUT',
      state: TRANSACTION_STATES.OUTCOME_UNKNOWN,
      reference: null,
      isSimulation: true,
      detail: '[DEMO SIMULATION]: Mock payment gateway timed out. Outcome is indeterminate. Holding lock against duplicate charges.',
    };
  }
}

export function getProvider(providerName) {
  const normalized = String(providerName || '').toUpperCase();
  if (normalized.includes('PAYPAL')) {
    return new PayPalPaymentProvider();
  }
  return new MockPaymentProvider();
}

export default {
  PaymentProvider,
  PayPalPaymentProvider,
  MockPaymentProvider,
  getProvider,
};
