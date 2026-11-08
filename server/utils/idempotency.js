/**
 * Idempotency Key Manager
 * Ensures duplicate incoming requests return consistent original responses
 * and prevents double-debits / concurrent execution.
 */

const memoryLocks = new Map();

export const idempotencyManager = {
  /**
   * Attempt to acquire an execution lock for an idempotency key.
   * Returns true if locked acquired, false if already in-flight.
   */
  acquireLock: (key, ttlMs = 15000) => {
    if (!key) return true;
    const now = Date.now();
    const existing = memoryLocks.get(key);

    if (existing && existing.status === 'LOCKED' && now < existing.expiresAt) {
      return false; // Still processing
    }

    memoryLocks.set(key, {
      status: 'LOCKED',
      createdAt: now,
      expiresAt: now + ttlMs,
    });
    return true;
  },

  /**
   * Release lock upon failure or timeout
   */
  releaseLock: (key) => {
    if (!key) return;
    memoryLocks.delete(key);
  },

  /**
   * Store cached response for resolved idempotency key
   */
  resolveKey: (key, payload) => {
    if (!key) return;
    memoryLocks.set(key, {
      status: 'RESOLVED',
      payload,
      createdAt: Date.now(),
      expiresAt: Date.now() + 24 * 60 * 60 * 1000, // 24 hours
    });
  },

  /**
   * Retrieve cached response if key was already resolved
   */
  getCachedResponse: (key) => {
    if (!key) return null;
    const entry = memoryLocks.get(key);
    if (entry && entry.status === 'RESOLVED') {
      return entry.payload;
    }
    return null;
  },

  /**
   * Clear all entries (for testing)
   */
  clear: () => {
    memoryLocks.clear();
  }
};

export default idempotencyManager;
