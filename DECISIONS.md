# Decisions & Assumptions

One line each, with why.

- **Plain JavaScript (ES modules) over TypeScript** — smaller surface for a hackathon deadline; types would add build friction without changing correctness.
- **EMI computed by closed-form with Math.pow, not iteration over amortization schedule** — matches the brief's `emiForTenor` signature exactly and is numerically identical for fixed-rate EMIs.
- **Lender rates: A 1.25%/mo (3–24mo), B 1.08%/mo (6–18mo), C 1.50%/mo (3–12mo)** — spans low/medium/high APR with overlapping tenure windows so the solver's ranking is visible.
- **Affordability ratio fixed at 0.4** — brief's heuristic; exposed as `AFFORDABILITY_RATIO` constant so it can be tuned without code changes.
- **`otherExpenses` collected but not used in ceiling formula** — kept for future extension (e.g. DTI that includes living costs) and for the batch report; avoids silently changing the 0.4 rule mid-hackathon.
- **Quiz runs locally in React (3 steps) with deterministic ceiling, server `/quiz` as optional LLM-enhanced wording** — guarantees the flow works offline/demo-laptop without an API key while still satisfying the "AI asks questions" requirement.
- **Fallback explanations are deterministic templates, not LLM stubs** — ensures the "visible why" and audit trail work even when `ANTHROPIC_API_KEY` is unset or rate-limited.
- **Model pinned to `claude-3-5-haiku-20241022`** — cheapest/fastest Claude that still follows the "never invent a number" system prompt; isolated to one file so swapping provider is one edit.
- **Audit log is JSON-lines file, not SQLite** — brief explicitly says no real DB needed; append-only file is trivially inspectable and matches the required path `server/data/audit.log`.
- **Batch buckets split 15/15/15/15 even** — makes the report's bucket breakdown easy to sanity-check (comfortable 100% feasible, infeasible 0%, etc.).
- **Price ranges in generator: ₹15k–100k** — realistic phone/electronics cart values for the target user story (₹24k phone).
- **No `cors` restriction / no auth on `/api/audit`** — acceptable for a local hackathon demo; would be gated behind auth in production.
- **Vite proxy for `/api` in dev, Express static serve of `client/dist` in prod** — single `PORT` deployment without CORS issues either way.
- **Cut nice-to-haves didn't cut audit endpoint** — kept `GET /api/audit` because it was one function and useful for live demo verification; cut in-app batch-report viewer and Razorpay checkout styling instead.
