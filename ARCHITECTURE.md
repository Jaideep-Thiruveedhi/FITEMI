# Architecture — FITEMI Agentic Commerce

FITEMI is an **AI-native payment-fit commerce agent**, not a calculator. One coherent product with many purposeful interactions, deterministic money reasoning, and a bounded payment gate.

## Product Story Flow

```
Dream Discovery
  "What's on your mind?" — natural language + prompts
  ↓ POST /api/agent/parse → intent {category, maxPrice, targetMonthly}
         │
Merchant / Product Discovery
  GET /api/catalog?q=laptop&maxPrice=65000 → 8 products, 3 merchants
  Agent-readable catalog concept — AI buyer can filter
         │
Affordability Compass
  Visual TOO TIGHT ← COMFORTABLE → STRETCHED
  Inputs: takeHomePay, existingObligations → POST /api/recommend
  Backend computes ceiling: 0.4 × take-home − obligations (truth)
         │
EMI Spectrum (signature)
  LOWER MONTHLY ←————————→ LOWER TOTAL INTEREST
  Plans from solver (real EMI/tenor/interest) along spectrum
  Interactive ★ YOUR FIT — selection updates explanation
         │
Trade-off Lab
  Controls: Monthly ↔ Interest ↔ Time
  Re-ranks deterministically (no LLM)
  “Lower monthly +₹847 headroom but +₹915 interest”
         │
What-if Simulator
  CURRENT → NEW CONSTRAINT → NEW OPTIONS
  What if budget ±₹1000 / pay 6mo sooner → POST /api/recommend with new target
         │
Deep Plan View
  EMI/tenor/interest/total + fee + principal vs interest bar + timeline
  Per-plan Why: Fits ₹X budget, lowest interest, rank
  Alternatives
         │
Bounded Checkout
  YOU ARE ABOUT TO PURCHASE — Approve gate
  POST /api/checkout/create-order {productId, plan, amount, userApproval:true}
  → validateCheckout guard → Razorpay test-mode orders.create → simulated if no keys
         │
Merchant Side
  GET /api/merchant/orders → NEW AI BUYER / PAID
  Revenue Intelligence — real orders + synthetic insights (labeled demo)
         │
Audit / Trust Timeline
  Intent → Product → Affordability → Plan → Approval → Payment → Confirmed
  GET /api/audit → {requestId, timestamp, method, path, status, durationMs}
```

Navigation: **Home** (Dream + AI Buyer Mode) | **Explore** (Catalog) | **My Fit** (Compass + Spectrum + Trade-off + What-if + Deep Plan) | **Orders** (Checkout + Razorpay + Orders) | **Merchant** (Console + Insights + Audit) — contextual, not 10 separate dashboards.

## Components

**Backend — Deterministic Core (preserved):**
- `emiSolver.js:1` — `emiForTenor`, `findFeasiblePlans` (smallest n that fits, rank by `totalInterest`, `explanationFacts` + `minFeasibleEmi` for decline)
- `affordability.js:1` — `AFFORDABILITY_RATIO=0.4`, backend-only ceiling
- `lenders.js:1` — 3 synthetic (A 1.25% 3-24mo, B 1.08% 6-18mo, C 1.5% 3-12mo)
- `auditLog.js:31` — `auditMiddleware` (requestId, duration, sanitized, auto-creates `server/data/audit.log`)

**Backend — Agentic Commerce (new):**
- `catalog.js` — 8 products, 3 merchants, `searchCatalog`, `getCatalogForAgent`
- `intentParser.js` — `parseIntentDeterministic` + `parseIntentWithLLM` (LLM enhance, never invent numbers)
- `razorpay.js` — `createTestOrder` (real `Razorpay.orders.create` or `api.razorpay.com` or **simulated** `order_sim_…` with `isSimulated:true` boundary), `verifyPayment`, `isRazorpayConfigured`
- `merchant.js` — in-memory `orders`, `createOrder`, `updateOrderStatus`, `getRevenueInsights` (real + synthetic labeled)
- `agent.js` — `orchestrateAgent` (parse → ceiling → search → evaluate → bestFit), `validateCheckout` (product/price/plan/feasibility guard), `createDraftOrder`, `ALLOWED`/`REQUIRES_APPROVAL`/`DISALLOWED`

**Backend — Routes:**
- `routes/catalog.js` — `GET /api/catalog` (search), `GET /api/catalog/:id`, `GET /api/catalog/agent/readable`
- `routes/agent.js` — `POST /api/agent/parse`, `POST /api/agent/orchestrate` (AI buyer mode), `POST /api/agent/draft-order`, `POST /api/agent/validate-checkout`
- `routes/checkout.js` — `POST /api/checkout/create-order` (bounded, `userApproval` required), `POST /api/checkout/verify`, `POST /api/checkout/cancel`, `GET /api/checkout/status/:id`
- `routes/merchant.js` — `GET /api/merchant/orders`, `GET /api/merchant/insights`, `GET /api/merchant/merchants`
- `routes/recommend.js` — preserved legacy EMI path (validation → affordability → solver → LLM polish)

**Frontend — Warm 3D Design System:**
- `styles/theme.css` — `cream #FFFBF5`, `peach #FFDAB9`, `lilac #E8E0FF`, `navy #1A1A2E`, `Space Grotesk` + `Inter`, `soft shadow`, `rounded`, `backdrop-blur` nav, responsive
- `App.jsx:1` — single coherent product, 5 tabs, state for `dream/catalog/selectedProduct/plans/ceiling/tradeOff/whatIf/checkout/orders/audit`, `AiConcierge` contextual
- Interactions: Dream input + prompt pills, catalog grid, compass track, spectrum track with ★, trade-off pills, what-if buttons, deep plan principal/interest bar, bounded checkout card, merchant feed, audit timeline

**AI Design:**
- Does: parse intent, ask affordability, explain facts, suggest “You’re ₹680 below target — pay sooner?”, launch comparisons
- Never does: decide EMI/interest/tenor/ceiling/feasibility/ranking/amount/charge — those are solver/backend
- Fallback: deterministic templates when no `ANTHROPIC_API_KEY`

## Data Flow — Example

```
User: "laptop around ₹60,000 at ₹5,000/mo"
  → POST /api/agent/parse → {category:laptop, maxPrice:66000, targetMonthly:5000}
  → GET /api/catalog?category=laptop&maxPrice=66000 → [ThinkPad X1 65000, MacBook Air 89900 filtered out]
  → POST /api/recommend {itemPrice:65000, targetMonthlyPayment:5000} → 3 plans + facts
  → UI: Spectrum with ★ YOUR FIT 6mo @ ₹4,152, Trade-off re-rank, What-if +₹1000 → new plans
  → POST /api/checkout/create-order {productId:p2, plan, amount:65000, userApproval:true} → validateCheckout → Razorpay
  → GET /api/merchant/orders → PAID, GET /api/audit → timeline
```

All synthetic data under `server/data` + `server/src/lib/catalog.js`; no DB, no real bank calls.
