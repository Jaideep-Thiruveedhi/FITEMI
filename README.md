# FITEMI — Affordability-Matched EMI Agent

For **Razorpay AI Buildathon — Track 01 (AI Growth & Agentic Commerce)**  
Built by: Jaideep, using Muse Code / Muse Spark 1.2

FITEMI replaces fixed EMI tenure buttons (6/12/24 months) with one question: **"how much can you actually pay per month?"** It solves for the shortest tenor that fits (least total interest), offers ranked alternatives each with its own deterministic "why", and — for buyers who don't know their number — runs a short affordability Q&A where the **backend** computes a safe ceiling (`0.4 × take-home − obligations`). When nothing fits, it says so clearly with the lowest feasible EMI, instead of forcing a bad plan. Every recommendation is explainable, bounded, and audit-logged.

> Core principle: *Don't recommend an EMI just because it exists. Recommend it only when it fits the user's budget, explain why, and honestly say no when nothing feasible exists.*

## Features

- **EMI recommendation** — deterministic solver across 3 synthetic lenders, ranked by total interest
- **Affordability flow** — backend is the source of truth for ceiling calculation
- **No-feasible-plan handling** — graceful decline with `minFeasibleEmi`, not a crash or hallucinated plan
- **Explainable recommendations** — per-plan deterministic facts (`reason`, `headroom`, `rank`) + optional LLM polish; LLM never decides numbers
- **Deterministic financial calculations** — closed-form EMI, no LLM in the money path
- **Optional AI explanations** — `llmAdvisor.js` isolated to 2 functions, falls back deterministically without `ANTHROPIC_API_KEY`
- **Audit logging** — middleware logs every request with `requestId`, `durationMs`, sanitized outcome; `server/data/audit.log` (gitignored)
- **Batch evaluation** — 60 synthetic shoppers, `docs/batch-eval-report.md` with feasibility rate and declined audit trail

## Quick Start

```bash
git clone https://github.com/Jaideep-Thiruveedhi/FITEMI.git
cd FITEMI
cp .env.example .env
# Edit .env and set ANTHROPIC_API_KEY (optional — fallback works without it)
npm install
npm run dev
```

Open http://localhost:5173 (Vite proxies `/api` to http://localhost:4000). No second terminal required — `npm run dev` at the root starts both frontend and backend via `concurrently`.

**Production:**

```bash
npm run build   # builds client to client/dist
npm start       # serves API + static client/dist on PORT (default 4000)
```

Works on macOS, Linux, and Windows (use `copy .env.example .env` on Windows, or `cp` on Unix).

## Environment Variables

All env vars live at the repository root (`.env`). Only one value needs to be set:

| Variable | Required | Description |
|---|---|---|
| `ANTHROPIC_API_KEY` | No | For LLM-polished explanations. If unset, deterministic fallback is used. Never exposed to the frontend. |
| `PORT` | No | Backend port (default `4000`). Frontend Vite proxy follows this. |

`.env` is gitignored. `.env.example` contains placeholders only (`sk-ant-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`). No secrets are committed. The server loads `.env` from the repo root (`server/src/index.js:13`).

## Demo Flow — 60-Second Judge Walkthrough

### Demo A — I know my number

1. Enter **Item price:** `24000`
2. Enter **How much can you pay per month:** `5000`
3. Click **Find my EMI plans**

→ **Expected:** 3 ranked plans. Best is `lenderA 5 months @ ₹4,981.49` (lowest interest). Each card shows **Why this plan?** with its own reason (`lowest_total_interest`, `lowest_monthly_payment`, etc.) and headroom. Global "why" panel shows inputs. Request is audit-logged.

```bash
curl -X POST http://localhost:4000/api/recommend \
  -H "Content-Type: application/json" \
  -d '{"itemPrice":24000,"targetMonthlyPayment":5000}'
```

### Demo B — I'm not sure

1. Click **Not sure? Help me figure it out**
2. Step 1: `40000` (take-home), Step 2: `12000` (obligations), Step 3: `5000` (other)
3. Click **Done** → summary shows collected inputs (ceiling computed on backend, not frontend)
4. Enter **Item price:** `24000` → **Find my EMI plans**

→ **Expected:** Backend computes ceiling `₹4,000` (`0.4×40000−12000`), shows affordability ceiling badge, returns feasible plans capped at ceiling. Frontend never decides the ceiling.

```bash
curl -X POST http://localhost:4000/api/recommend \
  -H "Content-Type: application/json" \
  -d '{"itemPrice":24000,"takeHomePay":40000,"existingObligations":12000}'
```

### Demo C — No feasible plan

1. Enter **Item price:** `24000`
2. Enter **Budget:** `500`
3. Click **Find my EMI plans**

→ **Expected:** `feasible: false` card:
```
No feasible plan
Your budget: ₹500/month
Lowest feasible EMI: ₹1,163.68/month (18 months, lenderB)
We won't recommend a plan that exceeds your stated budget.
Try: increasing your monthly budget / lower-priced item / larger down payment
```
Solver (not hard-coded) computed `minFeasibleEmi`.

```bash
curl -X POST http://localhost:4000/api/recommend \
  -H "Content-Type: application/json" \
  -d '{"itemPrice":24000,"targetMonthlyPayment":500}'
```

## API

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/recommend` | Main recommendation (see demos above) |
| `POST` | `/api/recommend/quiz` | Step-by-step affordability Q&A (optional) |
| `GET` | `/api/audit` | Debug: returns audit log as JSON |
| `GET` | `/api/health` | Health check |

Every `POST /api/recommend` is logged by middleware (`server/src/lib/auditLog.js:31`) with `requestId`, `method`, `path`, `status`, `durationMs` before the response returns. No API keys are logged.

## Batch Evaluation

```bash
npm run batch-eval
# also: npm run batch-eval --workspace=server
# or:   node server/scripts/runBatchEval.js
```

Loads `server/data/shoppers.json` (60 shoppers, 4 buckets: comfortable/tight/infeasible/no_budget) through the same solver the API uses and writes `docs/batch-eval-report.md`:

- Total evaluated, feasible vs. declined, feasibility %
- Average tenor and average interest (feasible only)
- Bucket breakdown
- Full feasible list and **declined audit trail** (most important section)

Latest run: **38/60 feasible (63.3%, avg 13.2mo, avg ₹3,518)** — see `docs/batch-eval-report.md`.

## Verification

```bash
npm run verify
# runs scripts/verify-demo.js
```

Checks:

```
✓ Server health
✓ Known-number flow (with per-plan Why)
✓ Affordability flow (backend source of truth)
✓ No-feasible-plan flow (min EMI + graceful reason)
✓ Audit logging (file, requestId, sanitized)
✓ Batch evaluation (60 shoppers, report)
✓ Client build
✓ Environment configuration
```

Exits non-zero if a critical check fails. Example success:

```
FITEMI Definition of Done
─────────────────────────

✓ Environment configuration — .env.example exists
...
✓ Server health — http://localhost:4000/api/health
✓ Known-number flow — ₹24000 @ ₹5000 → 5mo
✓ Affordability flow — ceiling ₹4000 (expected 4000)
✓ No-feasible-plan flow — ₹24000 @ ₹500 → feasible:false
✓ Audit entries created (live)

31/31 checks passed
All checks passed ✓
```

The script starts from a fresh clone: `server/data/.gitkeep` ensures the audit directory exists; `audit.log` is created automatically.

## Tech Stack

- **Backend:** Node.js + Express, plain JavaScript (ES modules)
- **Frontend:** React 18 + Vite, plain CSS
- **Data:** JSON under `server/data/`, append-only `audit.log` (JSON-lines)
- **AI:** `server/src/lib/llmAdvisor.js` — 2 functions only, Anthropic Claude Haiku, deterministic fallback
- **No real bank/NBFC calls** — 3 synthetic lenders

## Repository Structure

```
FITEMI/
├── package.json          # root workspaces + concurrently dev
├── .env.example          # ANTHROPIC_API_KEY placeholder
├── scripts/
│   └── verify-demo.js    # Definition of Done verifier
├── server/
│   ├── src/
│   │   ├── index.js              # Express + auditMiddleware + static client/dist
│   │   ├── routes/recommend.js   # validation + affordability gating + solver
│   │   └── lib/
│   │       ├── emiSolver.js      # emiForTenor + findFeasiblePlans + facts + min EMI
│   │       ├── lenders.js        # 3 synthetic lenders
│   │       ├── affordability.js  # 0.4 ceiling (backend source of truth)
│   │       ├── llmAdvisor.js     # explainRecommendation + askAffordabilityQuestions
│   │       └── auditLog.js       # auditMiddleware (requestId, duration, sanitized)
│   ├── data/
│   │   ├── .gitkeep
│   │   ├── shoppers.json (60)
│   │   └── audit.log (ignored, created at runtime)
│   └── scripts/
│       ├── generateShoppers.js
│       └── runBatchEval.js
├── client/
│   ├── src/
│   │   ├── App.jsx
│   │   └── components/
│   │       ├── PurchaseForm.jsx      # collects only, no ceiling calc
│   │       ├── AffordabilityQuiz.jsx # collects inputs, backend decides
│   │       ├── PlanOptions.jsx       # per-plan Why + no-feasible with min EMI
│   │       └── WhyPanel.jsx
│   └── vite.config.js (proxy /api → :4000)
└── docs/
    └── batch-eval-report.md
```

## Known Failure Handling

Never crashes or hallucinates on bad input:

| Input | Response |
|---|---|
| `itemPrice: -5000` | `400 { error: "itemPrice must be greater than 0." }` |
| `targetMonthlyPayment: 0` | `400 { error: "Monthly budget must be greater than 0..." }` |
| `takeHomePay: 20000, existingObligations: 25000` | `400 { error: "Existing obligations exceed take-home pay..." }` |
| `itemPrice: 24000, targetMonthlyPayment: 500` | `200 { feasible:false, minFeasibleEmi:1163.68, ... }` |

All are audit-logged via middleware.
