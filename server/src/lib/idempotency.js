/**
 * Idempotency store — in-memory key→response with TTL
 * Used by POST /api/checkout/create-order and POST /api/agent/draft-order
 * Clean addition: does not touch EMI solver, checkout core logic, or audit hash chain
 */

const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours — reasonable TTL, keeps memory bounded
const store = new Map(); // key -> { status, body, expiresAt }

/**
 * Extract idempotency key from request.
 * Accepts optional Idempotency-Key header (case-insensitive via Express lowercasing).
 * Also reuses existing requestId if one already flows through via X-Request-Id / Request-Id header.
 * Returns null if no key present (then request is not idempotent).
 */
export function getIdempotencyKey(req) {
  const h = req.headers || {};
  // Express lowercases all header names, but check both forms defensively
  const raw =
    h['idempotency-key'] ||
    h['x-idempotency-key'] ||
    h['idempotency_key'] ||
    h['x-request-id'] ||
    h['request-id'] ||
    h['requestid'] ||
    null;
  if (raw == null || raw === '') return null;
  const key = String(raw).trim();
  return key.length ? key : null;
}

/**
 * Build a scoped store key so the same Idempotency-Key on different routes
 * does not collide. Includes method + baseUrl/path.
 */
export function buildStoreKey(req, idempotencyKey) {
  // req.originalUrl includes query, but we want route-specific
  // Use method + route path + key
  const route = req.originalUrl ? req.originalUrl.split('?')[0] : (req.baseUrl + req.path);
  // For our two routes, this will be distinct: /api/checkout/create-order vs /api/agent/draft-order
  return `${req.method}:${route}:${idempotencyKey}`;
}

export function getCachedResponse(storeKey) {
  const entry = store.get(storeKey);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    store.delete(storeKey);
    return null;
  }
  return entry;
}

export function setCachedResponse(storeKey, status, body) {
  // Clone body shallow to avoid later mutation
  let cloned;
  try {
    cloned = JSON.parse(JSON.stringify(body));
  } catch {
    cloned = body;
  }
  store.set(storeKey, {
    status,
    body: cloned,
    expiresAt: Date.now() + TTL_MS,
  });
  // Opportunistic cleanup of expired entries (bounded by store size)
  if (store.size > 1000) {
    const now = Date.now();
    for (const [k, v] of store.entries()) {
      if (now > v.expiresAt) store.delete(k);
    }
  }
}

// For testing / introspection
export function _clearStore() {
  store.clear();
}

export function _storeSize() {
  return store.size;
}

export { store, TTL_MS };
