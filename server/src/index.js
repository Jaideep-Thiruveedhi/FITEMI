import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import recommendRouter from "./routes/recommend.js";
import { readAuditLog } from "./lib/auditLog.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from server/.env and also root .env
dotenv.config({ path: path.join(__dirname, "../.env") });
dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

// Health
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Recommend
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

// Serve client in production (if built)
const clientDist = path.join(__dirname, "../../client/dist");
app.use(express.static(clientDist));

// 404 fallback for API
app.use("/api", (req, res) => {
  res.status(404).json({ error: "API route not found." });
});

app.listen(PORT, () => {
  console.log(`EMI Agent server running on http://localhost:${PORT}`);
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log("  (ANTHROPIC_API_KEY not set — LLM advisor will use deterministic fallback)");
  } else {
    console.log("  (Anthropic API key configured)");
  }
});
