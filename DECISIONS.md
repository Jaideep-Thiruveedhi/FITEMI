# Decisions & Assumptions

One line each, with why.

- **Plain JavaScript (ES modules) over TypeScript** — smaller surface for a deadline; types add friction without changing correctness.
- **EMI computed by closed-form with Math.pow** — matches the brief's `emiForTenor` signature and is numerically identical for fixed-rate EMIs.
- **EMI solver is the single source of truth for numbers** — `emiSolver.js` decides `emi`, `tenor`, `interest`, `feasibility`, `ranking`; `llmAdvisor.js` only polishes wording. Prevents hallucinated financial figures.
- **Why EMI calculations are deterministic** — money math must be auditable and reproducible; LLM output is non-deterministic and not suitable for financial decisions.
- **Why LLM does not determine financial numbers** — track bar requires "every money action explainable, bounded and gated"; allowing LLM to set tenure/EMI would violate boundedness and create audit risk.
- **Lender rates: A 1.25%/mo (3–24mo), B 1.08%/mo (6–18mo), C 1.50%/mo (3–12mo)** — spans low/mid/high APR with overlapping windows so ranking is visible.
- **Synthetic lender data, no real bank/NBFC calls** — explicitly allowed by hackathon; avoids PII, credentials, and network flakiness for a demo.
- **Why synthetic data is used** — Razorpay tracks expect synthetic data; real payment integrations are out of scope and would require compliance.
- **Affordability ratio 0.4 as named constant `AFFORDABILITY_RATIO`** — brief's heuristic; tunable without code changes; commented as not a verified regulatory figure.
- **Why unaffordable recommendations are declined rather than forced** — core value proposition: never push a plan that exceeds budget; declining is honest and prevents defaults. Solver returns `feasible:false` with `minFeasibleEmi` so the UI can suggest remediation.
- **Affordability calculation on backend only** — `AffordabilityQuiz.jsx` and `PurchaseForm.jsx` collect inputs, `affordability.js` computes ceiling on the server. Prevents frontend tampering and keeps one source of truth.
- **Why audit logging exists** — track bar requires "visible audit trail and at least one failure handled gracefully"; middleware proves every request (success/decline/error) is logged before response.
- **Why audit logging is middleware, not per-route manual calls** — guarantees coverage even if a new route is added; reduces duplication and missed logs.
- **Audit log is JSON-lines file with requestId/duration, sanitized payload, auto-created** — no DB needed per brief; `server/data/.gitkeep` keeps the directory in a fresh clone; `audit.log` is gitignored as runtime data.
- **Fallback explanations are deterministic templates, not stubs** — ensures "visible why" works offline without `ANTHROPIC_API_KEY`.
- **Per-plan deterministic `explanationFacts` (rank, headroom, reason, reasonLabel)** — each card's "Why this plan?" comes from solver, not a single global LLM paragraph; reasons include `lowest_total_interest`, `lowest_monthly_payment`, `best_budget_headroom`.
- **No-feasible UI shows `Your budget` vs `Lowest feasible EMI` with remediation** — uses solver's `minFeasibleEmi/minTenor/minLender`, not hard-coded numbers.
- **Batch buckets 15/15/15/15 even** — sanity-checkable breakdown (comfortable 100% feasible, infeasible 0%).
- **Root workspaces + `concurrently` for one-command startup** — `npm install && npm run dev` at root starts both `client` and `server` without a second terminal; `npm run build`/`npm start` provide production path.
- **Root `.env` single source of truth (`cp .env.example .env`)** — platform-friendly (Unix `cp` / Windows `copy`), server loads from `../../.env`; frontend never sees `ANTHROPIC_API_KEY`.
- **`.env` gitignored, `.env.example` placeholders only, `audit.log` gitignored** — security: no secrets committed; verified by `scripts/verify-demo.js`.
- **Vite proxy `/api → :4000` in dev, Express static `client/dist` in prod** — single `PORT` deployment without CORS issues either way.
- **`otherExpenses` collected but not in 0.4 formula** — reserved for future DTI extension; avoids silently changing the rule mid-hackathon.
