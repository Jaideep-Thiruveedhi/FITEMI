/**
 * agentBuyerDemo.js — EXTERNAL autonomous AI buyer agent
 * Not FITEMI's frontend. A third-party agent calling FITEMI's public API.
 * Genuinely separate Node process: does NOT import any FITEMI internals,
 * only calls HTTP endpoints via fetch.
 *
 * Walks full flow with transcript: orchestrate -> recommend -> draft-order -> validate-checkout -> create-order
 * Demonstrates ALLOWED / REQUIRES_APPROVAL / DISALLOWED action model.
 *
 * Usage:
 *   node server/scripts/agentBuyerDemo.js --budget=5000 --item="laptop"
 *   node server/scripts/agentBuyerDemo.js --query "laptop around 60000" --budget 5000
 *   node server/scripts/agentBuyerDemo.js --budget 5000 --item laptop
 *   npm run demo:agent -- --query "phone under 30000" --budget 4000
 *   npm run demo:agent -- --budget=5000 --item="laptop"
 *   Budget is interpreted as targetMonthlyPayment (₹/mo).
 */

import crypto from "crypto";

const BASE_URL = process.env.FITEMI_API_URL || `http://localhost:${process.env.PORT || 4000}`;
// Lightweight agent identity for audit — NOT cryptographic auth (see API_SCHEMA.md Auth Model)
// Production would require mTLS/OAuth client credentials; here we just attribute the demo agent in the audit log.
// When AGENT_SHARED_SECRET is set, we also send HMAC signature (see server/src/lib/agentAuth.js) —
// this is still a shared-secret demo (production would use per-agent keys), but it proves
// the caller holds the secret and the request wasn't replayed (5m window, timingSafeEqual).
const AGENT_ID = process.env.AGENT_ID || "agent-buyer-demo";
const AGENT_SHARED_SECRET = process.env.AGENT_SHARED_SECRET || null;

function parseArgs() {
  const args = process.argv.slice(2);
  let query = null;
  let item = null;
  let budget = 5000;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--query" && args[i + 1]) {
      query = args[++i];
    } else if (arg === "--item" && args[i + 1]) {
      item = args[++i];
    } else if (arg === "--budget" && args[i + 1]) {
      budget = parseInt(args[++i], 10);
    } else if (arg.startsWith("--query=")) {
      query = arg.slice("--query=".length).replace(/^["']|["']$/g, "");
    } else if (arg.startsWith("--item=")) {
      item = arg.slice("--item=".length).replace(/^["']|["']$/g, "");
    } else if (arg.startsWith("--budget=")) {
      budget = parseInt(arg.slice("--budget=".length), 10);
    }
  }
  // --item is alias for --query: "I want a {item}" if no explicit query
  if (!query && item) {
    // If item is a simple category word like "laptop", expand to natural intent
    query = `I want a ${item} around \u20B960,000`;
    // If item already looks like a query (contains space), use as-is
    if (item.trim().includes(" ")) query = item;
  }
  if (!query) query = "I want a laptop around \u20B960,000";
  return { query, budget, item };
}

async function postJson(path, body) {
  const url = `${BASE_URL}${path}`;
  console.log(`[EXTERNAL AGENT] -> FITEMI API POST ${path}`);
  console.log(`[EXTERNAL AGENT]    sent: ${JSON.stringify(body).slice(0, 500)}`);
  const headers = { "Content-Type": "application/json" };
  // Include lightweight agent identity for audit (required on /api/agent/*, see server/src/routes/agent.js)
  if (path.startsWith("/api/agent/")) {
    headers["X-Agent-Id"] = AGENT_ID;
    if (AGENT_SHARED_SECRET) {
      const timestamp = Date.now().toString();
      const bodyString = body ? JSON.stringify(body) : "";
      const canonical = `POST\n${path}\n${AGENT_ID}\n${bodyString}\n${timestamp}`;
      const hmac = crypto.createHmac("sha256", AGENT_SHARED_SECRET).update(canonical, "utf8").digest("hex");
      headers["X-Agent-Timestamp"] = timestamp;
      headers["X-Agent-Signature"] = hmac;
      console.log(`[EXTERNAL AGENT]    signed: X-Agent-Timestamp=${timestamp} X-Agent-Signature=${hmac.slice(0, 16)}...`);
    }
  }
  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  console.log(`[EXTERNAL AGENT] <- FITEMI API ${path} status=${res.status}`);
  if (!res.ok) {
    console.log(`[EXTERNAL AGENT]    received (error): ${JSON.stringify(json).slice(0, 800)}`);
  } else {
    console.log(`[EXTERNAL AGENT]    received keys: ${Object.keys(json).join(", ")}`);
    // Print a compact preview for key endpoints
    if (json.explanation) console.log(`[EXTERNAL AGENT]    explanation: ${(json.explanation).slice(0, 200)}`);
    if (json.allowedActions) console.log(`[EXTERNAL AGENT]    actionModel: ALLOWED=${json.allowedActions.join(",")} | REQUIRES_APPROVAL=${json.requiresApproval.join(",")} | DISALLOWED=${json.disallowed.join(",")}`);
    if (json.feasible != null) console.log(`[EXTERNAL AGENT]    feasible: ${json.feasible} ${json.reason ? "reason: " + json.reason.slice(0,150) : ""}`);
    if (json.options) console.log(`[EXTERNAL AGENT]    options: ${json.options.map(o=> `${o.tenorMonths}mo@\u20B9${o.emi}/${o.lenderId}`).join(" | ")}`);
    if (json.valid != null) console.log(`[EXTERNAL AGENT]    validate: valid=${json.valid} ${json.error || ""}`);
    if (json.orderId) console.log(`[EXTERNAL AGENT]    orderId: ${json.orderId} isSimulated=${json.isSimulated} status=${json.merchantOrder?.status}`);
  }
  return { res, json };
}

async function main() {
  const { query, budget, item } = parseArgs();
  console.log("==================================================");
  console.log("[EXTERNAL AGENT] Starting autonomous purchase flow");
  console.log(`[EXTERNAL AGENT] Budget: \u20B9${budget}/mo | Item: ${item || "(from query)"} | Query: "${query}"`);
  console.log(`[EXTERNAL AGENT] Target API: ${BASE_URL}`);
  console.log("[EXTERNAL AGENT] Action model: ALLOWED=[SEARCH_CATALOG,COMPARE_PLANS,GENERATE_RECOMMENDATION,CREATE_DRAFT_ORDER] REQUIRES_APPROVAL=[CREATE_CHECKOUT,FINAL_PAYMENT] DISALLOWED=[BYPASS_AFFORDABILITY,CHANGE_PRICE,INVENT_INVENTORY,CHARGE_WITHOUT_APPROVAL,FABRICATE_PAYMENT]");
  console.log("==================================================\n");

  // Health check
  try {
    const h = await fetch(`${BASE_URL}/api/health`);
    if (!h.ok) throw new Error(`health ${h.status}`);
    const hj = await h.json();
    console.log(`[EXTERNAL AGENT] -> FITEMI API GET /api/health -> ok (${hj.status} @ ${hj.timestamp})\n`);
  } catch (e) {
    console.error(`[EXTERNAL AGENT] Cannot reach FITEMI API at ${BASE_URL}: ${e.message}`);
    console.error(`[EXTERNAL AGENT] Is the server running? Run: npm run dev  (or npm start)`);
    process.exit(1);
  }

  // Step 1: Orchestrate — intent parsing + catalog discovery + ceiling (ALLOWED: SEARCH_CATALOG, GENERATE_RECOMMENDATION)
  console.log("--- Step 1: POST /api/agent/orchestrate (ALLOWED: SEARCH_CATALOG + GENERATE_RECOMMENDATION) ---");
  console.log(`[EXTERNAL AGENT]    Intent: "${query}" with budget \u20B9${budget}/mo as affordability hint`);
  // Include budget in intentText so orchestrate can evaluate feasibility (mirrors real agent hinting monthly comfort)
  // Parser expects "… at ₹5000 a month" or "per month" (see server/src/lib/intentParser.js:40) — use "a month" form
  const orchestrateIntent = /\/mo|per month|monthly|a month/i.test(query) ? query : `${query} at \u20B9${budget} a month`;
  console.log(`[EXTERNAL AGENT]    Orchestrate intentText: "${orchestrateIntent}"`);
  const { json: orch } = await postJson("/api/agent/orchestrate", {
    intentText: orchestrateIntent,
    affordabilityInputs: null,
  });

  const intent = orch.intent;
  console.log(`[EXTERNAL AGENT] Parsed intent: category=${intent?.category || "?"} maxPrice=${intent?.maxPrice || "?"} targetMonthly=${intent?.targetMonthly || "?"} raw="${(intent?.raw || "").slice(0,80)}"`);
  console.log(`[EXTERNAL AGENT] Catalog results: ${orch.catalogResults?.length || 0} products`);
  if (orch.catalogResults) {
    orch.catalogResults.forEach((c, idx) => {
      const marker = c.isBestFit ? " ★BEST" : "";
      console.log(`[EXTERNAL AGENT]   [${idx}] ${c.product.name} (${c.product.id}) \u20B9${c.product.price} ${c.feasible ? "feasible" : "not feasible"}${marker}`);
    });
  }
  if (orch.explanation) console.log(`[EXTERNAL AGENT] Explanation: ${orch.explanation.slice(0, 250)}`);

  if (!orch.catalogResults || orch.catalogResults.length === 0) {
    console.error("[EXTERNAL AGENT] No products found for query — try a different query (e.g. 'laptop', 'phone').");
    process.exit(1);
  }

  // Choose product: prefer bestFit, otherwise first product
  let chosen = orch.bestFit?.product || orch.catalogResults.find(c => c.product)?.product;
  if (!chosen) chosen = orch.catalogResults[0].product;
  console.log(`[EXTERNAL AGENT] Chosen product: ${chosen.name} (id=${chosen.id}) price=\u20B9${chosen.price} merchant=${chosen.merchantId || chosen.merchant?.name || "?"} merchantId=${chosen.merchantId || chosen.merchant?.id}`);

  // Effective budget: prefer explicit --budget arg, fallback to intent targetMonthly or affordabilityCeiling
  const effectiveBudget = Number.isFinite(budget) ? budget : (orch.affordabilityCeiling || intent?.targetMonthly || 5000);
  console.log(`[EXTERNAL AGENT] Effective monthly budget for solve: \u20B9${effectiveBudget}/mo (from --budget CLI arg; would fallback to affordabilityCeiling/intent.targetMonthly)\n`);

  // Step 2: Recommend — deterministic EMI solve (ALLOWED: COMPARE_PLANS)
  console.log("--- Step 2: POST /api/recommend (ALLOWED: COMPARE_PLANS — deterministic solver) ---");
  console.log(`[EXTERNAL AGENT]    Solving: itemPrice=\u20B9${chosen.price} vs targetMonthly=\u20B9${effectiveBudget}/mo`);
  const { json: rec } = await postJson("/api/recommend", {
    itemPrice: chosen.price,
    targetMonthlyPayment: effectiveBudget,
  });

  if (rec.quizInProgress) {
    console.log(`[EXTERNAL AGENT] Quiz in progress: ${rec.nextQuestion}`);
    process.exit(0);
  }

  if (!rec.feasible) {
    console.log(`[EXTERNAL AGENT] No feasible plan: ${rec.reason}`);
    console.log(`[EXTERNAL AGENT] Minimum EMI needed: \u20B9${rec.minFeasibleEmi} (${rec.minFeasibleTenor}mo, ${rec.minFeasibleLender})`);
    console.log(`[EXTERNAL AGENT] Affordability ceiling was \u20B9${effectiveBudget}/mo — solver checked lenders ${rec.meta?.lendersConsidered || 3} (see server/src/lib/lenders.js) across tenors 3-24mo via emiForTenor().`);
    console.log("[EXTERNAL AGENT] Flow ends gracefully — agent would suggest cheaper product or higher budget. (Demonstrates BYPASS_AFFORDABILITY is DISALLOWED — solver will not invent a plan)");
    process.exit(0);
  }

  const bestPlan = rec.options[0];
  console.log(`[EXTERNAL AGENT] Feasible: ${rec.options.length} plans. Best: ${bestPlan.tenorMonths}mo @ \u20B9${bestPlan.emi}/mo via ${bestPlan.lenderId} (interest \u20B9${bestPlan.totalInterest}, total \u20B9${bestPlan.totalPaid})`);
  console.log(`[EXTERNAL AGENT] Rank: ${bestPlan.explanationFacts.reason} — ${bestPlan.explanationFacts.reasonLabel.slice(0,150)}`);
  console.log(`[EXTERNAL AGENT] Headroom: \u20B9${bestPlan.explanationFacts.monthlyHeadroom}/mo | All options: ${rec.options.map(o=> `${o.lenderId} ${o.tenorMonths}mo \u20B9${o.emi}`).join(" | ")}`);
  if (rec.explanation) console.log(`[EXTERNAL AGENT] LLM explanation (polish only, numbers from solver): "${rec.explanation.slice(0,300)}"`);
  console.log("");

  // Step 3: Draft order — ALLOWED: CREATE_DRAFT_ORDER (no approval needed, but status=awaiting_approval)
  console.log("--- Step 3: POST /api/agent/draft-order (ALLOWED: CREATE_DRAFT_ORDER — no charge, status awaiting_approval) ---");
  const draftBody = {
    productId: chosen.id,
    plan: {
      tenorMonths: bestPlan.tenorMonths,
      emi: bestPlan.emi,
      totalInterest: bestPlan.totalInterest,
      totalPaid: bestPlan.totalPaid,
      lenderId: bestPlan.lenderId,
    },
    amount: chosen.price,
    buyer: { targetMonthlyPayment: effectiveBudget, affordabilityCeiling: effectiveBudget },
  };
  const { json: draft } = await postJson("/api/agent/draft-order", draftBody);
  if (draft.orderId) {
    console.log(`[EXTERNAL AGENT] Draft created: orderId=${draft.orderId} action=${draft.action} requiresApproval=${draft.requiresApproval} status=${draft.order?.status}`);
  } else {
    console.log(`[EXTERNAL AGENT] Draft failed: ${draft.error}`);
    // Not fatal — continue to validate/checkout with same plan
  }
  console.log("");

  // Step 4: Validate checkout — REQUIRES_APPROVAL pre-flight (bounded gate)
  console.log("--- Step 4: POST /api/agent/validate-checkout (REQUIRES_APPROVAL gate — validates deterministically) ---");
  console.log(`[EXTERNAL AGENT]    Validating: productId=${chosen.id} amount=\u20B9${chosen.price} plan=${bestPlan.tenorMonths}mo @ \u20B9${bestPlan.emi} lender=${bestPlan.lenderId} userApproval=true`);
  const { json: v } = await postJson("/api/agent/validate-checkout", {
    productId: chosen.id,
    plan: {
      tenorMonths: bestPlan.tenorMonths,
      emi: bestPlan.emi,
      totalInterest: bestPlan.totalInterest,
      totalPaid: bestPlan.totalPaid,
      lenderId: bestPlan.lenderId,
    },
    amount: chosen.price,
    userApproval: true,
  });
  if (v.valid) {
    console.log(`[EXTERNAL AGENT] Validate passed: product=${v.product.name} lender=${v.lender.name} tenure ${v.lender.minTenor}-${v.lender.maxTenor}mo @ monthlyRate ${v.lender.monthlyRate}`);
  } else {
    console.error(`[EXTERNAL AGENT] Validate failed: ${v.error} (DISALLOWED check blocked — e.g. CHANGE_PRICE / FABRICATE_PAYMENT / CHARGE_WITHOUT_APPROVAL)`);
    process.exit(1);
  }
  console.log("");

  // Step 5: Checkout — REQUIRES_APPROVAL: FINAL_PAYMENT (gated by userApproval:true)
  console.log("--- Step 5: POST /api/checkout/create-order (REQUIRES_APPROVAL: FINAL_PAYMENT — gated by userApproval:true) ---");
  console.log(`[EXTERNAL AGENT]    Checkout payload includes userApproval:true — without it server returns 403 DISALLOWED:CHARGE_WITHOUT_APPROVAL`);
  const { json: checkout } = await postJson("/api/checkout/create-order", {
    productId: chosen.id,
    plan: {
      tenorMonths: bestPlan.tenorMonths,
      emi: bestPlan.emi,
      totalInterest: bestPlan.totalInterest,
      totalPaid: bestPlan.totalPaid,
      lenderId: bestPlan.lenderId,
    },
    amount: chosen.price,
    buyer: { targetMonthlyPayment: effectiveBudget, affordabilityCeiling: effectiveBudget },
    userApproval: true,
  });

  if (checkout.success) {
    console.log("\n[EXTERNAL AGENT] \u2713 Checkout succeeded (REQUIRES_APPROVAL gate satisfied)");
    console.log(`[EXTERNAL AGENT]   orderId: ${checkout.orderId}`);
    console.log(`[EXTERNAL AGENT]   merchantOrder: ${checkout.merchantOrder?.productName} status=${checkout.merchantOrder?.status} amount=\u20B9${checkout.merchantOrder?.amount}`);
    console.log(`[EXTERNAL AGENT]   plan: ${checkout.merchantOrder?.plan?.tenorMonths}mo @ \u20B9${checkout.merchantOrder?.plan?.emi}/mo via ${checkout.merchantOrder?.plan?.lenderId}`);
    console.log(`[EXTERNAL AGENT]   razorpayOrder: ${checkout.razorpayOrder?.id} amount=${checkout.razorpayOrder?.amount} (${checkout.razorpayOrder?.amountInRupees ? "\u20B9"+checkout.razorpayOrder.amountInRupees : "paise"}) isSimulated=${checkout.isSimulated}`);
    console.log(`[EXTERNAL AGENT]   message: ${checkout.message}`);
  } else {
    console.error(`[EXTERNAL AGENT] Checkout failed: ${checkout.error}`);
    process.exit(1);
  }

  console.log("\n==================================================");
  console.log("[EXTERNAL AGENT] End-to-end flow complete (orchestrate -> recommend -> draft-order -> validate-checkout -> create-order)");
  console.log("[EXTERNAL AGENT] Transcript: every step sent/received JSON over HTTP; no FITEMI internals imported.");
  console.log("[EXTERNAL AGENT] ALLOWED actions ran autonomously; REQUIRES_APPROVAL checkout only succeeded with userApproval:true; DISALLOWED (bypass/fabricate/change price) would have been rejected with 400/403.");
  console.log("[EXTERNAL AGENT] Every money decision was backend-deterministic (emiSolver.js + affordability.js); agent only orchestrated.");
  console.log("==================================================");
}

main().catch(err => {
  console.error("[EXTERNAL AGENT] Fatal error:", err);
  process.exit(1);
});
