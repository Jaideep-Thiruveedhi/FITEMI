import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const AUDIT_LOG_PATH = path.join(__dirname, "../../data/audit.log");
const GENESIS_PREV_HASH = "GENESIS";

// Ensure directory exists for fresh clone
try {
  fs.mkdirSync(path.dirname(AUDIT_LOG_PATH), { recursive: true });
  const gitkeep = path.join(path.dirname(AUDIT_LOG_PATH), ".gitkeep");
  if (!fs.existsSync(gitkeep)) {
    // .gitkeep is repo-tracked; don't overwrite if exists
  }
  if (!fs.existsSync(AUDIT_LOG_PATH)) {
    fs.writeFileSync(AUDIT_LOG_PATH, "", "utf-8");
  }
} catch (e) {
  // non-fatal
}

function sanitize(obj) {
  if (!obj || typeof obj !== "object") return obj;
  const clone = { ...obj };
  for (const key of Object.keys(clone)) {
    if (/key|secret|token|password|api/i.test(key)) {
      clone[key] = "[REDACTED]";
    }
  }
  return clone;
}

function computeHash(cleanEntry, prevHash) {
  // Deterministic: hash of canonical JSON of entry without hash fields + prevHash
  return crypto.createHash("sha256").update(JSON.stringify(cleanEntry) + prevHash).digest("hex");
}

export function appendAuditLog(entry) {
  try {
    fs.mkdirSync(path.dirname(AUDIT_LOG_PATH), { recursive: true });
  } catch {}
  // Build entry without hash fields first
  const baseEntry = {
    timestamp: new Date().toISOString(),
    ...entry,
  };
  // Determine prevHash by recomputing chain (handles legacy entries without hash)
  let prevHash = GENESIS_PREV_HASH;
  try {
    if (fs.existsSync(AUDIT_LOG_PATH)) {
      const content = fs.readFileSync(AUDIT_LOG_PATH, "utf-8").trim();
      if (content) {
        const lines = content.split("\n");
        let rolling = GENESIS_PREV_HASH;
        for (const line of lines) {
          try {
            const e = JSON.parse(line);
            if (e.hash && e.prevHash) {
              // Proper hashed entry — its hash is the chain tip if consistent, otherwise use stored hash
              rolling = e.hash;
            } else {
              const { hash: _h, prevHash: _ph, ...clean } = e;
              const computed = computeHash(clean, rolling);
              rolling = e.hash || computed;
            }
          } catch {
            // unparseable line — keep rolling
          }
        }
        prevHash = rolling;
      }
    }
  } catch {}
  // Compute hash for new entry (exclude hash/prevHash from hash input)
  const { hash: _h, prevHash: _ph, ...cleanForHash } = baseEntry;
  const hash = computeHash(cleanForHash, prevHash);
  const line = JSON.stringify({
    ...baseEntry,
    prevHash,
    hash,
  }) + "\n";
  fs.appendFileSync(AUDIT_LOG_PATH, line, "utf-8");
}

export function readAuditLog() {
  if (!fs.existsSync(AUDIT_LOG_PATH)) return [];
  const content = fs.readFileSync(AUDIT_LOG_PATH, "utf-8").trim();
  if (!content) return [];
  return content.split("\n").map((line) => {
    try {
      return JSON.parse(line);
    } catch {
      return { raw: line };
    }
  });
}

export function verifyAuditLog() {
  const entries = readAuditLog();
  if (entries.length === 0) return { intact: true, count: 0, verifiedEntries: 0, entriesChecked: 0 };
  let prevHash = GENESIS_PREV_HASH;
  let verifiedEntries = 0;
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (entry.raw) {
      return { intact: false, count: entries.length, verifiedEntries, entriesChecked: entries.length, brokenAt: i, brokenAtIndex: i, reason: "unparseable line" };
    }
    // Entries without hash are considered legacy — compute and chain but not verified
    if (!entry.hash || !entry.prevHash) {
      const { hash: _h, prevHash: _ph, ...clean } = entry;
      const computed = computeHash(clean, prevHash);
      // If no hash stored, treat as not verifiable but continue chain using computed
      prevHash = entry.hash || computed;
      continue;
    }
    if (entry.prevHash !== prevHash) {
      return { intact: false, count: entries.length, verifiedEntries, entriesChecked: entries.length, brokenAt: i, brokenAtIndex: i, expectedPrevHash: prevHash, actualPrevHash: entry.prevHash };
    }
    const { hash: storedHash, prevHash: storedPrev, ...clean } = entry;
    const computed = computeHash(clean, storedPrev);
    if (computed !== storedHash) {
      return { intact: false, count: entries.length, verifiedEntries, entriesChecked: entries.length, brokenAt: i, brokenAtIndex: i, expectedHash: computed, actualHash: storedHash };
    }
    prevHash = storedHash;
    verifiedEntries++;
  }
  return { intact: true, count: entries.length, verifiedEntries, entriesChecked: entries.length, prevHash };
}

/**
 * Audit middleware — logs every request with requestId, method, path, status, duration
 * Prefer middleware over manual per-route logging.
 */
export function auditMiddleware(req, res, next) {
  const requestId = `req_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`;
  req.requestId = requestId;
  const start = Date.now();

  // Capture response body for feasible/result without logging sensitive payloads
  let responseBody;
  const originalJson = res.json.bind(res);
  res.json = (body) => {
    responseBody = body;
    return originalJson(body);
  };

  res.on("finish", () => {
    const durationMs = Date.now() - start;
    const entry = {
      timestamp: new Date().toISOString(),
      requestId,
      method: req.method,
      path: req.originalUrl || req.url,
      status: res.statusCode,
      durationMs,
    };
    // Add sanitized, minimal business outcome (feasible/error) without full financial payload
    if (responseBody && typeof responseBody === "object") {
      if ("feasible" in responseBody) entry.feasible = responseBody.feasible;
      if (responseBody.error) entry.error = responseBody.error;
      if (responseBody.targetMonthlyPayment != null) entry.targetMonthlyPayment = responseBody.targetMonthlyPayment;
      if (responseBody.affordabilityCeiling != null) entry.affordabilityCeiling = responseBody.affordabilityCeiling;
      if (responseBody.minFeasibleEmi != null) entry.minFeasibleEmi = responseBody.minFeasibleEmi;
    }
    // Include sanitized query/body for debug without secrets (opt-in, minimal)
    if (req.body && Object.keys(req.body).length > 0) {
      // Only log itemPrice presence, not full obligations, to avoid sensitive payload
      const sanitized = sanitize(req.body);
      // Keep only non-sensitive keys at top level, but truncate to avoid leaking
      entry.requestSummary = {
        hasItemPrice: sanitized.itemPrice != null,
        hasTarget: sanitized.targetMonthlyPayment != null,
        hasAffordabilityInputs: sanitized.takeHomePay != null || sanitized.existingObligations != null,
      };
    }
    try {
      appendAuditLog(entry);
    } catch (e) {
      console.error("[audit] failed to write", e.message);
    }
  });

  next();
}

export { AUDIT_LOG_PATH, GENESIS_PREV_HASH, computeHash };
