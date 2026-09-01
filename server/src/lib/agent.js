/**
 * Agent orchestrator — explicit allowed actions, bounded and gated
 * Financial decisions are deterministic and backend-owned
 */

import { searchCatalog, getProductById } from "./catalog.js";
import { parseIntentWithLLM } from "./intentParser.js";
import { findFeasiblePlans, emiForTenor } from "./emiSolver.js";
import { lenders } from "./lenders.js";
import { computeAffordabilityCeiling } from "./affordability.js";
import { createOrder } from "./merchant.js";

export const ALLOWED_ACTIONS = [
  "SEARCH_CATALOG",
  "COMPARE_PLANS",
  "GENERATE_RECOMMENDATION",
  "CREATE_DRAFT_ORDER",
];

export const REQUIRES_APPROVAL = [
  "CREATE_CHECKOUT",
  "FINAL_PAYMENT",
];

export const DISALLOWED = [
  "BYPASS_AFFORDABILITY",
  "CHANGE_PRICE",
  "INVENT_INVENTORY",
  "CHARGE_WITHOUT_APPROVAL",
  "FABRICATE_PAYMENT",
];

export async function orchestrateAgent({ intentText, affordabilityInputs, selectedProductId }) {
  // Step 1: Parse intent (LLM may help, but deterministic values are validated)
  const intent = await parseIntentWithLLM(intentText || "");
  
  // Step 2: Determine affordability ceiling (backend truth)
  let affordabilityCeiling = null;
  if (affordabilityInputs?.takeHomePay != null) {
    affordabilityCeiling = computeAffordabilityCeiling(affordabilityInputs);
  } else if (intent.targetMonthly != null) {
    // If buyer states monthly budget directly, treat as target
    affordabilityCeiling = intent.targetMonthly;
  }

  // Step 3: Search catalog
  const catalogResults = searchCatalog({
    query: intent.category || intentText,
    category: intent.category,
    maxPrice: intent.maxPrice,
    limit: 6,
  });

  // Step 4: For each product, evaluate feasibility deterministically
  const evaluated = catalogResults.map(product => {
    const target = affordabilityCeiling;
    if (target == null || target <= 0) {
      return { product, feasible: null, reason: "Need affordability to evaluate" };
    }
    const plans = findFeasiblePlans(product.price, target, lenders);
    return {
      product,
      feasible: plans.feasible,
      plans: plans.feasible ? plans.options : null,
      minFeasibleEmi: plans.minFeasibleEmi || null,
      reason: plans.reason || null,
      isBestFit: false,
    };
  });

  // Step 5: Recommend best fit — deterministic ranking (lowest interest, then shortest tenor)
  const feasibleProducts = evaluated.filter(e => e.feasible);
  let bestFit = null;
  if (feasibleProducts.length > 0) {
    // Rank by best plan's total interest
    feasibleProducts.sort((a, b) => a.plans[0].totalInterest - b.plans[0].totalInterest);
    feasibleProducts[0].isBestFit = true;
    bestFit = feasibleProducts[0];
  }

  // Step 6: Generate explanation facts (deterministic)
  const explanation = bestFit
    ? `Found ${feasibleProducts.length} products within your ₹${affordabilityCeiling?.toLocaleString("en-IN")}/mo budget. Best fit is ${bestFit.product.name} at ₹${bestFit.product.price.toLocaleString("en-IN")} — ${bestFit.plans[0].tenorMonths}mo @ ₹${bestFit.plans[0].emi}/mo (lowest interest ₹${bestFit.plans[0].totalInterest}).`
    : `Checked ${catalogResults.length} products against your budget. No product had a feasible plan within ₹${affordabilityCeiling || "unknown"}/mo — the most affordable option needs at least ₹${Math.min(...evaluated.map(e => e.minFeasibleEmi).filter(Boolean))}/mo.`;

  return {
    intent,
    affordabilityCeiling,
    catalogResults: evaluated,
    bestFit,
    explanation,
    allowedActions: ALLOWED_ACTIONS,
    requiresApproval: REQUIRES_APPROVAL,
    disallowed: DISALLOWED,
  };
}

export function validateCheckout({ productId, plan, amount, userApproval }) {
  if (!userApproval) throw new Error("Checkout requires explicit user approval (bounded gate)");
  const product = getProductById(productId);
  if (!product) throw new Error("Product not found");
  if (product.price !== amount) throw new Error(`Amount mismatch: product is ₹${product.price}, got ₹${amount}`);
  if (!plan || !plan.emi || !plan.tenorMonths || !plan.lenderId) throw new Error("Invalid plan — missing emi/tenor/lender");
  
  // Verify plan deterministically — EMI must match solver for that lender/tenor, and tenor must be in lender range
  const lender = lenders.find(l => l.id === plan.lenderId);
  if (!lender) throw new Error(`Lender ${plan.lenderId} not found`);
  if (plan.tenorMonths < lender.minTenor || plan.tenorMonths > lender.maxTenor) {
    throw new Error(`Tenor ${plan.tenorMonths} out of range for ${lender.id} (${lender.minTenor}–${lender.maxTenor})`);
  }
  const expectedEmi = Math.round(emiForTenor(product.price, lender.monthlyRate, plan.tenorMonths) * 100) / 100;
  if (Math.abs(expectedEmi - plan.emi) > 1) {
    throw new Error(`EMI mismatch: expected ₹${expectedEmi} for ${plan.tenorMonths}mo @ ${lender.id}, got ₹${plan.emi}`);
  }
  // Also ensure EMI would have been feasible for some reasonable target (not below interest-only)
  if (plan.emi <= product.price * lender.monthlyRate) {
    throw new Error("EMI below interest-only — not feasible");
  }

  return { valid: true, product, lender };
}

export function createDraftOrder({ productId, plan, buyer, amount }) {
  // Draft — does not charge, requires approval
  const order = createOrder({
    productId,
    plan,
    buyer,
    amount,
    status: "awaiting_approval",
  });
  return {
    action: "CREATE_DRAFT_ORDER",
    orderId: order.id,
    productId,
    plan,
    amount,
    requiresApproval: true,
    order,
  };
}
