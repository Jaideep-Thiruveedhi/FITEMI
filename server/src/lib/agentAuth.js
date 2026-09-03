import crypto from "crypto";

/**
 * agentAuth.js — lightweight HMAC request signing for agent-facing routes
 * Additive on top of existing X-Agent-Id header check — does NOT replace it.
 *
 * For hackathon scope: single demo shared secret via env var AGENT_SHARED_SECRET.
 * Production would use per-agent keys issued at registration (e.g. per-agent
 * HMAC secrets or asymmetric keys, mTLS client certs, OAuth client credentials)
 * — not one shared secret. See API_SCHEMA.md and ARCHITECTURE.md.
 */

const REPLAY_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

function getSharedSecret() {
  const s = process.env.AGENT_SHARED_SECRET;
  if (!s || String(s).trim() === "") return null;
  return String(s);
}

/**
 * Build canonical string for HMAC.
 * Format (newline-delimited, deterministic):
 *   METHOD\nPATH\nX-Agent-Id\nBODY_JSON\nX-Agent-Timestamp
 * - METHOD: uppercased (e.g. POST)
 * - PATH: request originalUrl without query (e.g. /api/agent/parse)
 * - X-Agent-Id: header value (trimmed)
 * - BODY_JSON: JSON.stringify(req.body) if body is object with keys, else "" or string body
 * - X-Agent-Timestamp: header value (trimmed)
 *
 * Both client and server must use identical format.
 */
export function buildCanonicalString(req) {
  const method = (req.method || "").toUpperCase();
  // Prefer originalUrl (e.g. /api/agent/parse) to be stable across mount points
  const rawPath = req.originalUrl || req.url || req.path || "";
  const path = rawPath.split("?")[0];
  const agentId = String(req.headers["x-agent-id"] || req.headers["X-Agent-Id"] || "").trim();
  const timestamp = String(req.headers["x-agent-timestamp"] || req.headers["X-Agent-Timestamp"] || "").trim();

  let bodyString = "";
  if (req.body != null) {
    if (typeof req.body === "string") {
      bodyString = req.body;
    } else if (typeof req.body === "object") {
      const keys = Object.keys(req.body);
      if (keys.length > 0) {
        // Use JSON.stringify with stable key order as sent; for demo this is sufficient
        // Note: Express parses JSON, so we re-stringify. Client must also use JSON.stringify on the same object.
        bodyString = JSON.stringify(req.body);
      } else {
        bodyString = "";
      }
    }
  } else if (req.rawBody) {
    bodyString = String(req.rawBody);
  }

  return `${method}\n${path}\n${agentId}\n${bodyString}\n${timestamp}`;
}

/**
 * Compute HMAC-SHA256 hex digest for a canonical string using secret.
 */
export function computeHmacHex(canonical, secret) {
  return crypto.createHmac("sha256", secret).update(canonical, "utf8").digest("hex");
}

/**
 * Verify agent signature.
 * - Requires AGENT_SHARED_SECRET to be set; if not set, caller should fallback to X-Agent-Id only (not call this)
 * - Requires headers X-Agent-Id, X-Agent-Timestamp, X-Agent-Signature
 * - Checks timestamp freshness (not more than 5 min old, not in future)
 * - Computes expected HMAC over canonical string and compares via crypto.timingSafeEqual
 *
 * @param {import("express").Request} req
 * @returns {{ valid: boolean, error?: string }}
 */
export function verifyAgentSignature(req) {
  const secret = getSharedSecret();
  if (!secret) {
    return { valid: false, error: "AGENT_SHARED_SECRET not configured" };
  }

  const agentId = req.headers["x-agent-id"];
  const timestampHeader = req.headers["x-agent-timestamp"];
  const signatureHeader = req.headers["x-agent-signature"];

  if (!agentId || String(agentId).trim() === "") {
    return { valid: false, error: "X-Agent-Id header required" };
  }
  if (!timestampHeader || String(timestampHeader).trim() === "") {
    return { valid: false, error: "X-Agent-Timestamp header required when AGENT_SHARED_SECRET is set" };
  }
  if (!signatureHeader || String(signatureHeader).trim() === "") {
    return { valid: false, error: "X-Agent-Signature header required when AGENT_SHARED_SECRET is set" };
  }

  const timestampStr = String(timestampHeader).trim();
  const timestampMs = Number(timestampStr);
  // Allow timestamp as milliseconds since epoch (as sent by demo) or seconds
  let ts = timestampMs;
  let isSeconds = false;
  if (!Number.isFinite(ts)) {
    // Try parsing as ISO date
    const d = Date.parse(timestampStr);
    if (!Number.isNaN(d)) {
      ts = d;
    } else {
      return { valid: false, error: "Invalid X-Agent-Timestamp" };
    }
  } else {
    // Heuristic: if timestamp looks like seconds (10 digits) vs ms (13 digits), convert
    if (String(timestampStr).length === 10) {
      ts = ts * 1000;
      isSeconds = true;
    }
  }

  const now = Date.now();
  // Reject if more than 5 minutes old
  if (ts < now - REPLAY_WINDOW_MS) {
    return { valid: false, error: "X-Agent-Timestamp too old — possible replay (more than 5 minutes)" };
  }
  // Reject if in the future (allow 30s clock skew to avoid false positives from slight client/server drift)
  // Spec says "in the future" — we are strict but allow small skew
  const clockSkewMs = 30 * 1000;
  if (ts > now + clockSkewMs) {
    return { valid: false, error: "X-Agent-Timestamp in the future — possible replay" };
  }

  const canonical = buildCanonicalString(req);
  const expectedHex = computeHmacHex(canonical, secret);
  const actualHex = String(signatureHeader).trim().toLowerCase();

  // Use constant-time comparison — not ===
  try {
    const expectedBuf = Buffer.from(expectedHex, "hex");
    const actualBuf = Buffer.from(actualHex, "hex");
    // If lengths differ, still do a dummy timingSafeEqual to avoid early return timing leak
    if (expectedBuf.length !== actualBuf.length) {
      // Do a dummy compare of same length to keep timing similar, then fail
      const dummy = Buffer.alloc(expectedBuf.length, 0);
      try { crypto.timingSafeEqual(dummy, expectedBuf); } catch {}
      return { valid: false, error: "Invalid signature" };
    }
    const equal = crypto.timingSafeEqual(expectedBuf, actualBuf);
    if (!equal) {
      return { valid: false, error: "Invalid signature" };
    }
  } catch (e) {
    return { valid: false, error: "Invalid signature" };
  }

  return { valid: true };
}

export function isSignatureVerificationEnabled() {
  return !!getSharedSecret();
}

export { REPLAY_WINDOW_MS };
