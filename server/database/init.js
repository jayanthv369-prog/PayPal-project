import { getDatabase } from '../config/database.js';

export { getDatabase };

export function initializeDatabase(db = null) {
  const database = db || getDatabase();

  database.exec(`
    -- 1. Transactions Table
    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      idempotency_key TEXT UNIQUE NOT NULL,
      amount REAL NOT NULL,
      currency TEXT NOT NULL DEFAULT 'INR',
      sender TEXT,
      recipient TEXT NOT NULL,
      recipient_name TEXT,
      category TEXT,
      payment_channel TEXT NOT NULL,
      transaction_state TEXT NOT NULL,
      confidence_score INTEGER DEFAULT 100,
      provider_reference TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      reconciliation_status TEXT,
      explanation TEXT,
      metadata TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_transactions_idempotency ON transactions(idempotency_key);
    CREATE INDEX IF NOT EXISTS idx_transactions_state ON transactions(transaction_state);
    CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions(created_at);
    CREATE INDEX IF NOT EXISTS idx_transactions_recipient ON transactions(recipient);

    -- 2. Idempotency Keys Table
    CREATE TABLE IF NOT EXISTS idempotency_keys (
      key TEXT PRIMARY KEY,
      target_type TEXT NOT NULL,
      target_id TEXT,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT,
      response_payload TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_idempotency_status ON idempotency_keys(status);

    -- 3. Offline Passports Table
    CREATE TABLE IF NOT EXISTS offline_passports (
      auth_id TEXT PRIMARY KEY,
      sender_id TEXT NOT NULL,
      recipient_id TEXT NOT NULL,
      recipient_name TEXT,
      amount REAL NOT NULL,
      currency TEXT NOT NULL DEFAULT 'INR',
      nonce TEXT UNIQUE NOT NULL,
      signature TEXT NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'SETTLEMENT_PENDING'
    );

    CREATE INDEX IF NOT EXISTS idx_offline_nonce ON offline_passports(nonce);
    CREATE INDEX IF NOT EXISTS idx_offline_recipient ON offline_passports(recipient_id);
    CREATE INDEX IF NOT EXISTS idx_offline_status ON offline_passports(status);

    -- 4. Redeemed Nonces Table (Persistent Replay Defense)
    CREATE TABLE IF NOT EXISTS redeemed_nonces (
      nonce TEXT PRIMARY KEY,
      auth_id TEXT NOT NULL,
      redeemed_by TEXT NOT NULL,
      amount REAL NOT NULL,
      currency TEXT NOT NULL DEFAULT 'INR',
      redeemed_at TEXT NOT NULL,
      journal_id TEXT
    );

    -- 5. Merchant Journal Table
    CREATE TABLE IF NOT EXISTS merchant_journal (
      journal_id TEXT PRIMARY KEY,
      auth_id TEXT NOT NULL,
      terminal_hold_id TEXT NOT NULL,
      sender_id TEXT NOT NULL,
      recipient_id TEXT NOT NULL,
      recipient_name TEXT,
      amount REAL NOT NULL,
      currency TEXT NOT NULL DEFAULT 'INR',
      nonce TEXT NOT NULL,
      scanned_at TEXT NOT NULL,
      settlement_status TEXT NOT NULL DEFAULT 'SETTLEMENT_PENDING',
      signature TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_journal_nonce ON merchant_journal(nonce);
    CREATE INDEX IF NOT EXISTS idx_journal_auth ON merchant_journal(auth_id);

    -- 6. Credit Profiles Table
    CREATE TABLE IF NOT EXISTS credit_profiles (
      user_id TEXT PRIMARY KEY,
      user_name TEXT NOT NULL,
      credit_limit REAL NOT NULL DEFAULT 5000,
      utilized_credit REAL NOT NULL DEFAULT 0,
      available_credit REAL NOT NULL DEFAULT 5000,
      trust_score INTEGER DEFAULT 785,
      eligibility_status TEXT DEFAULT 'ELIGIBLE_FOR_INSTANT_FALLBACK',
      consent_given INTEGER DEFAULT 1,
      is_simulation INTEGER DEFAULT 1,
      disclaimer TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    -- 7. Credit Transactions Table
    CREATE TABLE IF NOT EXISTS credit_transactions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      loan_id TEXT NOT NULL,
      installment_id TEXT NOT NULL,
      amount REAL NOT NULL,
      recipient TEXT NOT NULL,
      recipient_name TEXT,
      due_date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING',
      created_at TEXT NOT NULL,
      repaid_at TEXT,
      is_simulation INTEGER DEFAULT 1,
      FOREIGN KEY (user_id) REFERENCES credit_profiles(user_id)
    );

    CREATE INDEX IF NOT EXISTS idx_credit_tx_user ON credit_transactions(user_id);
    CREATE INDEX IF NOT EXISTS idx_credit_tx_status ON credit_transactions(status);

    -- 8. Audit Logs Table
    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      event TEXT NOT NULL,
      detail TEXT,
      metadata TEXT,
      timestamp TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_logs(entity_type, entity_id);
    CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_logs(timestamp);
  `);

  seedInitialData(database);
  return database;
}

export function seedInitialData(database) {
  const txCount = database.prepare('SELECT COUNT(*) as count FROM transactions').get();

  if (txCount.count === 0) {
    const seedTransactions = [
      {
        id: 'TXN-90821-UPI',
        idempotency_key: 'IDEMP-90821-20261101',
        amount: 1450.00,
        currency: 'INR',
        sender: 'user-ananya@okaxis',
        recipient: 'metro-supermarket@icici',
        recipient_name: 'Metro Supermarket',
        category: 'Groceries',
        payment_channel: 'UPI_ONLINE',
        transaction_state: 'CONFIRMED',
        confidence_score: 99,
        provider_reference: 'UTR-881920381023',
        created_at: new Date(Date.now() - 12 * 60000).toISOString(),
        updated_at: new Date(Date.now() - 12 * 60000).toISOString(),
        reconciliation_status: 'RECONCILED',
        explanation: JSON.stringify({
          userExplanation: 'Your payment was successfully received by Metro Supermarket. Settlement is confirmed.',
          technicalDiagnosis: 'Idempotency key validated. Provider returned HTTP 200/CAPTURE_COMPLETED.',
          safeToRetry: false,
          recommendedAction: 'Transaction is complete. Retrying will create a duplicate payment.'
        }),
        metadata: JSON.stringify({
          safeToRetry: false,
          logs: [
            { timestamp: new Date(Date.now() - 12 * 60000).toISOString(), event: 'INITIATED', detail: 'User authorized via biometrics' },
            { timestamp: new Date(Date.now() - 12 * 60000 + 400).toISOString(), event: 'PROVIDER_ACK', detail: 'Bank returned UTR-881920381023' },
            { timestamp: new Date(Date.now() - 12 * 60000 + 800).toISOString(), event: 'SETTLED', detail: 'Cleared via NPCI Switch. Confirmed.' }
          ]
        })
      },
      {
        id: 'TXN-77341-GATEWAY',
        idempotency_key: 'IDEMP-77341-20261101',
        amount: 620.00,
        currency: 'INR',
        sender: 'user-ananya@okaxis',
        recipient: 'kavitha-cafe@kotak',
        recipient_name: 'Kavitha Cafe',
        category: 'Dining',
        payment_channel: 'UPI_ONLINE',
        transaction_state: 'PENDING_VERIFICATION',
        confidence_score: 68,
        provider_reference: null,
        created_at: new Date(Date.now() - 5 * 60000).toISOString(),
        updated_at: new Date(Date.now() - 5 * 60000).toISOString(),
        reconciliation_status: 'PENDING',
        explanation: JSON.stringify({
          userExplanation: 'Your payment reached the payment switch, but final bank acknowledgement is delayed. PayBastion is verifying provider status.',
          technicalDiagnosis: 'Bank debit instruction in transit. Gateway webhook delayed. Status is being polled.',
          safeToRetry: false,
          recommendedAction: 'Do NOT press pay again. PayBastion is verifying the existing order to prevent double debits.'
        }),
        metadata: JSON.stringify({
          needsReconciliation: true,
          safeToRetry: false,
          logs: [
            { timestamp: new Date(Date.now() - 5 * 60000).toISOString(), event: 'INITIATED', detail: 'Payment payload sent to bank switch' },
            { timestamp: new Date(Date.now() - 5 * 60000 + 3500).toISOString(), event: 'TIMEOUT_DETECTED', detail: 'Bank switch ACK exceeded 3500ms threshold' },
            { timestamp: new Date(Date.now() - 5 * 60000 + 4000).toISOString(), event: 'IDEMPOTENCY_LOCKED', detail: 'PayBastion locked retry attempts to prevent double-charging' }
          ]
        })
      },
      {
        id: 'TXN-64210-DROP',
        idempotency_key: 'IDEMP-64210-20261101',
        amount: 850.00,
        currency: 'INR',
        sender: 'user-ananya@okaxis',
        recipient: 'quick-mart@sbi',
        recipient_name: 'Quick Mart',
        category: 'Shopping',
        payment_channel: 'UPI_ONLINE',
        transaction_state: 'OUTCOME_UNKNOWN',
        confidence_score: 35,
        provider_reference: null,
        created_at: new Date(Date.now() - 2 * 60000).toISOString(),
        updated_at: new Date(Date.now() - 2 * 60000).toISOString(),
        reconciliation_status: 'PENDING',
        explanation: JSON.stringify({
          userExplanation: 'A network interruption happened right as you paid. We are checking if the bank registered the debit before any retry is allowed.',
          technicalDiagnosis: 'Network connection severed mid-flight. Funds status indeterminate. Retrying would risk duplicate debit.',
          safeToRetry: false,
          recommendedAction: 'Hold tight. The Smart Recovery Engine is conducting a non-debit status inquiry. Do not re-initiate payment.'
        }),
        metadata: JSON.stringify({
          needsReconciliation: true,
          safeToRetry: false,
          logs: [
            { timestamp: new Date(Date.now() - 2 * 60000).toISOString(), event: 'TCP_SOCKET_DROP', detail: 'Client network dropped during debit dispatch' },
            { timestamp: new Date(Date.now() - 2 * 60000 + 100).toISOString(), event: 'OUTCOME_INDETERMINATE', detail: 'Zero response packets received from upstream server' }
          ]
        })
      },
      {
        id: 'TXN-55102-OFFLINE',
        idempotency_key: 'AUTH-OFFLINE-78192-20261101',
        amount: 320.00,
        currency: 'INR',
        sender: 'user-ananya@paybastion',
        recipient: 'namma-metro-kiosk@axis',
        recipient_name: 'Namma Metro Transit Kiosk',
        category: 'Transit',
        payment_channel: 'OFFLINE_PASSPORT',
        transaction_state: 'OFFLINE_AUTHORIZATION',
        confidence_score: 85,
        provider_reference: null,
        created_at: new Date(Date.now() - 20 * 60000).toISOString(),
        updated_at: new Date(Date.now() - 20 * 60000).toISOString(),
        reconciliation_status: 'SETTLEMENT_PENDING',
        explanation: JSON.stringify({
          userExplanation: 'Offline payment authorization recorded with merchant. Settlement will execute automatically once terminal reconnects to internet.',
          technicalDiagnosis: 'Signed cryptographic authorization verified locally. Marked as SETTLEMENT_PENDING.',
          safeToRetry: false,
          recommendedAction: 'Present QR code to merchant terminal. Once connectivity is restored, the batch will settle automatically.'
        }),
        metadata: JSON.stringify({
          settlementPending: true,
          safeToRetry: false,
          nonce: 'nonce-c8b18-f2910',
          signature: '7e8b82a819034bc091c71829e102f928a82710192837bc901a',
          logs: [
            { timestamp: new Date(Date.now() - 20 * 60000).toISOString(), event: 'OFFLINE_TOKEN_GENERATED', detail: 'HMAC signed offline token created. Valid 30 mins.' },
            { timestamp: new Date(Date.now() - 19 * 60000).toISOString(), event: 'MERCHANT_TERMINAL_SCAN', detail: 'Merchant terminal accepted token. Queued in local ledger.' }
          ]
        })
      },
      {
        id: 'TXN-41920-REJECT',
        idempotency_key: 'IDEMP-41920-20261101',
        amount: 5200.00,
        currency: 'INR',
        sender: 'user-ananya@okaxis',
        recipient: 'gadget-bazaar@hdfc',
        recipient_name: 'Gadget Bazaar',
        category: 'Electronics',
        payment_channel: 'UPI_ONLINE',
        transaction_state: 'FAILED',
        confidence_score: 100,
        provider_reference: null,
        created_at: new Date(Date.now() - 60 * 60000).toISOString(),
        updated_at: new Date(Date.now() - 60 * 60000).toISOString(),
        reconciliation_status: 'RECONCILED',
        explanation: JSON.stringify({
          userExplanation: 'The bank rejected this payment. No money was deducted from your account. It is safe to retry.',
          technicalDiagnosis: 'Provider returned explicit refusal. Account was NOT debited. Idempotency lock cleanly released.',
          safeToRetry: true,
          recommendedAction: 'You can safely attempt this payment again or switch to an alternate payment method.'
        }),
        metadata: JSON.stringify({
          safeToRetry: true,
          logs: [
            { timestamp: new Date(Date.now() - 60 * 60000).toISOString(), event: 'INITIATED', detail: 'Payment request dispatched' },
            { timestamp: new Date(Date.now() - 60 * 60000 + 1200).toISOString(), event: 'PROVIDER_REJECT', detail: 'Bank returned: INSUFFICIENT_FUNDS / LIMIT_EXCEEDED' }
          ]
        })
      },
      {
        id: 'TXN-32190-FLAG',
        idempotency_key: 'IDEMP-32190-20261101',
        amount: 4999.00,
        currency: 'INR',
        sender: 'user-ananya@okaxis',
        recipient: 'electricity-bill-refund@okaxis',
        recipient_name: 'Power Dept Support Desk',
        category: 'Utilities',
        payment_channel: 'UPI_ONLINE',
        transaction_state: 'NEEDS_REVIEW',
        confidence_score: 15,
        provider_reference: null,
        created_at: new Date(Date.now() - 40 * 60000).toISOString(),
        updated_at: new Date(Date.now() - 40 * 60000).toISOString(),
        reconciliation_status: 'NEEDS_REVIEW',
        explanation: JSON.stringify({
          userExplanation: 'Scam Guardian blocked this transaction because the recipient handle appears fraudulent. Review alerts before continuing.',
          technicalDiagnosis: 'Scam Guardian triggered: Impersonation keywords in handle + reverse collect request pattern.',
          safeToRetry: false,
          recommendedAction: 'Review the recipient credentials carefully in Scam Guardian before authorizing any release.'
        }),
        metadata: JSON.stringify({
          safeToRetry: false,
          scamAlert: {
            signal: 'Impersonation Pattern: Recipient handle claims to be Electricity Refund Desk',
            reason: 'Legitimate utility departments do not issue refunds via UPI payment collect requests.',
            recommendedAction: 'Reject request and block VPA.'
          },
          logs: [
            { timestamp: new Date(Date.now() - 40 * 60000).toISOString(), event: 'SCAM_GUARDIAN_INTERCEPT', detail: 'Detected high-risk VPA pattern: impersonation of utility refund' },
            { timestamp: new Date(Date.now() - 40 * 60000 + 50).toISOString(), event: 'EXECUTION_HALTED', detail: 'Payment locked for safety review' }
          ]
        })
      }
    ];

    const insertTx = database.prepare(`
      INSERT INTO transactions (
        id, idempotency_key, amount, currency, sender, recipient, recipient_name,
        category, payment_channel, transaction_state, confidence_score, provider_reference,
        created_at, updated_at, reconciliation_status, explanation, metadata
      ) VALUES (
        @id, @idempotency_key, @amount, @currency, @sender, @recipient, @recipient_name,
        @category, @payment_channel, @transaction_state, @confidence_score, @provider_reference,
        @created_at, @updated_at, @reconciliation_status, @explanation, @metadata
      )
    `);

    const insertIdemp = database.prepare(`
      INSERT OR IGNORE INTO idempotency_keys (key, target_type, target_id, status, created_at)
      VALUES (?, 'TRANSACTION', ?, ?, ?)
    `);

    const insertAudit = database.prepare(`
      INSERT INTO audit_logs (entity_type, entity_id, event, detail, timestamp)
      VALUES ('TRANSACTION', ?, ?, ?, ?)
    `);

    const seedTxnBatch = database.transaction(() => {
      for (const tx of seedTransactions) {
        insertTx.run(tx);
        const idempStatus = tx.transaction_state === 'CONFIRMED' || tx.transaction_state === 'FAILED'
          ? 'RESOLVED' : 'LOCKED';
        insertIdemp.run(tx.idempotency_key, tx.id, idempStatus, tx.created_at);

        insertAudit.run(
          tx.id,
          'SEEDED_RECORD',
          `Transaction seeded with initial state ${tx.transaction_state}`,
          tx.created_at
        );
      }
    });

    seedTxnBatch();
  }

  // Seed offline passport & merchant journal demo entry if empty
  const passportCount = database.prepare('SELECT COUNT(*) as count FROM offline_passports').get();
  if (passportCount.count === 0) {
    const seedPassport = {
      auth_id: 'AUTH-OFFLINE-78192-20261101',
      sender_id: 'user-ananya@paybastion',
      recipient_id: 'namma-metro-kiosk@axis',
      recipient_name: 'Namma Metro Transit Kiosk',
      amount: 320.00,
      currency: 'INR',
      nonce: 'nonce-c8b18-f2910',
      signature: '7e8b82a819034bc091c71829e102f928a82710192837bc901a',
      created_at: new Date(Date.now() - 20 * 60000).toISOString(),
      expires_at: new Date(Date.now() + 10 * 60000).toISOString(),
      status: 'SETTLEMENT_PENDING'
    };

    database.prepare(`
      INSERT INTO offline_passports (auth_id, sender_id, recipient_id, recipient_name, amount, currency, nonce, signature, created_at, expires_at, status)
      VALUES (@auth_id, @sender_id, @recipient_id, @recipient_name, @amount, @currency, @nonce, @signature, @created_at, @expires_at, @status)
    `).run(seedPassport);
  }

  // Seed credit profile if empty
  const profileCount = database.prepare('SELECT COUNT(*) as count FROM credit_profiles').get();
  if (profileCount.count === 0) {
    const profile = {
      user_id: 'CUST-IN-89210',
      user_name: 'Ananya Sharma',
      credit_limit: 5000,
      utilized_credit: 940,
      available_credit: 4060,
      trust_score: 785,
      eligibility_status: 'ELIGIBLE_FOR_INSTANT_FALLBACK',
      consent_given: 1,
      is_simulation: 1,
      disclaimer: 'DEMONSTRATION ONLY: This is an educational temporary credit fallback simulation. No real money, banking APIs or CIBIL credit bureaus are accessed.',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    database.prepare(`
      INSERT INTO credit_profiles (
        user_id, user_name, credit_limit, utilized_credit, available_credit,
        trust_score, eligibility_status, consent_given, is_simulation, disclaimer,
        created_at, updated_at
      ) VALUES (
        @user_id, @user_name, @credit_limit, @utilized_credit, @available_credit,
        @trust_score, @eligibility_status, @consent_given, @is_simulation, @disclaimer,
        @created_at, @updated_at
      )
    `).run(profile);

    // Seed initial simulated installments
    const installments = [
      {
        id: 'INST-1',
        user_id: 'CUST-IN-89210',
        loan_id: 'CREDIT-BRIDGE-INIT-1',
        installment_id: 'INST-1',
        amount: 470,
        recipient: 'Apollo Pharmacy',
        recipient_name: 'Apollo Pharmacy',
        due_date: 'Nov 08, 2026',
        status: 'PENDING',
        created_at: new Date().toISOString(),
        is_simulation: 1
      },
      {
        id: 'INST-2',
        user_id: 'CUST-IN-89210',
        loan_id: 'CREDIT-BRIDGE-INIT-2',
        installment_id: 'INST-2',
        amount: 470,
        recipient: 'Transit Auto Services',
        recipient_name: 'Transit Auto Services',
        due_date: 'Nov 15, 2026',
        status: 'PENDING',
        created_at: new Date().toISOString(),
        is_simulation: 1
      }
    ];

    const insertCreditTx = database.prepare(`
      INSERT INTO credit_transactions (
        id, user_id, loan_id, installment_id, amount, recipient, recipient_name,
        due_date, status, created_at, is_simulation
      ) VALUES (
        @id, @user_id, @loan_id, @installment_id, @amount, @recipient, @recipient_name,
        @due_date, @status, @created_at, @is_simulation
      )
    `);

    for (const inst of installments) {
      insertCreditTx.run(inst);
    }
  }
}
