// Mock Data & Initial State for PayBastion AI Platform

export const INITIAL_TRANSACTIONS = [
  {
    id: 'TXN-90821-UPI',
    idempotencyKey: 'IDEMP-90821-20261101',
    amount: 1450.00,
    currency: 'INR',
    sender: 'user-ananya@okaxis',
    recipient: 'metro-supermarket@icici',
    recipientName: 'Metro Supermarket',
    category: 'Groceries',
    channel: 'UPI_ONLINE',
    state: 'CONFIRMED',
    confidenceScore: 99,
    createdAt: new Date(Date.now() - 12 * 60000).toISOString(),
    logs: [
      { timestamp: new Date(Date.now() - 12 * 60000).toISOString(), event: 'INITIATED', detail: 'User authorized via biometrics' },
      { timestamp: new Date(Date.now() - 12 * 60000 + 400).toISOString(), event: 'PROVIDER_ACK', detail: 'Bank returned UTR-881920381023' },
      { timestamp: new Date(Date.now() - 12 * 60000 + 800).toISOString(), event: 'SETTLED', detail: 'Cleared via NPCI Switch. Confirmed.' }
    ],
    technicalDiagnosis: 'Idempotency key validated. Provider returned HTTP 200/CAPTURE_COMPLETED.',
    userExplanation: 'Your payment was successfully received by Metro Supermarket. Settlement is confirmed.',
    safeToRetry: false,
  },
  {
    id: 'TXN-77341-GATEWAY',
    idempotencyKey: 'IDEMP-77341-20261101',
    amount: 620.00,
    currency: 'INR',
    sender: 'user-ananya@okaxis',
    recipient: 'kavitha-cafe@kotak',
    recipientName: 'Kavitha Cafe',
    category: 'Dining',
    channel: 'UPI_ONLINE',
    state: 'PENDING_VERIFICATION',
    confidenceScore: 68,
    createdAt: new Date(Date.now() - 5 * 60000).toISOString(),
    logs: [
      { timestamp: new Date(Date.now() - 5 * 60000).toISOString(), event: 'INITIATED', detail: 'Payment payload sent to bank switch' },
      { timestamp: new Date(Date.now() - 5 * 60000 + 3500).toISOString(), event: 'TIMEOUT_DETECTED', detail: 'Bank switch ACK exceeded 3500ms threshold' },
      { timestamp: new Date(Date.now() - 5 * 60000 + 4000).toISOString(), event: 'IDEMPOTENCY_LOCKED', detail: 'PayBastion locked retry attempts to prevent double-charging' }
    ],
    technicalDiagnosis: 'Bank debit instruction in transit. Gateway webhook delayed. Status is being polled.',
    userExplanation: 'Your payment reached the payment switch, but final bank acknowledgement is delayed. PayBastion is verifying provider status.',
    safeToRetry: false,
    needsReconciliation: true,
  },
  {
    id: 'TXN-64210-DROP',
    idempotencyKey: 'IDEMP-64210-20261101',
    amount: 850.00,
    currency: 'INR',
    sender: 'user-ananya@okaxis',
    recipient: 'quick-mart@sbi',
    recipientName: 'Quick Mart',
    category: 'Shopping',
    channel: 'UPI_ONLINE',
    state: 'OUTCOME_UNKNOWN',
    confidenceScore: 35,
    createdAt: new Date(Date.now() - 2 * 60000).toISOString(),
    logs: [
      { timestamp: new Date(Date.now() - 2 * 60000).toISOString(), event: 'TCP_SOCKET_DROP', detail: 'Client network dropped during debit dispatch' },
      { timestamp: new Date(Date.now() - 2 * 60000 + 100).toISOString(), event: 'OUTCOME_INDETERMINATE', detail: 'Zero response packets received from upstream server' }
    ],
    technicalDiagnosis: 'Network connection severed mid-flight. Funds status indeterminate. Retrying would risk duplicate debit.',
    userExplanation: 'A network interruption happened right as you paid. We are checking if the bank registered the debit before any retry is allowed.',
    safeToRetry: false,
    needsReconciliation: true,
  },
  {
    id: 'TXN-55102-OFFLINE',
    idempotencyKey: 'AUTH-OFFLINE-78192-20261101',
    amount: 320.00,
    currency: 'INR',
    sender: 'user-ananya@paybastion',
    recipient: 'namma-metro-kiosk@axis',
    recipientName: 'Namma Metro Transit Kiosk',
    category: 'Transit',
    channel: 'OFFLINE_PASSPORT',
    state: 'OFFLINE_AUTHORIZATION',
    confidenceScore: 85,
    createdAt: new Date(Date.now() - 20 * 60000).toISOString(),
    expiresAt: new Date(Date.now() + 10 * 60000).toISOString(),
    nonce: 'nonce-c8b18-f2910',
    signature: '7e8b82a819034bc091c71829e102f928a82710192837bc901a',
    logs: [
      { timestamp: new Date(Date.now() - 20 * 60000).toISOString(), event: 'OFFLINE_TOKEN_GENERATED', detail: 'HMAC signed offline token created. Valid 30 mins.' },
      { timestamp: new Date(Date.now() - 19 * 60000).toISOString(), event: 'MERCHANT_TERMINAL_SCAN', detail: 'Merchant terminal accepted token. Queued in local ledger.' }
    ],
    technicalDiagnosis: 'Signed cryptographic authorization verified locally. Marked as SETTLEMENT_PENDING.',
    userExplanation: 'Offline payment authorization recorded with merchant. Settlement will execute automatically once terminal reconnects to internet.',
    safeToRetry: false,
    settlementPending: true,
  },
  {
    id: 'TXN-41920-REJECT',
    idempotencyKey: 'IDEMP-41920-20261101',
    amount: 5200.00,
    currency: 'INR',
    sender: 'user-ananya@okaxis',
    recipient: 'gadget-bazaar@hdfc',
    recipientName: 'Gadget Bazaar',
    category: 'Electronics',
    channel: 'UPI_ONLINE',
    state: 'FAILED',
    confidenceScore: 100,
    createdAt: new Date(Date.now() - 60 * 60000).toISOString(),
    logs: [
      { timestamp: new Date(Date.now() - 60 * 60000).toISOString(), event: 'INITIATED', detail: 'Payment request dispatched' },
      { timestamp: new Date(Date.now() - 60 * 60000 + 1200).toISOString(), event: 'PROVIDER_REJECT', detail: 'Bank returned: INSUFFICIENT_FUNDS / LIMIT_EXCEEDED' }
    ],
    technicalDiagnosis: 'Provider returned explicit refusal. Account was NOT debited. Idempotency lock cleanly released.',
    userExplanation: 'The bank rejected this payment. No money was deducted from your account. It is safe to retry.',
    safeToRetry: true,
  },
  {
    id: 'TXN-32190-FLAG',
    idempotencyKey: 'IDEMP-32190-20261101',
    amount: 4999.00,
    currency: 'INR',
    sender: 'user-ananya@okaxis',
    recipient: 'electricity-bill-refund@okaxis',
    recipientName: 'Power Dept Support Desk',
    category: 'Utilities',
    channel: 'UPI_ONLINE',
    state: 'NEEDS_REVIEW',
    confidenceScore: 15,
    createdAt: new Date(Date.now() - 40 * 60000).toISOString(),
    logs: [
      { timestamp: new Date(Date.now() - 40 * 60000).toISOString(), event: 'SCAM_GUARDIAN_INTERCEPT', detail: 'Detected high-risk VPA pattern: impersonation of utility refund' },
      { timestamp: new Date(Date.now() - 40 * 60000 + 50).toISOString(), event: 'EXECUTION_HALTED', detail: 'Payment locked for safety review' }
    ],
    technicalDiagnosis: 'Scam Guardian triggered: Impersonation keywords in handle + reverse collect request pattern.',
    userExplanation: 'Scam Guardian blocked this transaction because the recipient handle appears fraudulent. Review alerts before continuing.',
    safeToRetry: false,
    scamAlert: {
      signal: 'Impersonation Pattern: Recipient handle claims to be Electricity Refund Desk',
      reason: 'Legitimate utility departments do not issue refunds via UPI payment collect requests.',
      recommendedAction: 'Reject request and block VPA.'
    }
  }
];

export const VOICE_PRESETS = [
  {
    lang: 'kn-IN',
    label: 'Kannada (ಕನ್ನಡ) - ಕಾಫಿ ಪಾವತಿ',
    text: 'ಕಿರಣ್ ಅವರಿಗೆ 350 ರೂಪಾಯಿ ಕಾಫಿಗೆ ಕಳುಹಿಸಿ',
    translation: 'Send 350 rupees to Kiran for Coffee',
  },
  {
    lang: 'kn-IN',
    label: 'Kannada (ಕನ್ನಡ) - ದಿನಸಿ ಬಿಲ್',
    text: 'ರಾಜು ದಿನಸಿ ಅಂಗಡಿಗೆ ₹850 ಪಾವತಿಸಿ',
    translation: 'Pay ₹850 to Raju Grocery Shop',
  },
  {
    lang: 'en-US',
    label: 'English - Restaurant Bill',
    text: 'Pay 450 rupees to Priya for dinner',
    translation: 'Pay ₹450 to Priya for dinner',
  },
  {
    lang: 'en-US',
    label: 'English - Grocery Store',
    text: 'Transfer 1200 rupees to Metro Supermarket for groceries',
    translation: 'Transfer ₹1200 to Metro Supermarket',
  }
];

export const SIMULATED_CREDIT_PROFILE = {
  userName: 'Ananya Sharma',
  userId: 'CUST-IN-89210',
  isSimulation: true,
  disclaimer: 'DEMONSTRATION ONLY: This is an educational temporary credit fallback simulation. No real money, banking APIs or CIBIL credit bureaus are accessed.',
  creditLimit: 5000,
  utilizedCredit: 940,
  availableCredit: 4060,
  trustScore: 785, // out of 900
  eligibilityStatus: 'ELIGIBLE_FOR_INSTANT_FALLBACK',
  repaymentSchedule: [
    { id: 'INST-1', dueDate: 'Nov 08, 2026', amount: 470, status: 'PENDING' },
    { id: 'INST-2', dueDate: 'Nov 15, 2026', amount: 470, status: 'PENDING' },
  ],
  consentGiven: true,
};
