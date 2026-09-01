# Decisions — Why FITEMI Is Built This Way

**Core principle:** *FITEMI turns affordability into an agentic commerce decision.* Not “What EMI do you have?” but “I want this. Find me a comfortable way.”

- **Deterministic EMI solver, not LLM** — money math must be auditable, reproducible, and explainable. LLM is non-deterministic and hallucinates numbers. `emiSolver.js` closed-form, smallest n that fits, rank by `totalInterest`, per-plan `explanationFacts`.

- **Why LLM is explanation-only** — Track 01 requires “every money action explainable, bounded and gated.” If LLM set EMI/tenor/ceiling, it would violate boundedness and audit. LLM only parses intent, asks questions, polishes `reasonLabel`; solver decides numbers.

- **3 synthetic lenders (A 1.25% 3-24mo, B 1.08% 6-18mo, C 1.5% 3-12mo)** — spans APR/tenor so ranking is visible. Real bank calls out of scope and would need compliance; synthetic is explicitly allowed.

- **Synthetic catalog (8 products, 3 merchants)** — small polished demo, not a giant store. Agent-readable `GET /api/catalog/agent/readable` proves merchant transactability without building Amazon.

- **Why unaffordable is declined, not forced** — core honesty: no feasible plan → `feasible:false` + `minFeasibleEmi` + alternatives (increase budget / lower-priced / longer tenure). Never push a bad plan.

- **Affordability 0.4 as `AFFORDABILITY_RATIO`, backend truth** — heuristic `max(0, floor(0.4× takeHome − obligations))`, not regulatory. Frontend `AffordabilityQuiz`/`PurchaseForm` only collect; `affordability.js` computes and caps `targetMonthlyPayment`. Prevents tampering, single source of truth.

- **Why audit middleware, not per-route manual** — guarantees every API request is logged (`requestId`, `durationMs`, `method/path/status`, sanitized) even if new route added; manual per-route is error-prone. `auditLog.js` middleware auto-creates `server/data/audit.log`, `server/data/.gitkeep` keeps dir in fresh clone, `audit.log` gitignored as runtime.

- **Per-plan deterministic Why, not global WhyPanel** — each card's `Why this plan?` from `explanationFacts` (`reason`, `headroom`, `rank`, `reasonLabel`) — `lowest_total_interest`/`lowest_monthly_payment`/`best_budget_headroom`. Global `WhyPanel` remains as secondary, but every plan independently answers.

- **Agent action model: ALLOWED / REQUIRES_APPROVAL / DISALLOWED** — `agent.js` `ALLOWED: SEARCH_CATALOG, COMPARE_PLANS, GENERATE_RECOMMENDATION, CREATE_DRAFT_ORDER`; `REQUIRES_APPROVAL: FINAL_PAYMENT`; `DISALLOWED: BYPASS_AFFORDABILITY, CHANGE_PRICE, INVENT_INVENTORY, CHARGE_WITHOUT_APPROVAL, FABRICATE_PAYMENT`. `validateCheckout` checks product/price/plan/feasibility before Razorpay.

- **Razorpay test-mode with truthful simulation boundary** — real `orders.create` via SDK or direct `api.razorpay.com/v1/orders` (amount×100 paise) when `RAZORPAY_KEY_ID/SECRET` set (test keys `rzp_test_…`); otherwise returns `order_sim_…` with `isSimulated:true` and message `“Simulated — no real charge. Set RAZORPAY_KEY_ID/SECRET…”` — never claims real payment if simulated. Secrets server-only, frontend never sees.

- **Merchant in-memory + synthetic insights** — `merchant.js` stores orders in memory (demo; prod would be DB), `getRevenueInsights` returns `real` (total/paid/awaiting) + `syntheticInsights` (3 shoppers abandoned, 12-mo plan +26% etc.) clearly labeled `synthetic` with disclaimer. Proves FITEMI helps merchants convert, without fabricating real performance.

- **Warm 3D visual identity (cream/peach/lilac/navy, Space Grotesk, soft shadows, rounded)** — chosen from “Deep Fin-Tech Interactions” reference: many purposeful interactions (spectrum, compass, trade-off, what-if) as one product, not generic dashboard/calculator/ChatGPT clone. Illustrations strategic, not on every screen.

- **Interaction over forms** — sliders, spectrum, map, timeline, comparison, reveal over long forms/dense tables. Motion purposeful (plans slide, ★YOUR FIT expands, numbers transition).

- **Root workspaces + concurrently one-command** — `npm install` + `npm run dev` at root starts both via `concurrently`; `npm run build`/`start`/`batch-eval`/`verify` at root. No second terminal, platform-friendly `cp`/`copy`.

- **Security: `.env` gitignored, `.env.example` placeholders only, `audit.log` gitignored, no `ANTHROPIC_API_KEY`/`RAZORPAY_SECRET` in client, sanitize audit** — verified by `scripts/verify-demo.js`.

- **Plain JS (ESM) over TS, closed-form EMI, Vite proxy /api→:4000 + Express static dist in prod** — small surface for demo, single PORT.
