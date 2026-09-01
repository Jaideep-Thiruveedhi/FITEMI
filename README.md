# Affordability-Matched EMI Agent — Track 01

For **Razorpay AI Buildathon — Track 01 (AI Growth & Agentic Commerce)**  
Built by: Jaideep, using Muse Code / Muse Spark 1.2

A checkout agent that replaces fixed EMI tenure buttons (6/12/24 months) with a single question: **"how much can you actually pay per month?"** It solves for the shortest tenor that fits, offers nearby alternatives, and — for buyers who don't know their number — runs a short affordability Q&A to propose a safe ceiling. When no tenor can responsibly fit, it says so clearly instead of forcing a bad plan. Every recommendation is explainable and logged.

## The Problem (2–3 sentences)

Standard checkout forces buyers into fixed tenures. A salaried buyer with ₹5,000/mo free for a ₹24,000 phone might pay more total interest than needed on a forced 6-month plan, while another with ₹3,000/mo gets declined outright even though a 9-month plan would work. This agent fixes both: it finds the *fastest payoff that fits* the buyer's real budget, or honestly declines when nothing fits.

## How to Run Locally

### Prerequisites
- Node.js 18+ and npm

### 1. Clone & install

```bash
git clone <repo-url>
cd "Dristi AI"

# Server
cd server && npm install && cd ..

# Client
cd client && npm install && cd ..
```

### 2. Environment variables

```bash
# From repo root
copy .env.example server\.env
# Edit server/.env and set your key:
# ANTHROPIC_API_KEY=sk-ant-xxxxxxxx
# PORT=4000
```

> The LLM advisor works with or without a key. Without `ANTHROPIC_API_KEY` it falls back to deterministic plain-language explanations. No key is ever committed — `.env` is gitignored from the first commit.

### 3. Generate synthetic data & run batch eval (optional but recommended)

```bash
cd server
node scripts/generateShoppers.js   # generates 60 shoppers -> server/data/shoppers.json
node scripts/runBatchEval.js       # evaluates all 60 -> docs/batch-eval-report.md
cd ..
```

### 4. Start the stack (two terminals)

```bash
# Terminal 1 — backend (http://localhost:4000)
cd server && npm run dev

# Terminal 2 — frontend (httpermalhost:5173)
cd client && npm run dev
```

Open http://localhost:5173. The Vite dev server proxies `/api` to `http://localhost:4000`.

### 5. Production build (optional)

```bash
cd client && npm run build
# Then visit http://localhost:4000 — Express serves client/dist statically
```

## API

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/recommend` | Main recommendation endpoint |
| `POST` | `/api/recommend/quiz` | Step-by-step affordability Q&A |
| `GET` | `/api/audit` | Debug: returns audit log as JSON |
| `GET` | `/api/health` | Health check |

### `POST /api/recommend` — request body

```json
{
  "itemPrice": 24000,
  "targetMonthlyPayment": 5000
}
```
or with affordability:
```json
{
  "itemPrice": 24000,
  "takeHomePay": 40000,
  "existingObligations": 12000,
  "otherExpenses": 5000
}
```
or with conversation history:
```json
{
  "itemPrice": 24000,
  "conversationHistory": [{ "role": "user", "content": "45000" }]
}
```

Response includes `feasible`, `options` (up to 3 ranked by total interest), `explanation`, and `meta`. Every call — success or decline — appends one JSON line to `server/data/audit.log` before responding.

## Batch Evaluation

`server/scripts/runBatchEval.js` loads `server/data/shoppers.json`, runs every record through the same solver logic the API uses, and writes `docs/batch-eval-report.md`:

- Total evaluated, feasible vs. declined counts
- Average tenor and average total interest (feasible only)
- **Full declined list with specific reasons** — the audit trail proving honesty

Latest run: **38/60 feasible (63.3%), avg tenor 13.2mo, avg interest ₹3,518**. See `docs/batch-eval-report.md`.

## Known Failure Handling

The API never crashes or hallucinates a plan on bad input. Validated manually:

| Input | Response |
|---|---|
| `itemPrice: -5000, targetMonthlyPayment: 3000` | `400 { error: "itemPrice must be greater than 0." }` — logged to audit.log |
| `itemPrice: 24000, targetMonthlyPayment: 0` | `400 { error: "Monthly budget must be greater than 0. Based on your affordability inputs, there is no room for additional EMI." }` |
| `itemPrice: 24000, takeHomePay: 20000, existingObligations: 25000` | `400 { error: "Existing obligations exceed take-home pay — no room for additional EMI." }` |
| `itemPrice: 24000, targetMonthlyPayment: 500` (below min EMI) | `200 { feasible: false, reason: "No lender can offer a plan within your monthly budget..." }` — graceful "no feasible plan" card in UI |

All four return specific validation messages; none silently substitute defaults. Every case is appended to `audit.log`.

## Tech Stack

- **Backend:** Node.js + Express, plain JavaScript (ES modules)
- **Frontend:** React 18 + Vite, plain CSS
- **Data:** JSON files under `server/data/`, append-only JSON-lines audit log
- **AI layer:** Single wrapper `server/src/lib/llmAdvisor.js` (Anthropic Claude Messages API, key from env, deterministic fallback)
- **No real bank/NBFC/payment calls** — lenders are synthetic (3 profiles)

## Repository Structure

```
├── README.md
├── ARCHITECTURE.md
├── DECISIONS.md
├── .env.example
├── .gitignore
├── server/
│   ├── package.json
│   ├── src/
│   │   ├── index.js
│   │   ├── routes/recommend.js
│   │   └── lib/
│   │       ├── emiSolver.js
│   │       ├── lenders.js
│   │       ├── affordability.js
│   │       ├── llmAdvisor.js
│   │       └── auditLog.js
│   ├── data/
│   │   ├── shoppers.json
│   │   └── audit.log
│   └── scripts/
│       ├── generateShoppers.js
│       └── runBatchEval.js
├── client/
│   ├── package.json
│   └── src/
│       ├── App.jsx
│       └── components/
│           ├── PurchaseForm.jsx
│           ├── AffordabilityQuiz.jsx
│           ├── PlanOptions.jsx
│           └── WhyPanel.jsx
└── docs/
    └── batch-eval-report.md
```

## Definition of Done — Checklist

- [x] Install + start both server and client with no manual steps beyond setting the API key
- [x] Both "I know my number" and "I'm not sure" flows work end-to-end in the browser
- [x] At least one live case produces a "no feasible plan" result, shown gracefully
- [x] `runBatchEval.js` has been run and `docs/batch-eval-report.md` exists with real numbers from 60 synthetic shoppers
- [x] Every recommendation shown in the UI has a visible "why"
- [x] `audit.log` exists and contains an entry for every request made during testing
- [x] README, ARCHITECTURE.md, and DECISIONS.md are all present and accurate
- [x] No secrets committed; `.env.example` present
