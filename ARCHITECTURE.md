# Architecture

Affordability-Matched EMI Agent is a small, deliberately bounded system: deterministic money logic at the core, an LLM that only explains and asks questions, a thin API that gates and logs, and a single-page frontend. The AI never decides a number; the solver never generates prose.

## Components

1. **EMI Solver (`server/src/lib/emiSolver.js:1`)** — Pure function `emiForTenor(P, r, n)` and `findFeasiblePlans(principal, target, lenders)`. For each synthetic lender it loops `n` from `minTenor` to `maxTenor`, picks the smallest `n` with EMI ≤ target (fastest payoff = least interest), ranks up to 3 options by total interest. If `target ≤ P×r` for a lender, that lender is skipped — the payment doesn't cover interest and the loan never amortizes.

2. **Affordability Ceiling (`server/src/lib/affordability.js:1`)** — `computeAffordabilityCeiling({ takeHomePay, existingObligations })` → `max(0, floor(0.4 × takeHomePay − existingObligations))`. The `0.4` is a named constant `AFFORDABILITY_RATIO` (heuristic, not a regulatory figure). Its output is a **hard ceiling**: `routes/recommend.js:58` caps any `targetMonthlyPayment` at the ceiling before solving. No other layer — including the LLM — may recommend above it.

3. **AI Layer (`server/src/lib/llmAdvisor.js:1`)** — Exactly two exported functions: `explainRecommendation(options, inputs)` (prose only, never invents a number) and `askAffordabilityQuestions(conversationSoFar)` (collects income/obligations, never decides a tenor). Both call a shared `callClaude()` helper that reads `ANTHROPIC_API_KEY` from env and falls back to deterministic templates when the key is absent or the call fails. Provider is isolated to this one file.

4. **Frontend (`client/src/`)** — Single page `App.jsx:1` orchestrating `PurchaseForm.jsx` (price + budget or "help me figure it out"), `AffordabilityQuiz.jsx` (3-step Q&A), `PlanOptions.jsx` (ranked cards + no-plan graceful message + interest-saved highlight), and `WhyPanel.jsx` (plain-language explanation + visible inputs). No extra routes; one complete flow.

## Request Flow

```
Browser                          Express (/api/recommend)                     Core libs
  │                                     │                                        │
  ├─ POST {itemPrice, target} ─────────►│                                        │
  │        or {takeHome, oblig}         │── validateInputs ─────────────────────►│
  │        or {conversationHistory}      │                                        │
  │                                     │── if conversation → askAffordabilityQ ─► llmAdvisor
  │                                     │── else computeAffordabilityCeiling ──► affordability.js
  │                                     │── cap target at ceiling (gated)        │
  │                                     │── findFeasiblePlans ─────────────────► emiSolver + lenders
  │                                     │── explainRecommendation ─────────────► llmAdvisor (+ fallback)
  │                                     │── appendAuditLog (every call) ───────► audit.log (JSON-lines)
  │◄── {feasible, options, explanation}─┤                                        │
  │                                     │                                        │
```

## Audit & Failure Handling

Every `POST /api/recommend` appends one JSON line to `server/data/audit.log` **before** returning — success, declined, and validation-error cases alike (`routes/recommend.js:30`, `auditLog.js:1`). The batch script `scripts/runBatchEval.js` reuses the same solver path offline and emits `docs/batch-eval-report.md` with a full declined list as the audit trail. Validation failures return `400` with a specific message; the solver's "no feasible plan" returns `200` with `feasible: false` and a non-alarming explanation — never a crash or hallucinated plan. `GET /api/audit` exposes the log as JSON for debugging.

## Diagram

```
┌─────────────┐     ┌──────────────────────────────────┐     ┌─────────────────┐
│   React     │────►│  Express  /api/recommend         │────►│ emiSolver       │
│  (Vite)     │◄────│  validation + ceiling gating     │◄────│ lenders (3)     │
└─────────────┘     │  auditLog (append-only)          │     └─────────────────┘
                    │           │                      │     ┌─────────────────┐
                    │           ├──────────────────────┼────►│ affordability   │
                    │           │                      │     │ 0.4×pay-oblig   │
                    │           ├──────────────────────┼────►│ llmAdvisor      │
                    │           │  explain + quiz only │     │ Claude / fallback│
                    └───────────┴──────────────────────┘     └─────────────────┘
```

Synthetic lenders and shoppers live as JSON under `server/data/`; no database or external payment APIs are involved.
