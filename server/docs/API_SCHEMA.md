# FITEMI Agent API Schema — How an External AI Shopping Agent Integrates

FITEMI exposes a small, bounded, agent-callable HTTP API. Any external autonomous shopping agent — e.g. a personal assistant, a browser agent, or another commerce agent — can discover intent, evaluate affordability, compare EMI plans, and complete a gated checkout by calling **five endpoints** in sequence. No UI is required.

> External agent call pattern: `orchestrate → draft-order → validate-checkout → recommend → create-order (with userApproval:true)`  
> Minimal happy path: `orchestrate → recommend → create-order` (draft-order/validate-checkout are the formal gating steps)  
> See `server/scripts/agentBuyerDemo.js` and run `npm run demo:agent -- --query "laptop around 60000" --budget 5000` or `node server/scripts/agentBuyerDemo.js --budget=5000 --item="laptop"` for a live end-to-end example. Every step logs `[EXTERNAL AGENT] -> FITEMI API`.

Base URL: `http://localhost:4000` (or `process.env.PORT` / `process.env.FITEMI_API_URL`).

All routes are JSON over HTTP. Responses always include a `requestId` header/event via audit middleware, and are appended to `server/data/audit.log`.

Content-Type: `application/json` for all POST bodies. All numbers are INR unless noted (EMI paise conversion only inside Razorpay).

---

## Auth Model

- **Current (demo):** No auth. The server trusts any caller on localhost. This is intentional for evaluation and local demos.
- **What would change for production / protocol-native integration:** Add signed agent identity (e.g. `Authorization: Bearer <agent-token>` or `X-Agent-Signature`), merchant-scoped keys, and per-agent rate limiting. Checkout already gates on `userApproval:true` — under a protocol like ACP/AP2/x402 this would be replaced by a signed payment authorization token (see `ARCHITECTURE.md` > Agent-to-Agent Commerce Protocols).

---

## Idempotency / requestId Behavior

- Every request is assigned `requestId = req_<epoch>_<rand>` by `auditMiddleware` (`server/src/lib/auditLog.js:64`).
- `requestId`, `method`, `path`, `status`, `durationMs`, plus minimal business fields (`feasible`, `minFeasibleEmi`, etc.) are appended as a JSON line to `server/data/audit.log` (hash-chained; see `GET /api/audit/verify`).
- **Current:** No explicit idempotency key. Retrying `POST /api/checkout/create-order` with the same body creates a *new* merchant order (new `orderId`). The audit log is append-only; replay is visible via `requestId` timeline.
- **Production extension path:** Accept `Idempotency-Key` header on `create-order`; store `<key, orderId>` and return the same `orderId` on replay. Bind `requestId` to protocol-native intent ID (e.g. x402 payment payload hash). See `ARCHITECTURE.md`.

---

## Action Model — ALLOWED / REQUIRES_APPROVAL / DISALLOWED

Formalization of `server/src/lib/agent.js:13-31`. This is the **external-facing API contract** for any AI agent. The server is the source of truth; an agent may not bypass it.

### ALLOWED (no approval needed, read/compute/draft)

Defined in `ALLOWED_ACTIONS` (`server/src/lib/agent.js:13`):

| Action | Endpoint(s) | Semantics |
|---|---|---|
| `SEARCH_CATALOG` | `POST /api/agent/orchestrate` (search phase), `GET /api/catalog` | Read-only catalog search. No side effects. |
| `COMPARE_PLANS` | `POST /api/recommend`, `POST /api/agent/orchestrate` (evaluate phase) | Deterministic EMI solver `findFeasiblePlans` (`server/src/lib/emiSolver.js:21`). Backend decides EMI/interest/tenor/feasibility/ranking. LLM never decides numbers. |
| `GENERATE_RECOMMENDATION` | `POST /api/agent/orchestrate` (explanation + bestFit), `POST /api/recommend` (`explanation`) | LLM may polish `explanation` text only. Financial facts come from solver `explanationFacts`. |
| `CREATE_DRAFT_ORDER` | `POST /api/agent/draft-order` | Creates an order with `status: "awaiting_approval"`. No charge, no Razorpay capture. Requires `productId, plan, amount`. Equivalent to a cart hold. |

Agent may call these autonomously, repeatedly, with any inputs. They are idempotent-read-ish and never charge.

### REQUIRES_APPROVAL (bounded gate — must have explicit user approval)

Defined in `REQUIRES_APPROVAL` (`server/src/lib/agent.js:20`):

| Action | Endpoint(s) | Gate |
|---|---|---|
| `CREATE_CHECKOUT` | `POST /api/agent/validate-checkout` (pre-flight), `POST /api/checkout/create-order` | Must include `userApproval: true`. `validateCheckout` (`server/src/lib/agent.js:98`) deterministically verifies: product exists, `amount === product.price` (exact), `plan.tenorMonths` within lender range, `plan.emi` matches `emiForTenor` within ₹1, `emi > interest-only`. If `!userApproval` → `403` or `400 {valid:false, error:"Checkout requires explicit user approval"}`. |
| `FINAL_PAYMENT` | `POST /api/checkout/create-order` → Razorpay `orders.create` | Same gate. If `RAZORPAY_KEY_ID/SECRET` configured, creates real Razorpay test order (`isSimulated:false`); otherwise returns truthful `order_sim_*` (`isSimulated:true`) and marks merchant order `paid` (simulated). Never charges without approval. |

**Extension path:** In ACP/AP2/x402, `userApproval:true` is replaced by a signed mandate (`paymentAuthorization: {protocol, token}`) — see `ARCHITECTURE.md` > Agent-to-Agent Commerce Protocols. `validateCheckout` remains final deterministic check.

### DISALLOWED (always rejected, even with approval)

Defined in `DISALLOWED` (`server/src/lib/agent.js:25`):

| Token | Attempt | Server behavior |
|---|---|---|
| `BYPASS_AFFORDABILITY` | Sending a fabricated low `affordabilityCeiling` or ignoring it | `POST /api/recommend` caps `targetMonthlyPayment` to `affordabilityCeiling` ( `server/src/routes/recommend.js:72,95` ); solver filters by feasible EMI. No bypass path exists. |
| `CHANGE_PRICE` | Sending `amount !== product.price` | `validateCheckout` throws `Amount mismatch: product is ₹X, got ₹Y` → `400/403`. |
| `INVENT_INVENTORY` | Sending `productId` not in `server/src/lib/catalog.js` | `validateCheckout`/`createOrder` throw `Product not found` → `400`. |
| `CHARGE_WITHOUT_APPROVAL` | Calling `create-order` without `userApproval:true` | `POST /api/checkout/create-order` returns `403 {error:"User approval required — bounded gate"}` (`server/src/routes/checkout.js:11`). |
| `FABRICATE_PAYMENT` | Sending `plan.emi` that doesn't match `emiForTenor(price, lender.monthlyRate, tenor)` | `validateCheckout` recomputes `expectedEmi` and throws `EMI mismatch: expected ₹X … got ₹Y` if `|diff|>1` (`server/src/lib/agent.js:111`). Also rejects non-existent `lenderId` and out-of-range tenor. |

Any future protocol still sits *behind* these checks — the solver is never bypassed.

---

## 1. POST /api/agent/orchestrate

Full AI-buyer orchestration: parse natural language, compute affordability ceiling, search catalog, evaluate feasibility deterministically, and return a ranked explanation. This is the agent’s entry point.

**OpenAPI**

```yaml
post:
  operationId: orchestrateAgent
  tags: [agent]
  requestBody:
    required: true
    content:
      application/json:
        schema:
          type: object
          properties:
            intentText: { type: string, description: "Natural language buyer intent" }
            affordabilityInputs:
              type: object
              nullable: true
              properties:
                takeHomePay: { type: number, minimum: 1 }
                existingObligations: { type: number, minimum: 0 }
                otherExpenses: { type: number, minimum: 0 }
            selectedProductId: { type: string, nullable: true }
  responses:
    '200': { description: "Orchestrated intent + catalog + feasibility" }
    '500': { description: "Unexpected error" }
```

**Request**

```json
{
  "intentText": "I want a laptop around ₹60,000 at ₹5,000/month",
  "affordabilityInputs": { "takeHomePay": 40000, "existingObligations": 12000 },
  "selectedProductId": "p2"
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `intentText` | string | yes* | Natural language buyer intent. `*` empty string still works — returns intent with nulls and empty catalogResults. |
| `affordabilityInputs` | `{takeHomePay: number, existingObligations: number, otherExpenses?: number}` | no | If provided, `affordabilityCeiling = 0.4*takeHomePay - existingObligations` (`server/src/lib/affordability.js`). If omitted, falls back to `intent.targetMonthly` or `null`. |
| `selectedProductId` | string | no | If set, filtered product bias (reserved). |

**Response 200**

```json
{
  "intent": { "category": "laptop", "maxPrice": 66000, "targetMonthly": 5000, "raw": "…" },
  "affordabilityCeiling": 4000,
  "catalogResults": [
    {
      "product": { "id": "p2", "name": "ThinkPad X1 Carbon", "price": 65000, "category": "laptop", "merchant": { "id":"m1", "name":"TechHaven" } },
      "feasible": true,
      "plans": [ { "lenderId":"lenderB", "tenorMonths":6, "emi":4211.5, "totalInterest":…, "totalPaid":…, "explanationFacts":{…} } ],
      "minFeasibleEmi": null,
      "isBestFit": true
    }
  ],
  "bestFit": { "product": {…}, "plans":[…] },
  "explanation": "Found 2 products within your ₹4000/mo budget…",
  "allowedActions": ["SEARCH_CATALOG","COMPARE_PLANS","GENERATE_RECOMMENDATION","CREATE_DRAFT_ORDER"],
  "requiresApproval": ["CREATE_CHECKOUT","FINAL_PAYMENT"],
  "disallowed": ["BYPASS_AFFORDABILITY","CHANGE_PRICE","INVENT_INVENTORY","CHARGE_WITHOUT_APPROVAL","FABRICATE_PAYMENT"]
}
```

`intent` is produced by `parseIntentWithLLM` (`server/src/lib/intentParser.js`) with deterministic fallback; `catalogResults[].plans` come from `findFeasiblePlans` (`server/src/lib/emiSolver.js`). No financial decision is made by the LLM.

**Error codes**

| Status | Body | When |
|---|---|---|
| 500 | `{error: string}` | Unexpected exception |

**External agent usage:**

```js
await fetch("/api/agent/orchestrate", {
  method:"POST",
  headers:{"Content-Type":"application/json"},
  body: JSON.stringify({ intentText: "laptop around 60000", affordabilityInputs: null })
});
```

---

## 2. POST /api/agent/draft-order

Bounded draft — ALLOWED action `CREATE_DRAFT_ORDER`. Creates an order hold without charging. Precursor to gated checkout.

**OpenAPI**

```yaml
post:
  operationId: createDraftOrder
  tags: [agent]
  requestBody:
    required: true
    content:
      application/json:
        schema:
          type: object
          required: [productId, plan, amount]
          properties:
            productId: { type: string }
            plan:
              type: object
              required: [tenorMonths, emi, lenderId]
              properties:
                tenorMonths: { type: integer }
                emi: { type: number }
                totalInterest: { type: number }
                totalPaid: { type: number }
                lenderId: { type: string }
            buyer: { type: object, description: "Stored sanitized, not used for pricing" }
            amount: { type: number, description: "Must equal product.price exactly" }
  responses:
    '200': { description: "Draft created, awaiting_approval" }
    '400': { description: "Missing fields or product not found" }
```

**Request**

```json
{
  "productId": "p2",
  "plan": { "tenorMonths": 12, "emi": 5778.12, "totalInterest": 4337.44, "totalPaid": 69337.44, "lenderId": "lenderB" },
  "amount": 65000,
  "buyer": { "targetMonthlyPayment": 5000 }
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `productId` | string | yes | Must exist in catalog (`server/src/lib/catalog.js`). |
| `plan` | `{tenorMonths, emi, lenderId, totalInterest?, totalPaid?}` | yes | Not validated for EMI correctness here (use `validate-checkout` for that); stored as-is on draft. |
| `amount` | number | yes | Should equal `product.price`; draft does not enforce mismatch as strictly as checkout, but checkout will. |
| `buyer` | object | no | Stored sanitized (`hasMonthlyBudget`, `affordabilityCeiling`). |

**Response 200**

```json
{
  "action": "CREATE_DRAFT_ORDER",
  "orderId": "ord_17146_abc1",
  "productId": "p2",
  "plan": { "tenorMonths": 12, "emi": 5778.12, "lenderId": "lenderB" },
  "amount": 65000,
  "requiresApproval": true,
  "order": { "id":"ord_...", "productName":"ThinkPad X1 Carbon", "status":"awaiting_approval", "amount":65000, "plan":{…}, "createdAt":"..." }
}
```

**Error codes**

| Status | Body | When |
|---|---|---|
| 400 | `{error:"productId, plan, amount required"}` | Missing required fields |
| 400 | `{error:"Product not found"}` | `productId` not in catalog (via `createOrder`) |

**Approval semantics:** Draft is ALLOWED — no `userApproval` needed — but `order.status` is `awaiting_approval`. The draft cannot become `paid` without passing through `REQUIRES_APPROVAL` checkout (see §5). DISALLOWED tokens `INVENT_INVENTORY` and `CHANGE_PRICE` (if enforced at checkout) prevent escalation.

**External agent usage:**

```js
await fetch("/api/agent/draft-order", {
  method:"POST",
  headers:{"Content-Type":"application/json"},
  body: JSON.stringify({ productId:"p2", plan:{tenorMonths:12, emi:5778.12, lenderId:"lenderB"}, amount:65000, buyer:{} })
});
```

---

## 3. POST /api/agent/validate-checkout

Guardrail pre-flight for `REQUIRES_APPROVAL` checkout. Deterministically validates product/price/plan without creating an order. An external agent SHOULD call this before `POST /api/checkout/create-order` to get a clear `valid:false` reason.

**OpenAPI**

```yaml
post:
  operationId: validateCheckout
  tags: [agent]
  requestBody:
    required: true
    content:
      application/json:
        schema:
          type: object
          required: [productId, plan, amount, userApproval]
          properties:
            productId: { type: string }
            plan:
              type: object
              required: [tenorMonths, emi, lenderId]
              properties:
                tenorMonths: { type: integer }
                emi: { type: number }
                totalInterest: { type: number }
                totalPaid: { type: number }
                lenderId: { type: string }
            amount: { type: number }
            userApproval: { type: boolean, description: "Must be true" }
  responses:
    '200': { description: "Valid — ready to checkout" }
    '400': { description: "Invalid — valid:false plus error" }
```

**Request**

```json
{
  "productId": "p2",
  "plan": { "tenorMonths": 12, "emi": 5778.12, "totalInterest": 4337.44, "totalPaid": 69337.44, "lenderId": "lenderB" },
  "amount": 65000,
  "userApproval": true
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `productId` | string | yes | Must exist. |
| `plan` | `{tenorMonths, emi, totalInterest?, totalPaid?, lenderId}` | yes | `lenderId` must exist, `tenorMonths` within `lender.minTenor–maxTenor`, `emi` must equal `emiForTenor(price, lender.monthlyRate, tenor)` within ₹1. |
| `amount` | number | yes | Must equal `product.price` exactly. |
| `userApproval` | boolean | yes | Must be `true`; otherwise error `Checkout requires explicit user approval (bounded gate)`. |

Implements `validateCheckout` (`server/src/lib/agent.js:98`).

**Response 200 — Valid**

```json
{
  "valid": true,
  "product": { "id":"p2", "name":"ThinkPad X1 Carbon", "price":65000 },
  "lender": { "id":"lenderB", "name":"SteadyEMI Credit", "monthlyRate":0.0108, "minTenor":6, "maxTenor":18 }
}
```

**Response 400 — Invalid**

```json
{ "valid": false, "error": "Amount mismatch: product is ₹65000, got ₹60000" }
```

**Error codes (all 400 with `{valid:false, error}`)**

| Error message | Cause | DISALLOWED mapping |
|---|---|---|
| `Checkout requires explicit user approval (bounded gate)` | `!userApproval` | `CHARGE_WITHOUT_APPROVAL` |
| `Product not found` | Unknown `productId` | `INVENT_INVENTORY` |
| `Amount mismatch: product is ₹X, got ₹Y` | `amount !== product.price` | `CHANGE_PRICE` |
| `Invalid plan — missing emi/tenor/lender` | Missing plan fields | `FABRICATE_PAYMENT` |
| `Lender lenderX not found` | Unknown `lenderId` | `FABRICATE_PAYMENT` |
| `Tenor N out of range for lenderX (min–max)` | Tenor outside lender bounds | `FABRICATE_PAYMENT` |
| `EMI mismatch: expected ₹X for Nmo @ lenderY, got ₹Z` | EMI doesn't match solver (Δ>₹1) | `FABRICATE_PAYMENT` |
| `EMI below interest-only — not feasible` | EMI <= `price * monthlyRate` | `BYPASS_AFFORDABILITY` |

**External agent usage:**

```js
const v = await fetch("/api/agent/validate-checkout", {
  method:"POST",
  headers:{"Content-Type":"application/json"},
  body: JSON.stringify({ productId:"p2", plan:{tenorMonths:12, emi:5778.12, lenderId:"lenderB"}, amount:65000, userApproval:true })
}).then(r=>r.json());
if (!v.valid) throw new Error(v.error);
```

---

## 4. POST /api/recommend

Deterministic EMI solver. No LLM decides numbers; LLM only polishes `explanation`. Supports two modes: direct budget and affordability-assisted ceiling.

**OpenAPI**

```yaml
post:
  operationId: recommend
  tags: [emi]
  requestBody:
    required: true
    content:
      application/json:
        schema:
          type: object
          required: [itemPrice]
          properties:
            itemPrice: { type: number, exclusiveMinimum: 0 }
            targetMonthlyPayment: { type: number, exclusiveMinimum: 0 }
            takeHomePay: { type: number, exclusiveMinimum: 0 }
            existingObligations: { type: number, minimum: 0 }
            otherExpenses: { type: number, minimum: 0 }
            conversationHistory: { type: array, items: { type: object } }
  responses:
    '200': { description: "Feasible or not feasible, or quizInProgress" }
    '400': { description: "Validation error" }
    '500': { description: "Internal error" }
```

**Request — Direct**

```json
{
  "itemPrice": 65000,
  "targetMonthlyPayment": 5000
}
```

**Request — Affordability-assisted**

```json
{
  "itemPrice": 65000,
  "takeHomePay": 40000,
  "existingObligations": 12000,
  "otherExpenses": 0
}
```

**Request — Conversation**

```json
{
  "itemPrice": 65000,
  "conversationHistory": [{ "role":"user", "content":"40000" }, { "role":"user", "content":"12000" }]
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `itemPrice` | number | yes | >0 |
| `targetMonthlyPayment` | number | one of `targetMonthlyPayment` or affordability inputs required | Capped to `affordabilityCeiling` if both provided. |
| `takeHomePay`, `existingObligations`, `otherExpenses` | number | alt | `takeHomePay>0`, `existingObligations>=0`, `existingObligations<=takeHomePay`. Ceiling `= floor(0.4*takeHomePay - existingObligations)`. |
| `conversationHistory` | array | alt | Stepwise Q&A via `askAffordabilityQuestions`. Returns `{quizInProgress:true, nextQuestion, collected}` until complete, then solves. |

**Response 200 — Feasible**

```json
{
  "feasible": true,
  "itemPrice": 65000,
  "targetMonthlyPayment": 4000,
  "affordabilityCeiling": 4000,
  "options": [
    {
      "lenderId": "lenderB",
      "tenorMonths": 18,
      "emi": 3943.21,
      "totalInterest": 5977.78,
      "totalPaid": 70977.78,
      "explanationFacts": { "rank":1, "reason":"lowest_total_interest", "reasonLabel":"…", "monthlyHeadroom":56.79, "targetBudget":4000 }
    }
  ],
  "explanation": "For ₹65000 with a monthly budget of ₹4000, we found 3 plan(s)…",
  "meta": { "lendersConsidered":3, "solveTimeMs":2 }
}
```

**Response 200 — Not feasible**

```json
{
  "feasible": false,
  "itemPrice": 24000,
  "targetMonthlyPayment": 500,
  "reason": "No lender can offer a plan within your monthly budget…",
  "minFeasibleEmi": 1162.42,
  "minFeasibleTenor": 24,
  "minFeasibleLender": "lenderA",
  "explanation": "We checked every available lender and tenure (3–24 months)…",
  "meta": { "lendersConsidered":3, "solveTimeMs":1 }
}
```

**Error codes**

| Status | Body | When |
|---|---|---|
| 400 | `{error:"itemPrice is required."}` | Missing `itemPrice` |
| 400 | `{error:"itemPrice must be greater than 0."}` | `itemPrice <=0` |
| 400 | `{error:"Provide either targetMonthlyPayment or affordability details..."}` | No budget/affordability provided |
| 400 | `{error:"takeHomePay and existingObligations are required."}` | Partial affordability inputs |
| 400 | `{error:"Existing obligations exceed take-home pay..."}` | `existingObligations > takeHomePay` |
| 400 | `{error:"Monthly budget must be greater than 0..."}` | Ceiling/target <=0 |
| 500 | `{error:"Internal server error..."}` | Unexpected |

**Determinism note:** `emiForTenor` is `P*r*(1+r)^n/((1+r)^n-1)`, rounded to 2dp; `findFeasiblePlans` picks smallest `n` per lender that fits `emi <= target`, ranks by `totalInterest`. See `server/src/lib/emiSolver.js`.

---

## 5. POST /api/checkout/create-order

Bounded, gated checkout. Creates a merchant order and a Razorpay test order (or truthful simulation if keys unset). **Requires explicit `userApproval:true`.** Implements `REQUIRES_APPROVAL: FINAL_PAYMENT`.

**OpenAPI**

```yaml
post:
  operationId: createOrder
  tags: [checkout]
  requestBody:
    required: true
    content:
      application/json:
        schema:
          type: object
          required: [productId, plan, amount, userApproval]
          properties:
            productId: { type: string }
            plan:
              type: object
              required: [tenorMonths, emi, lenderId]
              properties:
                tenorMonths: { type: integer }
                emi: { type: number }
                totalInterest: { type: number }
                totalPaid: { type: number }
                lenderId: { type: string }
            amount: { type: number }
            buyer: { type: object }
            userApproval: { type: boolean, enum: [true] }
  responses:
    '200': { description: "Order + Razorpay order created" }
    '400': { description: "Validation failed (amount/plan/product)" }
    '403': { description: "Missing userApproval" }
    '500': { description: "Razorpay failure or internal" }
```

**Request**

```json
{
  "productId": "p2",
  "plan": { "tenorMonths": 12, "emi": 5778.12, "totalInterest": 4337.44, "totalPaid": 69337.44, "lenderId": "lenderB" },
  "amount": 65000,
  "buyer": { "targetMonthlyPayment": 5000, "affordabilityCeiling": 5000 },
  "userApproval": true
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `productId` | string | yes | Must exist in `server/src/lib/catalog.js`. |
| `plan` | `{tenorMonths, emi, totalInterest, totalPaid, lenderId}` | yes | `lenderId` must exist, `tenorMonths` within `lender.minTenor–maxTenor`, `emi` must match `emiForTenor` within ₹1 (prevents fabricated EMIs). |
| `amount` | number | yes | Must equal `product.price` exactly (amount mismatch throws). |
| `buyer` | object | no | Stored on order; not used for pricing. |
| `userApproval` | boolean | yes | Must be `true`; otherwise `403 {error:"User approval required — bounded gate"}`. |

**Response 200**

```json
{
  "success": true,
  "orderId": "ord_...",
  "merchantOrder": { "id":"ord_...", "productName":"ThinkPad X1 Carbon", "status":"paid", "amount":65000, "plan":{…} },
  "razorpayOrder": { "id":"order_..._test" | "order_sim_...", "amount":6500000, "currency":"INR", "isSimulated": true|false },
  "isTestMode": true,
  "isSimulated": true,
  "message": "Test-mode simulated order — no real charge. Configure RAZORPAY_KEY_ID/SECRET for live test-mode."
}
```

- If `RAZORPAY_KEY_ID` starts with `rzp_test_` and `RAZORPAY_KEY_SECRET` is set, `createTestOrder` calls Razorpay (`orders.create` via SDK or `api.razorpay.com/v1/orders`) and `isSimulated:false`. Order status becomes `awaiting_payment`.
- If keys are missing, returns `order_sim_<ts>_<rand>`, `isSimulated:true`, status `paid` (simulated paid).

**Error codes**

| Status | Body | When | DISALLOWED |
|---|---|---|---|
| 403 | `{error:"User approval required — bounded gate"}` | `!userApproval` | `CHARGE_WITHOUT_APPROVAL` |
| 400 | `{error:"productId, plan, amount required"}` | Missing fields | — |
| 400 | `{error:"Product not found"}` | Unknown product | `INVENT_INVENTORY` |
| 400 | `{error:"Amount mismatch: product is ₹X, got ₹Y"}` | `amount !== price` | `CHANGE_PRICE` |
| 400 | `{error:"Lender ... not found"}` | Bad lender | `FABRICATE_PAYMENT` |
| 400 | `{error:"Tenor N out of range ..."}` | Tenor bounds | `FABRICATE_PAYMENT` |
| 400 | `{error:"EMI mismatch: expected ₹X ... got ₹Y"}` | EMI fabricated | `FABRICATE_PAYMENT` |
| 400 | `{error:"Invalid plan — missing ..."}` | Plan incomplete | `FABRICATE_PAYMENT` |
| 500 | `{error: string}` | Razorpay failure / internal | — |

**Related endpoints (not required for the 3-step flow but useful):**

- `POST /api/checkout/verify` `{orderId, razorpayOrderId, paymentId, signature}` → `{verified:boolean}`
- `POST /api/checkout/cancel` `{orderId}` → `{success, order}`
- `GET /api/checkout/status/:orderId` → `{order, isTestMode}`
- `GET /api/audit` → `{count, entries}` (JSON-lines); `GET /api/audit/verify` → `{intact, count, verifiedEntries}` hash chain

---

## End-to-End External Agent Example

```bash
# Start server first
npm run dev    # or npm start

# Run the external agent (standalone, no UI)
npm run demo:agent -- --query "I want a laptop around ₹60,000" --budget 5000
npm run demo:agent -- --budget 5000 --item "laptop"

# Or directly:
node server/scripts/agentBuyerDemo.js --budget 5000 --query "phone under 30000"
node server/scripts/agentBuyerDemo.js --budget=5000 --item="laptop"
```

The script logs every call with `[EXTERNAL AGENT] -> FITEMI API` so an evaluator can see that the purchase was performed by a third-party agent over HTTP, not by clicking the UI. The checkout will only succeed because the script sends `userApproval:true` — remove it and the API returns `403`, demonstrating the bounded gate that any future ACP/AP2/x402 integration would replace with a signed payment authorization. Draft and validate steps show the formal ALLOWED→REQUIRES_APPROVAL transition.

---

## How This Is Audited

Every call above is captured by `auditMiddleware` with `requestId` and `durationMs`. Inspect:

```bash
curl http://localhost:4000/api/audit | jq .
curl http://localhost:4000/api/audit/verify
```

The verify endpoint recomputes `SHA-256(JSON(entry) + prevHash)` per line and reports `intact:true` or the index where tampering is detected.
