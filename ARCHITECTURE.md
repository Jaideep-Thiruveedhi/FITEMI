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
- `growthAnalysis.js:1` — `runGrowthSimulation` (reuses batch-eval generator, fixed `6/12/24` baseline vs `findFeasiblePlans` FITEMI, `analyzeAffordabilityGapPattern`), `deriveEffectivePriceRange`, `checkBaselineFeasible`/`checkFitemiFeasible` — no new DB, same solver, labeled `SIMULATION_LABEL`/`SIMULATION_DISCLAIMER`/`isSynthetic`

**Backend — Routes:**
- `routes/catalog.js` — `GET /api/catalog` (search), `GET /api/catalog/:id`, `GET /api/catalog/agent/readable`
- `routes/agent.js` — `POST /api/agent/parse`, `POST /api/agent/orchestrate` (AI buyer mode), `POST /api/agent/draft-order`, `POST /api/agent/validate-checkout`
- `routes/checkout.js` — `POST /api/checkout/create-order` (bounded, `userApproval` required), `POST /api/checkout/verify`, `POST /api/checkout/cancel`, `GET /api/checkout/status/:id`
- `routes/merchant.js` — `GET /api/merchant/orders`, `GET /api/merchant/insights`, `GET /api/merchant/merchants`, `POST /api/merchant/growth-analysis` (controlled synthetic before/after: `category,priceMin,priceMax` → baseline/FITEMI conversion, recovered checkouts/GMV, gap pattern, `isSynthetic` + `auditMiddleware` logged)
- `routes/recommend.js` — preserved legacy EMI path (validation → affordability → solver → LLM polish)

**Frontend — Warm 3D Design System:**
- `styles/theme.css` — `cream #FFFBF5`, `peach #FFDAB9`, `lilac #E8E0FF`, `navy #1A1A2E`, `Space Grotesk` + `Inter`, `soft shadow`, `rounded`, `backdrop-blur` nav, responsive
- `App.jsx:1` — single coherent product, 5 tabs, state for `dream/catalog/selectedProduct/plans/ceiling/tradeOff/whatIf/checkout/orders/audit`, `AiConcierge` contextual
- Interactions: Dream input + prompt pills, catalog grid, compass track, spectrum track with ★, trade-off pills, what-if buttons, deep plan principal/interest bar, bounded checkout card, merchant feed, audit timeline
- `App.jsx:696` — **Growth Agent (Merchant → AI Growth Loop)** — input for natural-language goal → `POST /api/agent/parse` (reuse `intentParser.js`) → `POST /api/merchant/growth-analysis` → renders problem → opportunity → recommended action → reasoning (bullets referencing `0.4×` ceiling + `emiSolver`) → expected impact → Preview + bounded `Run in Test Mode` (3–5 synthetic shoppers → `POST /api/recommend` + `POST /api/checkout/create-order` test-mode orders, no pricing/inventory change, all via `auditMiddleware`)

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

> **Scope — Controlled Synthetic Simulation (deliberate, not an overclaim):** The **AI Growth Loop** (`server/src/lib/growthAnalysis.js:1` + `POST /api/merchant/growth-analysis` in `server/src/routes/merchant.js:33` + Merchant → Growth Agent in `client/src/App.jsx:696`) is a *controlled synthetic simulation demonstrating the growth mechanism*, not live merchant data. It reuses the existing `npm run batch-eval` synthetic shopper generator (same 4-bucket `comfortable/tight/infeasible/no_budget` distributions, same `affordability.js:13` ceiling `max(0,floor(0.4×takeHome−obligations))` and `emiSolver.js:5`/`lenders.js:1` 3 lenders) to simulate a before/after checkout: *before* fixed `6/12/24` mo tenures only (industry-standard baseline) vs *with* FITEMI's affordability-matched solver, and reports baseline/FITEMI conversion, recovered checkout count, recovered GMV estimate, and affordability-gap pattern (e.g., “37% of declines had EMI > affordability by <₹2k/mo”). Responses are labeled `isSynthetic:true`, `isRealTransactionHistory:false`, `CONTROLLED SIMULATION • SYNTHETIC` with `disclaimer: does not represent real transaction history or a financial guarantee`; `Run in Test Mode` (`App.jsx:219`) proves the mechanism by creating 3–5 real Razorpay test-mode orders (`order_sim_…` if keys not set) via the existing `POST /api/recommend` → `POST /api/checkout/create-order` (`userApproval:true`, bounded `validateCheckout`) flow without changing pricing or inventory, and every request goes through `auditLog.js:138` `auditMiddleware` (requestId + SHA-256 hash chain, verifiable at `GET /api/audit/verify`). No new database, no new synthetic source, no EMI/checkout/agent route changes — additive only, intentional honesty about what is and isn't proven.

## Agent-to-Agent Commerce Protocols

FITEMI's core is an **agentic-commerce API** that any external AI buyer can call over HTTP (see `server/docs/API_SCHEMA.md` and `server/scripts/agentBuyerDemo.js`). The bounded/gated/audited model is deliberately designed to sit *underneath* emerging agent payment protocols rather than compete with them.

### How today maps to ACP / AP2 / x402 (conceptual)

| Protocol concept | FITEMI today | What changes to support the protocol natively |
|---|---|---|
| **Agent identity & intent** (ACP: buyer agent, AP2: `IntentMandate`, x402: payer address) | `POST /api/agent/*` requires `X-Agent-Id` (lightweight attribution, logged alongside `requestId` in `audit.log`). If `AGENT_SHARED_SECRET` is set, the same routes also require `X-Agent-Timestamp` + `X-Agent-Signature` — HMAC-SHA256 over canonical `METHOD\nPATH\nX-Agent-Id\nBODY_JSON\nX-Agent-Timestamp` verified via `crypto.timingSafeEqual` with 5-minute replay window (`server/src/lib/agentAuth.js`). This is **not** per-agent asymmetric identity — it is a single demo shared secret (`AGENT_SHARED_SECRET` env var, see `API_SCHEMA.md`), but it is **cryptographic proof the caller holds the shared secret and the request wasn't replayed** — a real step up from an unauthenticated header, yet still short of production per-agent identity. `agent.js: ALLOWED / DISALLOWED` lists what an agent may do; `auditMiddleware` attaches `requestId` + `agentId`. | Replace single shared secret with **per-agent keys** issued at registration (or asymmetric mTLS/OAuth client credentials), verify `X-Agent-Signature` becomes per-agent HMAC or JWT, bind `requestId`/`agentId` to protocol intent ID, and enforce ACL per agent. Production would use per-agent `AGENT_SHARED_SECRET` issuance, not one global secret. |
| **Payment authorization** (ACP: checkout, AP2: `CartMandate`/`PaymentMandate`, x402: `402 Payment Required` + `X-PAYMENT`) | `POST /api/checkout/create-order` requires `userApproval:true` (boolean). `validateCheckout` (`server/src/lib/agent.js:98`) checks product/price/plan deterministically and throws `CHARGE_WITHOUT_APPROVAL`. The UI gate is the only authorization. | Replace the `boolean` gate with a **protocol-native authorization token**: ACP signed checkout payload, AP2 dual mandates, or x402 `Payment` header. Validate the signature, amount, merchant, and mandate scope server-side; keep `validateCheckout` as the final deterministic check. |
| **Audit / non-repudiation** (ACP mandate receipt, AP2 signed transcript, x402 payment proof) | `auditLog.js` appends every request to `server/data/audit.log` as JSON line with `timestamp, requestId, agentId (when X-Agent-Id present), method, path, status, durationMs, feasible`. `GET /api/audit/verify` recomputes a SHA-256 hash chain (`hash_n = SHA256(JSON(entry_n) + hash_{n-1})`) and returns `intact:true/false`. Frontend shows `Audit integrity: verified ✓` in Merchant > Audit Timeline. Idempotency (`Idempotency-Key`, 24h in-memory `server/src/lib/idempotency.js`) is implemented for `POST /api/checkout/create-order`, `POST /api/agent/draft-order`, and `POST /api/merchant/growth-execute` — duplicate key returns original `orderId` without new Razorpay order. | Anchor the hash chain to a per-protocol transcript: e.g. sign each audit entry with the agent's mandate ID, or include the x402 payment hash in the entry. Optionally publish chain tip to an external transparency log. Persist idempotency in durable store (SQLite/Redis) instead of in-memory. |
| **Discovery** (ACP product listing, x402 resource price header) | `GET /api/catalog` and `GET /api/catalog/agent/readable` provide an agent-readable catalog (`productId, merchant, price, supportedTenors`). No `Price` header is emitted. | Expose `402` + `X-Payment` / `Price` headers or ACP discovery payloads; keep the existing catalog as fallback. |

### Current limitations (honest)

- **Agent identity is shared-secret HMAC, not per-agent asymmetric identity.** `X-Agent-Id` + `X-Agent-Signature`/`X-Agent-Timestamp` with `AGENT_SHARED_SECRET` (single demo secret, `server/src/lib/agentAuth.js`, HMAC-SHA256 + `timingSafeEqual` + 5m replay window) proves the caller holds the shared secret and wasn't replayed — a real cryptographic step up from an unauthenticated header — but it is **still not production-grade auth**: it is a single shared secret for the hackathon demo, not per-agent keys issued at registration, not mTLS or OAuth client credentials, and not an AP2 `IntentMandate` JWT. Production would need per-agent secrets/certs, rotation, and ACL.
- **`userApproval:true` is not a mandate.** It is a demo gate, not an AP2 `PaymentMandate` or x402 USDC transfer. Replacing it requires adding signature verification and replay protection (already done for agent identity; still needed for payment).
- **Idempotency is in-memory (24h TTL).** Retrying `POST /api/checkout/create-order`, `POST /api/agent/draft-order`, or `POST /api/merchant/growth-execute` with the same `Idempotency-Key` correctly returns the original `orderId` without a new Razorpay order (verified in `server/test/idempotency.test.js`), but the store is in-memory (`server/src/lib/idempotency.js`) and would be lost on restart; production would persist in SQLite/Redis and bind to mandate/payment hash.
- **No protocol libraries are vendored.** ACP, AP2, and x402 are referenced at a conceptual level only; FITEMI does not ship their SDKs or implement their wire formats today.

### Extension path

1. Replace single `AGENT_SHARED_SECRET` with per-agent key issuance at registration (or mTLS/OAuth), verify per-agent `X-Agent-Signature` before `agent.js` logic, and enforce per-agent ACL.
2. Extend `POST /api/checkout/create-order` to accept *either* `userApproval:true` (compat) *or* `paymentAuthorization: { protocol: "ap2"|"x402"|"acp", token: "…" }`; verify token deterministically before `validateCheckout`.
3. Include `protocol`, `mandateId`/`paymentHash`, and agent signature in `audit.log` entries so `GET /api/audit/verify` can attest to the full flow end-to-end, and persist idempotency.

The standalone demo `npm run demo:agent` already proves the layering: it is an *external* process that calls FITEMI's HTTP API like any ACP/AP2/x402 agent would — the only difference is the authorization artifact it sends.

References (conceptual — not implemented):
- ACP: https://www.agenticcommerce.dev/
- AP2 (Google): https://developers.google.com/ap2
- x402 (Coinbase): https://www.x402.org/
