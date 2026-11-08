/**
 * PayBastion Transaction State Machine & Invariant Definitions
 */

export const TRANSACTION_STATES = {
  CREATED: 'CREATED',
  PROCESSING: 'PROCESSING',
  CONFIRMED: 'CONFIRMED',
  FAILED: 'FAILED',
  OUTCOME_UNKNOWN: 'OUTCOME_UNKNOWN',
  PENDING_VERIFICATION: 'PENDING_VERIFICATION',
  NEEDS_REVIEW: 'NEEDS_REVIEW',
  OFFLINE_AUTHORIZATION: 'OFFLINE_AUTHORIZATION',
};

export const TERMINAL_STATES = [
  TRANSACTION_STATES.CONFIRMED,
  TRANSACTION_STATES.FAILED,
];

export const UNCERTAIN_STATES = [
  TRANSACTION_STATES.OUTCOME_UNKNOWN,
  TRANSACTION_STATES.PENDING_VERIFICATION,
  TRANSACTION_STATES.PROCESSING,
];

/**
 * Validate whether a state transition is permitted
 */
export function isValidStateTransition(currentState, nextState) {
  if (currentState === nextState) return true;

  // Once CONFIRMED, transaction cannot transition to anything else
  if (currentState === TRANSACTION_STATES.CONFIRMED) {
    return false;
  }

  // Once FAILED, transaction cannot transition (a retry MUST issue a new transaction with a new idempotency key)
  if (currentState === TRANSACTION_STATES.FAILED) {
    return false;
  }

  // Allowed transitions
  const allowedTransitions = {
    [TRANSACTION_STATES.CREATED]: [
      TRANSACTION_STATES.PROCESSING,
      TRANSACTION_STATES.PENDING_VERIFICATION,
      TRANSACTION_STATES.CONFIRMED,
      TRANSACTION_STATES.FAILED,
      TRANSACTION_STATES.OUTCOME_UNKNOWN,
      TRANSACTION_STATES.NEEDS_REVIEW,
      TRANSACTION_STATES.OFFLINE_AUTHORIZATION,
    ],
    [TRANSACTION_STATES.PROCESSING]: [
      TRANSACTION_STATES.CONFIRMED,
      TRANSACTION_STATES.FAILED,
      TRANSACTION_STATES.OUTCOME_UNKNOWN,
      TRANSACTION_STATES.PENDING_VERIFICATION,
    ],
    [TRANSACTION_STATES.PENDING_VERIFICATION]: [
      TRANSACTION_STATES.CONFIRMED,
      TRANSACTION_STATES.FAILED,
      TRANSACTION_STATES.OUTCOME_UNKNOWN,
    ],
    [TRANSACTION_STATES.OUTCOME_UNKNOWN]: [
      TRANSACTION_STATES.CONFIRMED,
      TRANSACTION_STATES.FAILED,
      TRANSACTION_STATES.PENDING_VERIFICATION,
    ],
    [TRANSACTION_STATES.NEEDS_REVIEW]: [
      TRANSACTION_STATES.PROCESSING,
      TRANSACTION_STATES.FAILED,
      TRANSACTION_STATES.CONFIRMED,
    ],
    [TRANSACTION_STATES.OFFLINE_AUTHORIZATION]: [
      TRANSACTION_STATES.CONFIRMED,
      TRANSACTION_STATES.FAILED,
    ],
  };

  return Boolean(allowedTransitions[currentState]?.includes(nextState));
}

/**
 * Map provider responses to standard PayBastion transaction states
 */
export function mapProviderStatusToState(providerStatus) {
  if (!providerStatus) return TRANSACTION_STATES.OUTCOME_UNKNOWN;

  const normalized = String(providerStatus).toUpperCase().trim();

  switch (normalized) {
    case 'COMPLETED':
    case 'SUCCESS':
    case 'SETTLED':
    case 'CAPTURED':
      return TRANSACTION_STATES.CONFIRMED;

    case 'FAILED':
    case 'REJECTED':
    case 'CANCELLED':
    case 'VOIDED':
    case 'DECLINED':
      return TRANSACTION_STATES.FAILED;

    case 'PENDING':
    case 'PROCESSING':
    case 'IN_PROGRESS':
    case 'CREATED':
    case 'APPROVED':
      return TRANSACTION_STATES.PENDING_VERIFICATION;

    case 'TIMEOUT':
    case 'NETWORK_ERROR':
    case 'UNAVAILABLE':
    case 'UNKNOWN':
    default:
      return TRANSACTION_STATES.OUTCOME_UNKNOWN;
  }
}
