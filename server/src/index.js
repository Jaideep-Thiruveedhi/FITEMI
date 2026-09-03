import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import recommendRouter from "./routes/recommend.js";
import catalogRouter from "./routes/catalog.js";
import agentRouter from "./routes/agent.js";
import checkoutRouter from "./routes/checkout.js";
import merchantRouter from "./routes/merchant.js";
import { readAuditLog, verifyAuditLog, auditMiddleware } from "./lib/auditLog.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from repo root, then server/.env, then cwd — root is the single source of truth
dotenv.config({ path: path.join(__dirname, "../../.env") });
dotenv.config({ path: path.join(__dirname, "../.env") });
dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

// Audit middleware — logs every request with requestId, duration, sanitized summary
app.use(auditMiddleware);

// Health
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Catalog & Agent & Checkout & Merchant (agentic commerce)
app.use("/api/catalog", catalogRouter);
app.use("/api/agent", agentRouter);
app.use("/api/checkout", checkoutRouter);
app.use("/api/merchant", merchantRouter);

// Recommend (legacy EMI path, preserved)
app.use("/api/recommend", recommendRouter);

// Audit log (nice-to-have debug endpoint)
app.get("/api/audit", (req, res) => {
  try {
    const entries = readAuditLog();
    res.json({ count: entries.length, entries });
  } catch (err) {
    res.status(500).json({ error: "Failed to read audit log." });
  }
});

app.get("/api/audit/verify", (req, res) => {
  try {
    const result = verifyAuditLog();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: "Failed to verify audit log.", details: err.message });
  }
});

// Serve client in production (if built)
const clientDist = path.join(__dirname, "../../client/dist");
app.use(express.static(clientDist));

// 404 fallback for API
app.use("/api", (req, res) => {
  res.status(404).json({ error: "API route not found." });
});

app.listen(PORT, () => {
  console.log(`FITEMI server running on http://localhost:${PORT}`);
  console.log(`  Catalog: ${PORT ? 'ready' : '—'} | EMI solver: deterministic | Audit: middleware`);
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log("  (ANTHROPIC_API_KEY not set — LLM advisor will use deterministic fallback)");
  } else {
    console.log("  (Anthropic API key configured)");
  }
  if (!process.env.RAZORPAY_KEY_ID) {
    console.log("  (RAZORPAY_KEY_ID not set — checkout will use simulated test-mode)");
  } else {
    console.log("  (Razorpay test-mode configured)");
  }
});
