# Architecture

FITEMI is deliberately bounded: deterministic money logic at the core, LLM that only explains, thin API that gates and logs, single-page frontend. The AI never decides a number; the solver never generates prose.

## Flows

```
                    FITEMI UI
                       │
             ┌─────────┴─────────┐
             │                   │
       Know my number        I'm not sure
             │                   │
      Monthly budget       Affordability Q&A
    (PurchaseForm)      (AffordabilityQuiz)
             │                   │
             └─────────┬─────────┘
                       ↓
                POST /api/recommend
                       ↓
                Input validation
                       ↓
              Affordability layer
        (affordability.js — backend source of truth,
         0.4 × takeHome − obligations, caps target)
                       ↓
                  EMI Solver
              (emiSolver.js: findFeasiblePlans)
                       ↓
              Synthetic lenders
           (lenders.js: 3 profiles, 3–24mo)
                       ↓
              Feasible / Decline
    (feasible → ranked options; decline → minFeasibleEmi)
                       ↓
          Deterministic explanation facts
    (per-plan: rank, headroom, reason, reasonLabel)
                       ↓
              Optional LLM wording
           (llmAdvisor.js — polish only, never numbers)
                       ↓
                  Audit log
         (auditLog.js middleware: requestId, durationMs)
                       ↓
                       UI
         (PlanOptions: per-card Why; WhyPanel: global)
```

## Components

1. **EMI Solver (`server/src/lib/emiSolver.js:1`)** — `emiForTenor(P,r,n)` closed-form, `findFeasiblePlans(principal, target, lenders)` loops `n` from `minTenor` to `maxTenor`, picks smallest `n` with EMI ≤ target (fastest payoff = least interest), ranks by `totalInterest` (top 3). If no candidate, returns `feasible:false` with `minFeasibleEmi/minTenor/minLender` (lowest EMI at max tenor across all lenders). For feasible cases, each option is enriched with `explanationFacts: { monthlyPayment, targetBudget, monthlyHeadroom, totalInterest, tenor, rank, reason, reasonLabel }` deterministically — reasons include `lowest_total_interest`, `lowest_monthly_payment`, `best_budget_headroom`, `alternative_tenure`.

2. **Affordability Ceiling (`server/src/lib/affordability.js:1`)** — `computeAffordabilityCeiling({ takeHomePay, existingObligations }) => max(0, floor(0.4 × takeHomePay − existingObligations))` with named `AFFORDABILITY_RATIO = 0.4` (heuristic, not regulatory). Called **only** in `routes/recommend.js:65` (backend). Frontend `AffordabilityQuiz.jsx:1` and `PurchaseForm.jsx:1` collect inputs but never compute the ceiling; backend caps `targetMonthlyPayment` at ceiling (bounded & gated). This makes the backend the single source of truth.

3. **AI Layer (`server/src/lib/llmAdvisor.js:1`)** — Exactly 2 exports: `explainRecommendation(solverResult, inputs)` (prose only, uses exact numbers from solver, fallback template if `ANTHROPIC_API_KEY` missing) and `askAffordabilityQuestions(conversationSoFar)` (collects income/obligations, never decides tenor/EMI). Both share `callClaude()` isolated to this file (`model: claude-3-5-haiku-20241022`). LLM never influences `emi`, `tenor`, `interest`, `affordability`, `feasibility`, or ranking.

4. **Audit Middleware (`server/src/lib/auditLog.js:31`)** — `auditMiddleware` runs for every request, assigns `requestId = req_${Date.now()}_${randomHex}`, wraps `res.json` to capture business outcome, and on `finish` appends one JSON line to `server/data/audit.log` with `{ timestamp, requestId, method, path, status, durationMs, feasible?, error?, targetMonthlyPayment?, affordabilityCeiling? }` plus a sanitized `requestSummary` (no API keys, no full financial payload). Directory/file are created automatically; `server/data/.gitkeep` ensures the directory exists in a fresh clone. `GET /api/audit` exposes the log for debugging.

5. **API (`server/src/index.js:1`, `server/src/routes/recommend.js:1`)** — Express with `cors`, `express.json()`, `auditMiddleware` first, then `/api/health`, `/api/recommend` (validation → affordability → solver → LLM polish → response), `/api/audit`. In production, `client/dist` is served statically on the same `PORT`. `.env` is loaded from the repo root (`../../.env`).

6. **Frontend (`client/src/`)** — Single page `App.jsx:1` → `PurchaseForm.jsx` (price + budget or "help me figure it out" → collects affordability inputs, sends `takeHomePay/existingObligations` to backend) → `AffordabilityQuiz.jsx` (3-step collector, no ceiling math) → `PlanOptions.jsx` (ranked cards, per-card `Why this plan?` from `explanationFacts`, no-feasible card with `Your budget` vs `Lowest feasible EMI` and remediation steps) → `WhyPanel.jsx` (global explanation + inputs). No extra routes.

## Request Example

```
Browser                          Express (/api/recommend)
  │                                     │
  ├─ POST {itemPrice:24000,             │
  │        takeHomePay:40000,            │── validateInputs
  │        existingObligations:12000}    │── computeAffordabilityCeiling → 4000
  │                                     │── cap target at 4000
  │                                     │── findFeasiblePlans(24000,4000)
  │                                     │   → [{lenderB 7mo 3578}, …] + facts
  │                                     │── explainRecommendation (LLM or fallback)
  │                                     │── auditMiddleware logs {requestId, durationMs, feasible:true}
  │◄── {feasible:true, options:[{       │
  │      emi, tenor, facts,             │
  │      explanationFacts:{reasonLabel}}]} 
```

All synthetic data lives as JSON under `server/data/`; no database or external payment APIs.
