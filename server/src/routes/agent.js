import express from "express";
import { orchestrateAgent, validateCheckout, createDraftOrder } from "../lib/agent.js";
import { parseIntentWithLLM } from "../lib/intentParser.js";

const router = express.Router();

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
  const { productId, plan, buyer, amount } = req.body;
  try {
    if (!productId || !plan || !amount) return res.status(400).json({ error: "productId, plan, amount required" });
    const draft = createDraftOrder({ productId, plan, buyer: buyer || {}, amount });
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
