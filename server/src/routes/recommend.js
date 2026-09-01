import express from "express";
import { findFeasiblePlans } from "../lib/emiSolver.js";
import { lenders } from "../lib/lenders.js";
import { computeAffordabilityCeiling, validateAffordabilityInputs } from "../lib/affordability.js";
import { explainRecommendation, askAffordabilityQuestions } from "../lib/llmAdvisor.js";
import { appendAuditLog } from "../lib/auditLog.js";

const router = express.Router();

/**
 * POST /api/recommend
 * Body: { itemPrice, targetMonthlyPayment?, takeHomePay?, existingObligations?, otherExpenses?, conversationHistory? }
 *
 * Two modes:
 * 1) Direct: itemPrice + targetMonthlyPayment provided -> solve immediately
 * 2) Affordability-assisted: affordability inputs or conversation -> compute ceiling -> solve
 */
router.post("/", async (req, res) => {
  const startedAt = Date.now();
  let auditEntry = {
    endpoint: "/api/recommend",
    requestBody: req.body,
    result: null,
    error: null,
    feasible: null,
  };

  try {
    const { itemPrice, targetMonthlyPayment, takeHomePay, existingObligations, otherExpenses, conversationHistory } = req.body;

    // --- Validation: itemPrice ---
    if (itemPrice == null) {
      const err = "itemPrice is required.";
      auditEntry.error = err;
      appendAuditLog(auditEntry);
      return res.status(400).json({ error: err });
    }
    if (typeof itemPrice !== "number" || isNaN(itemPrice)) {
      const err = "itemPrice must be a number.";
      auditEntry.error = err;
      appendAuditLog(auditEntry);
      return res.status(400).json({ error: err });
    }
    if (itemPrice <= 0) {
      const err = "itemPrice must be greater than 0.";
      auditEntry.error = err;
      appendAuditLog(auditEntry);
      return res.status(400).json({ error: err });
    }

    let effectiveTarget = targetMonthlyPayment;
    let affordabilityCeiling = null;
    let quizResult = null;

    // If affordability inputs provided, compute ceiling
    const hasAffordabilityInputs = takeHomePay != null || existingObligations != null;
    const hasConversation = Array.isArray(conversationHistory) && conversationHistory.length > 0;

    if (hasConversation) {
      // Conversation-based affordability flow
      const quizResponse = await askAffordabilityQuestions(conversationHistory);
      if (!quizResponse.isComplete) {
        auditEntry.result = "quiz_incomplete";
        appendAuditLog(auditEntry);
        return res.json({
          quizInProgress: true,
          nextQuestion: quizResponse.nextQuestion,
          collected: quizResponse.collected,
        });
      }
      // Quiz complete
      affordabilityCeiling = quizResponse.affordabilityCeiling;
      effectiveTarget = affordabilityCeiling;
      quizResult = quizResponse;
    } else if (hasAffordabilityInputs) {
      // Direct affordability inputs
      const validation = validateAffordabilityInputs({ takeHomePay, existingObligations, otherExpenses });
      if (!validation.valid) {
        auditEntry.error = validation.error;
        appendAuditLog(auditEntry);
        return res.status(400).json({ error: validation.error });
      }
      affordabilityCeiling = computeAffordabilityCeiling({ takeHomePay, existingObligations, otherExpenses });
      // If targetMonthlyPayment also provided, cap it at affordability ceiling (bounded & gated)
      if (effectiveTarget != null) {
        if (typeof effectiveTarget !== "number" || isNaN(effectiveTarget)) {
          const err = "targetMonthlyPayment must be a number.";
          auditEntry.error = err;
          appendAuditLog(auditEntry);
          return res.status(400).json({ error: err });
        }
        if (effectiveTarget > affordabilityCeiling) {
          effectiveTarget = affordabilityCeiling;
        }
      } else {
        effectiveTarget = affordabilityCeiling;
      }
    }

    // Validate effectiveTarget
    if (effectiveTarget == null) {
      const err = "Provide either targetMonthlyPayment or affordability details (takeHomePay + existingObligations).";
      auditEntry.error = err;
      appendAuditLog(auditEntry);
      return res.status(400).json({ error: err });
    }
    if (typeof effectiveTarget !== "number" || isNaN(effectiveTarget)) {
      const err = "targetMonthlyPayment must be a number.";
      auditEntry.error = err;
      appendAuditLog(auditEntry);
      return res.status(400).json({ error: err });
    }
    if (effectiveTarget <= 0) {
      const err = "Monthly budget must be greater than 0. Based on your affordability inputs, there is no room for additional EMI.";
      auditEntry.error = err;
      appendAuditLog(auditEntry);
      return res.status(400).json({ error: err });
    }

    // --- Hard ceiling enforcement ---
    if (affordabilityCeiling != null && effectiveTarget > affordabilityCeiling) {
      effectiveTarget = affordabilityCeiling;
    }

    // --- Solve ---
    const solverResult = findFeasiblePlans(itemPrice, effectiveTarget, lenders);

    // --- Explain via LLM layer ---
    const explanation = await explainRecommendation(solverResult, {
      itemPrice,
      targetMonthlyPayment: effectiveTarget,
      affordabilityCeiling,
    });

    const responsePayload = {
      feasible: solverResult.feasible,
      itemPrice,
      targetMonthlyPayment: effectiveTarget,
      affordabilityCeiling,
      ...(solverResult.feasible
        ? { options: solverResult.options }
        : { reason: solverResult.reason }),
      explanation,
      quizResult,
      meta: {
        lendersConsidered: lenders.length,
        solveTimeMs: Date.now() - startedAt,
      },
    };

    auditEntry.feasible = solverResult.feasible;
    auditEntry.result = solverResult.feasible ? "feasible" : "not_feasible";
    auditEntry.effectiveTarget = effectiveTarget;
    auditEntry.affordabilityCeiling = affordabilityCeiling;
    appendAuditLog(auditEntry);

    return res.json(responsePayload);
  } catch (err) {
    console.error("[/api/recommend] error:", err);
    auditEntry.error = err.message || "Internal server error";
    appendAuditLog(auditEntry);
    return res.status(500).json({ error: "Internal server error. Please try again." });
  }
});

/**
 * POST /api/recommend/quiz
 * Dedicated quiz endpoint for step-by-step affordability Q&A.
 * Body: { conversationHistory: Array<{role, content, data?}> }
 */
router.post("/quiz", async (req, res) => {
  try {
    const { conversationHistory } = req.body;
    if (!Array.isArray(conversationHistory)) {
      return res.status(400).json({ error: "conversationHistory must be an array." });
    }
    const result = await askAffordabilityQuestions(conversationHistory);
    return res.json(result);
  } catch (err) {
    console.error("[/api/recommend/quiz] error:", err);
    return res.status(500).json({ error: "Internal server error." });
  }
});

export default router;
