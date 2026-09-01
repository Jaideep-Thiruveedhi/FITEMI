import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const AUDIT_LOG_PATH = path.join(__dirname, "../../data/audit.log");

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

export function appendAuditLog(entry) {
  try {
    fs.mkdirSync(path.dirname(AUDIT_LOG_PATH), { recursive: true });
  } catch {}
  const line = JSON.stringify({
    timestamp: new Date().toISOString(),
    ...entry,
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

export { AUDIT_LOG_PATH };
