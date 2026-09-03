# FITEMI — AI-Native Payment-Fit Commerce Agent

**Track 01: AI Growth & Agentic Commerce — Razorpay**

## For Evaluators

- **External agent (end-to-end):** `npm run dev` in one terminal, then `npm run demo:agent -- --query "laptop around 60000" --budget 5000` — watch `[EXTERNAL AGENT] -> FITEMI API` logs for orchestrate → recommend → checkout.
- **Audit integrity:** `curl http://localhost:4000/api/audit/verify` → `{"intact":true}`; also shown as `Audit integrity: verified ✓` in Merchant → Audit Timeline.
- **Tests:** `npm test` (emiSolver unit tests) and `npm run eval:check` (feasible rate ≥50%, avg tenor ≤24mo).

> *FITEMI turns affordability into an agentic commerce decision.*

A buyer doesn't ask “What EMI options do you have?”  
Instead: **“I want this. Find me a way to buy it comfortably.”**

FITEMI understands intent, finds the product, reasons about affordability, explores payment possibilities, explains the trade-off, asks for approval, and safely completes the transaction — with a full audit trail and merchant-side confirmation.

---

## What FITEMI Is

FITEMI is **not** a calculator, dashboard, or ChatGPT clone. It's an **AI buyer + merchant commerce agent** that:

1. **Understands natural-language intent** — “laptop around ₹60,000 at ₹5,000/mo”
2. **Discovers products** from a synthetic merchant catalog (agent-readable)
3. **Reasons about affordability** — backend deterministic `0.4 × take-home − obligations`
4. **Optimizes payment plans** — deterministic EMI solver across 3 lenders, ranked, with per-plan `Why this plan?`
5. **Explains trade-offs** — EMI Spectrum, Trade-off Lab, What-if Simulator (all real solver values)
6. **Gates payment** — bounded checkout: “Approve payment” before any charge
7. **Pays via Razorpay test-mode** — real `orders.create` in test mode, simulated fallback with clear boundary
8. **Confirms for merchant** — lightweight console with orders, revenue intelligence, audit timeline

Every money decision is **deterministic and backend-owned**; the LLM only understands intent, asks clarifying questions, and explains.

> **Scope — Controlled Synthetic Simulation (deliberate, not an overclaim):** The merchant-facing **AI Growth Loop** is a *controlled synthetic simulation demonstrating the growth mechanism*, not live merchant data. It reuses the existing `npm run batch-eval` synthetic shopper generator (same 4-bucket distributions, same deterministic `0.4× take-home − obligations` ceiling and `emiSolver`/`lenders`) to run a before/after comparison — *before FITEMI* (fixed `6/12/24` mo tenures only, industry-standard baseline) vs *with FITEMI* (affordability-matched solver) — and reports baseline vs FITEMI conversion, recovered checkout count, recovered GMV estimate, and the affordability-gap pattern (e.g., “37% of declines had EMI > affordability by <₹2k/mo”). All API responses (`POST /api/merchant/growth-analysis`), UI labels, and the **Growth Agent** in Merchant tab are explicitly marked `CONTROLLED SIMULATION • SYNTHETIC` with `isSynthetic:true` and `disclaimer: does not represent real transaction history or a financial guarantee`; `Run in Test Mode` creates only Razorpay test-mode orders (`order_sim_…` if keys not set) via the existing `POST /api/checkout/create-order` flow and logs every request through `auditMiddleware`. This is intentional scope to show the mechanism honestly, without fabricating business performance.

---

## Why It's Different

| Generic Checkout | FITEMI |
|---|---|
| Fixed 6/12/24 buttons | **EMI Spectrum** — interactive `LOWER MONTHLY ←→ LOWER INTEREST` |
| Form: “Enter EMI” | **Affordability Compass** — visual `TOO TIGHT → COMFORTABLE → STRETCHED` |
| One global explanation | **Per-plan Why** — each card answers “Why this plan?” with `budget`/`interest`/`rank`/`headroom` facts |
| Charge on click | **Bounded Checkout** — `YOU ARE ABOUT TO PURCHASE` with explicit `Approve` gate |
| No merchant story | **Merchant Console** — orders, `PAID (test-mode)`, revenue insights |

---

## Quick Start (One Command)

```bash
git clone https://github.com/Jaideep-Thiruveedhi/FITEMI.git
cd FITEMI
cp .env.example .env
# Edit .env — set ANTHROPIC_API_KEY (optional) and RAZORPAY_KEY_ID/SECRET (optional, test-mode)
npm install
npm run dev
```

Open **http://localhost:5173** (frontend) — API at **http://localhost:4000**.  
`npm run dev` starts **both** via `concurrently` — no second terminal.

**Production:**
```bash
npm run build   # vite build → client/dist
npm start       # Express serves API + static dist on PORT
```

Works on macOS/Linux/Windows (`copy .env.example .env` on Windows).

---

## Environment Variables

| Variable | Required | Where |
|---|---|---|
| `ANTHROPIC_API_KEY` | No — fallback deterministic explanations | Server only, never exposed to frontend |
| `RAZORPAY_KEY_ID` | No — simulated test-mode if unset | Server only |
| `RAZORPAY_KEY_SECRET` | No — simulated if unset | Server only |
| `PORT` | No — default `4000` | Server |

`.env` is gitignored. `.env.example` contains placeholders only. No secrets are committed. `audit.log` is gitignored and auto-created.

---

## 60-Second Demo (The One Perfect Flow)

**Merchant:** TechHaven sells **ThinkPad X1 Carbon — ₹65,000**

**AI Buyer says:**
> “I need a laptop for ₹60,000. My user can comfortably pay about ₹5,000/month.”

**FITEMI:**

1. **Dream** — type the sentence → `POST /api/agent/orchestrate` parses intent (`category:laptop`, `maxPrice:66000`, `targetMonthly:5000`)
2. **Discover** — `GET /api/catalog?q=laptop` → filters, shows **ThinkPad X1** + **MacBook Air** with merchant, price, availability
3. **Affordability** — `POST /api/recommend` with `takeHomePay:40000, existingObligations:12000` → backend computes `ceiling:4000` → **Compass** shows `COMFORTABLE ₹4,000/mo`
4. **EMI Spectrum** — `LOWER MONTHLY ←→ LOWER INTEREST` with 3 plans from solver (e.g., `5mo @ ₹4,981` ★ YOUR FIT, `6mo @ ₹4,152`, `6mo @ ₹4,212`), interactive
5. **Trade-off Lab** — switch `Balanced`/`Lower monthly`/`Lower interest`/`Fastest` → re-ranks deterministically, explains `“Choosing lower monthly extends tenure by 1mo, +₹8 interest”`
6. **What-if** — click `Budget +₹1,000` → `CURRENT ₹4,000 → NEW ₹5,000 → NEW OPTIONS` via real `POST /api/recommend`
7. **Deep Plan** — select ★ YOUR FIT → shows `EMI/tenor/interest/total` + `principal vs interest` bar + `Why this plan?` bullets + alternatives
8. **Bounded Checkout** — `YOU ARE ABOUT TO PURCHASE` with `Approve payment` gate (agent `REQUIRES_APPROVAL`)
9. **Razorpay Test-Mode** — `POST /api/checkout/create-order` with `userApproval:true` → real `orders.create` if keys set, else **simulated** `order_sim_…` with clear message `“Simulated — no real charge”` — never claims real payment if simulated
10. **Merchant** — `GET /api/merchant/orders` → `NEW AI BUYER — ThinkPad X1 — Agent selected: ₹4,981/mo — PAID (test-mode)` + revenue insights
11. **Audit** — `GET /api/audit` → timeline `Intent → Product → Affordability → Plan → Approval → Payment → Confirmed` with `requestId`/`durationMs`

**Second Demo — Unknown Budget:**
> “I want this laptop but I don't know what EMI I can afford.” → FITEMI asks 3 questions (take-home → obligations → other) → `POST /api/recommend` with `takeHomePay/existingObligations` → ceiling → spectrum → checkout (same as above).

**Third Demo — Failure (Graceful):**
> `POST {itemPrice:24000, targetMonthlyPayment:500}` → `feasible:false` → UI shows `No feasible plan — Your budget ₹500/mo — Lowest feasible EMI ₹1,163/mo (24mo lenderA) — Try: increase budget / lower-priced product / longer tenure — Ask FITEMI for alternatives` + audit `feasible:false`.

---

## Architecture

```
UI (Warm 3D: cream/peach/lilac/navy, Space Grotesk + Inter)
 ├─ Dream Discovery (natural language + prompts → POST /api/agent/parse)
 ├─ Product/Merchant Discovery (catalog search → GET /api/catalog)
 ├─ Affordability Compass (visual range → POST /api/recommend with takeHome)
 ├─ EMI Spectrum (interactive ★ YOUR FIT → solver)
 ├─ Trade-off Lab (re-rank → deterministic)
 ├─ What-if Simulator (NEW CONSTRAINT → solver)
 ├─ Deep Plan View (EMI/tenor/interest/total + Why)
 ├─ Bounded Checkout (Approve gate → POST /api/checkout/create-order → Razorpay)
 ├─ Merchant Console (GET /api/merchant/orders + insights)
 └─ Audit Timeline (GET /api/audit)

API (Express, auditMiddleware every request)
 ├─ validation → affordability (0.4×) → EMI solver (lenders 3) → feasible/decline → facts → LLM polish → audit → UI
 ├─ /api/catalog, /api/agent/*, /api/checkout/*, /api/merchant/*, /api/recommend (legacy), /api/health, /api/audit
 └─ Static client/dist in prod

Core Libs (deterministic)
 ├─ emiSolver.js — closed-form EMI, smallest n that fits, rank by totalInterest, per-plan explanationFacts
 ├─ affordability.js — 0.4 ceiling, backend truth
 ├─ lenders.js — 3 synthetic (A 1.25% 3-24mo, B 1.08% 6-18mo, C 1.5% 3-12mo)
 ├─ catalog.js — 8 products, 3 merchants, search
 ├─ intentParser.js — deterministic + LLM enhance, never invents numbers
 ├─ razorpay.js — test-mode orders.create (real or simulated with clear boundary)
 ├─ merchant.js — in-memory orders, revenue insights (real + synthetic labeled)
 ├─ agent.js — orchestrate (SEARCH_CATALOG etc. ALLOWED, FINAL_PAYMENT REQUIRES_APPROVAL, DISALLOWED list), validateCheckout guard
 ├─ llmAdvisor.js — 2 fns only (explain, askQuestions), fallback
 └─ auditLog.js — middleware requestId/durationMs/sanitized, auto-creates server/data/audit.log
```

**Agent Action Model:**
```js
{ action: "CREATE_DRAFT_ORDER", productId, plan, amount, requiresApproval:true }
→ validate: product exists, price current, plan feasible per solver, amount matches
→ log → ask user → only then POST /api/checkout/create-order with userApproval:true → Razorpay
```
`DISALLOWED: BYPASS_AFFORDABILITY, CHANGE_PRICE, INVENT_INVENTORY, CHARGE_WITHOUT_APPROVAL, FABRICATE_PAYMENT`

---

## AI Role

**LLM does:** understand `“laptop around ₹60k at ₹5k/mo”` → parse intent, ask missing affordability questions, polish `Why this plan?` wording, concierge suggestions (“You're ₹680 below target — pay sooner?”).

**LLM never does:** decide EMI/interest/tenor/ceiling/feasibility/ranking/amount/charge. Those are solver/backend.

**Deterministic facts per plan:**
```js
{ reason, monthlyPayment, targetBudget, monthlyHeadroom, totalInterest, tenor, rank, reasonLabel }
```

---

## Razorpay Integration

- **Test-mode only** — `RAZORPAY_KEY_ID` must start with `rzp_test_`
- Backend creates order via `orders.create` (SDK or direct API `api.razorpay.com/v1/orders` with `amount*100` paise)
- Frontend never sees `RAZORPAY_KEY_SECRET`
- If keys unset: **truthful simulation** — `order_sim_…`, `isSimulated:true`, message `“Simulated — no real charge. Set RAZORPAY_KEY_ID/SECRET for live test-mode.”` — never claims real payment
- Success/failure/cancel handled, order status updated, merchant sees `PAID` or `awaiting_approval`

**Setup:**
```bash
# https://dashboard.razorpay.com/app/keys → Test mode → Generate
RAZORPAY_KEY_ID=rzp_test_xxxxxxxxxxxxxx
RAZORPAY_KEY_SECRET=xxxxxxxxxxxxxxxxxxxxxxxx
```
Use test card `4111 1111 1111 1111` + any CVV.

---

## Guardrails & Audit

- **Bounded:** `validateCheckout` throws if `!userApproval`; frontend `Approve payment` is the gate.
- **Gated:** Agent `REQUIRES_APPROVAL` for `FINAL_PAYMENT`; `DISALLOWED` list enforced.
- **Explainable:** Every plan has `Why this plan?` from solver facts; global `WhyPanel` shows inputs.
- **Audit:** `auditMiddleware` logs every API request `{timestamp, requestId, method, path, status, durationMs, feasible?, error?}` to `server/data/audit.log` (JSON-lines, sanitized, no secrets). `GET /api/audit` exposes it. `server/data/.gitkeep` keeps dir in fresh clone.

---

## Batch Evaluation

```bash
npm run batch-eval   # → docs/batch-eval-report.md
```

60 synthetic shoppers (4 buckets: comfortable/tight/infeasible/no_budget) through **same solver** — not fabricated.

- Total, feasible/declined, feasibility %, avg tenor/interest, bucket breakdown, full feasible list, **declined audit trail** (most important)

Latest: `38/60 feasible (63.3%, avg 13.2mo, avg ₹3,518)` — see `docs/batch-eval-report.md`.

---

## Verification

```bash
npm run verify   # → scripts/verify-demo.js
```

Checks (real tests, not fake):
```
✓ Server health
✓ Known-number (24000@5000 → feasible + per-plan Why)
✓ Affordability (backend 4000)
✓ No-feasible (500 → feasible:false + minEMI)
✓ Catalog discovery (8 products)
✓ Agent intent parsing (laptop→laptop)
✓ Bounded checkout (requires approval)
✓ Razorpay test order (simulated if no keys)
✓ Audit logging (requestId/duration)
✓ 60-shopper evaluation
✓ Client build
✓ Env (no secret leak)
```

Exit non-zero on critical fail. Example: `31/31 checks passed`.

---

## Local Setup & Test

```bash
npm install
npm run build
npm run batch-eval
npm run verify   # needs backend running (or it will report)
npm run dev      # then test in browser:
# A. Dream: type "laptop around ₹60,000" → Explore
# B. Known-number: My Fit → 24000 + 5000 → 3 plans + Why
# C. Not-sure: Affordability Q&A → ceiling → plans
# D. EMI Spectrum: drag ★ YOUR FIT
# E. Trade-off: switch priorities → re-rank
# F. What-if: Budget +₹1000 → new options
# G. Deep Plan: select ★ → principal/interest bar
# H. Checkout: Approve → Razorpay (simulated if no keys) → Orders
# I. Merchant: see PAID + insights
# J. No-feasible: 24000+500 → graceful + alternatives
# K. Audit: Merchant → timeline + /api/audit
```

Check browser console — no errors.

---

## Known Limitations (Test Mode)

- Razorpay is **test-mode only** — no real money moves. Without `RAZORPAY_KEY_ID/SECRET`, checkout is **simulated** with clear boundary.
- Merchant orders are **in-memory** (demo) — restart clears them; prod would use DB.
- Catalog is **synthetic 8 products** — not a full store.
- Synthetic insights are **labeled demo** — not real business data.

---

## Tech Stack

- Backend: Node.js + Express (ESM), `dotenv`, `cors`, `razorpay` (optional)
- Frontend: React 18 + Vite, plain CSS (warm 3D theme)
- AI: `llmAdvisor.js` + `intentParser.js` (Anthropic Claude Haiku, deterministic fallback)
- Data: JSON `server/data`, `audit.log` JSON-lines
- No real bank calls — 3 synthetic lenders

---

## Repository Structure

```
FITEMI/
├── package.json (root workspaces)
├── .env.example
├── scripts/verify-demo.js
├── server/
│   ├── src/
│   │   ├── index.js (Express + auditMiddleware + catalog/agent/checkout/merchant)
│   │   ├── routes/{recommend,catalog,agent,checkout,merchant}.js
│   │   └── lib/{emiSolver,affordability,lenders,catalog,intentParser,razorpay,merchant,agent,llmAdvisor,auditLog}.js
│   ├── data/{.gitkeep,shoppers.json,audit.log(ignored)}
│   └── scripts/{generateShoppers,runBatchEval}.js
├── client/
│   ├── src/{App.jsx,styles/theme.css,components/*}
│   └── vite.config.js (proxy /api → :4000)
└── docs/batch-eval-report.md
```

---

## Files Changed (this iteration)

- `server/scripts/agentBuyerDemo.js` — new external agent demo (orchestrate → recommend → checkout)
- `server/docs/API_SCHEMA.md` — new agent-callable API spec (orchestrate/recommend/create-order)
- `ARCHITECTURE.md` — added "Agent-to-Agent Commerce Protocols" section
- `server/src/lib/llmAdvisor.js` — 8s timeout + [LLM_FALLBACK] logging, robust deterministic fallback
- `server/src/lib/auditLog.js` — hash-chain (SHA-256) per entry + verifyAuditLog()
- `server/src/index.js` — added GET /api/audit/verify
- `client/src/App.jsx` — audit integrity indicator + verify fetch in Merchant Audit Timeline
- `server/src/lib/emiSolver.js` — zero-rate handling (P/n)
- `server/test/emiSolver.test.js` — new unit tests (node:test)
- `server/scripts/evalCheck.js` — new regression guard (feasible ≥50%, avg tenor ≤24mo)
- `server/package.json` — added scripts demo:agent, test, eval:check
- `package.json` — added scripts demo:agent, test, eval:check
- `README.md` — added For Evaluators + this file list
- `client/src/styles/theme.css` + `client/src/App.jsx` visual cleanup from prior iteration (sparkle, dot-joins, arrows, hero em, rule-line, mono prices, radius)
```
