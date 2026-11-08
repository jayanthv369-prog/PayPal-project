/**
 * Centralized API Client for PayBastion Platform
 * Handles timeouts, JSON serialization, Vite proxying, and consistent errors
 */

const API_TIMEOUT_MS = 12000;

async function request(endpoint, options = {}) {
  const url = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), options.timeout || API_TIMEOUT_MS);

  const token = typeof window !== 'undefined' ? localStorage.getItem('paybastion_token') : null;
  const authHeader = token ? { 'Authorization': `Bearer ${token}` } : {};

  try {
    const res = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...authHeader,
        ...(options.headers || {}),
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const contentType = res.headers.get('content-type') || '';
    const isJson = contentType.includes('application/json');
    const data = isJson ? await res.json() : await res.text();

    if (!res.ok) {
      const errorMsg = (isJson && (data?.message || data?.error)) || res.statusText || 'Request failed';
      const error = new Error(errorMsg);
      error.status = res.status;
      error.data = data;
      throw error;
    }

    return data;
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      const timeoutError = new Error(`Request to ${url} timed out after ${options.timeout || API_TIMEOUT_MS}ms`);
      timeoutError.isTimeout = true;
      throw timeoutError;
    }
    throw err;
  }
}

export const api = {
  // Health
  checkHealth: () => request('/api/health'),

  // Authentication
  register: (data) => request('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  login: (data) => request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  logout: () => request('/api/auth/logout', {
    method: 'POST',
  }),
  getMe: () => request('/api/auth/me'),

  // Wallet Management
  getWalletBalance: () => request('/api/wallet/balance'),
  setWalletPin: (pin) => request('/api/wallet/set-pin', {
    method: 'POST',
    body: JSON.stringify({ pin }),
  }),
  verifyWalletPin: (pin) => request('/api/wallet/verify-pin', {
    method: 'POST',
    body: JSON.stringify({ pin }),
  }),
  addDemoFunds: (amount) => request('/api/wallet/add-demo-funds', {
    method: 'POST',
    body: JSON.stringify({ amount }),
  }),
  walletTransfer: (data) => request('/api/wallet/transfer', {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  getWalletTransactions: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/api/wallet/transactions${qs ? `?${qs}` : ''}`);
  },
  getWalletReceipt: (txnId) => request(`/api/wallet/receipt/${txnId}`),

  // Dashboard & Transactions
  fetchDashboardStats: () => request('/api/dashboard/stats'),
  fetchTransactions: (params = {}) => {
    const query = new URLSearchParams();
    if (params.page) query.set('page', params.page);
    if (params.limit) query.set('limit', params.limit);
    if (params.state) query.set('state', params.state);
    if (params.search) query.set('search', params.search);
    const qs = query.toString();
    return request(`/api/transactions${qs ? `?${qs}` : ''}`);
  },
  fetchTransactionById: (id) => request(`/api/transactions/${id}`),
  createTransaction: (data) => request('/api/transactions', {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  retryTransaction: (id, data = {}) => request(`/api/transactions/${encodeURIComponent(id)}/retry`, {
    method: 'POST',
    body: JSON.stringify(data),
  }),

  // Smart Recovery
  registerRecoveryTransaction: (data) => request('/api/recovery/register', {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  reconcileTransaction: (data) => request('/api/recovery/reconcile', {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  fetchPendingRecovery: () => request('/api/recovery/pending'),

  // Offline Passport
  signOfflinePassport: (data) => request('/api/offline/sign', {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  verifyOfflinePassport: (data) => request('/api/offline/verify', {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  fetchOfflinePassports: () => request('/api/offline/passports'),
  fetchMerchantJournal: () => request('/api/offline/journal'),
  resetOfflineReplayCache: () => request('/api/offline/reset-replay-cache', {
    method: 'POST',
  }),

  // AI & Voice
  explainState: (data) => request('/api/ai/explain-state', {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  parseVoice: (data) => request('/api/ai/parse-voice', {
    method: 'POST',
    body: JSON.stringify(data),
  }),

  // Scam Guardian
  analyzeScam: (data) => request('/api/scam-guardian/analyze', {
    method: 'POST',
    body: JSON.stringify(data),
  }),

  // Credit Bridge (Simulation)
  fetchCreditProfile: (userId) => {
    const query = userId ? `?userId=${encodeURIComponent(userId)}` : '';
    return request(`/api/credit/profile${query}`);
  },
  activateCreditBridge: (data) => request('/api/credit/activate', {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  repayCreditInstallment: (data) => request('/api/credit/repay', {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  fetchCreditTransactions: (userId) => {
    const query = userId ? `?userId=${encodeURIComponent(userId)}` : '';
    return request(`/api/credit/transactions${query}`);
  },

  // Crash Lab Simulation
  runSimulationScenario: (scenarioId, params = {}) => request('/api/simulation/scenario', {
    method: 'POST',
    body: JSON.stringify({ scenarioId, params }),
  }),

  // PayPal Sandbox
  createPayPalOrder: (data) => request('/api/paypal/create-order', {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  capturePayPalOrder: (orderId) => request('/api/paypal/capture-order', {
    method: 'POST',
    body: JSON.stringify({ orderId }),
  }),
  getPayPalStatus: (orderId) => request(`/api/paypal/status/${orderId}`),
};

export default api;
