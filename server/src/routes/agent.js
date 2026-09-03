import express from "express";
import { orchestrateAgent, validateCheckout, createDraftOrder } from "../lib/agent.js";
import { parseIntentWithLLM } from "../lib/intentParser.js";
import { getIdempotencyKey, buildStoreKey, getCachedResponse, setCachedResponse } from "../lib/idempotency.js";
import { verifyAgentSignature, isSignatureVerificationEnabled } from "../lib/agentAuth.js";

const router = express.Router();

// Lightweight agent-identity + optional HMAC signing — additive, does not weaken X-Agent-Id check
// - Always requires X-Agent-Id (identity attribution for audit, logged alongside requestId)
// - If AGENT_SHARED_SECRET is set, also requires X-Agent-Signature + X-Agent-Timestamp and verifies HMAC-SHA256
//   over canonical (method+path+X-Agent-Id+body+timestamp) with timingSafeEqual and 5m replay window.
//   This is NOT production-grade auth — it proves caller holds the shared secret and request wasn't replayed,
//   but production would use per-agent keys (mTLS/OAuth) — see API_SCHEMA.md. If secret not set, falls back to
//   X-Agent-Id only with a startup warning (not silent).
if (!isSignatureVerificationEnabled()) {
  console.warn("[agentAuth] AGENT_SHARED_SECRET not set — signature verification DISABLED, using X-Agent-Id only (demo). Production would require per-agent keys (mTLS/OAuth) — see API_SCHEMA.md and ARCHITECTURE.md");
}

router.use((req, res, next) => {
  const agentId = req.headers["x-agent-id"];
  if (!agentId || String(agentId).trim() === "") {
    return res.status(401).json({ error: "X-Agent-Id header required — identity attribution for audit purposes" });
  }
  req.agentId = String(agentId).trim();

  if (isSignatureVerificationEnabled()) {
    const result = verifyAgentSignature(req);
    if (!result.valid) {
      // Clear error message for client — mismatch or replay
      return res.status(401).json({ error: result.error || "Invalid agent signature" });
    }
  }
  next();
});

// POST /api/agent/parse — parse natural language intent
router.post("/parse", async (req, res) => {
  const { text } = req.body;
  if (!text || typeof text !== "string") return res.status(400).json({ error: "text is required" });
  const intent = await parseIntentWithLLM(text);
  res.json({ intent });
});

// POST /api/agent/orchestrate — full AI buyer mode
router.post("/orchestrate", async (req, res) => {
  const { intentText, affordabilityInputs, selectedProductId } = req.body;
  try {
    const result = await orchestrateAgent({ intentText, affordabilityInputs, selectedProductId });
    res.json(result);
  } catch (e) {
    console.error("[agent/orchestrate]", e);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/agent/draft-order — bounded: creates draft, requires no payment yet
router.post("/draft-order", (req, res) => {
  const idempotencyKey = getIdempotencyKey(req);
  const storeKey = idempotencyKey ? buildStoreKey(req, idempotencyKey) : null;
  if (storeKey) {
    const cached = getCachedResponse(storeKey);
    if (cached) {
      return res.status(cached.status).json(cached.body);
    }
  }
  const { productId, plan, buyer, amount } = req.body;
  try {
    if (!productId || !plan || !amount) return res.status(400).json({ error: "productId, plan, amount required" });
    const draft = createDraftOrder({ productId, plan, buyer: buyer || {}, amount });
    if (storeKey) setCachedResponse(storeKey, 200, draft);
    res.json(draft);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// POST /api/agent/validate-checkout — guardrail check before payment
router.post("/validate-checkout", (req, res) => {
  const { productId, plan, amount, userApproval } = req.body;
  try {
    const result = validateCheckout({ productId, plan, amount, userApproval });
    res.json({ valid: true, ...result });
  } catch (e) {
    res.status(400).json({ valid: false, error: e.message });
  }
});

export default router;
