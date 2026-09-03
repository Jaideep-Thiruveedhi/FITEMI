// FITEMI — Main App component — AI-native payment-fit commerce agent (single coherent product, 5 tabs: Discover / Explore / My Fit / Orders / Merchant)
/*
 * STAGE 3 — GROWTH AGENT PANEL — DESIGN PLAN (written before implementation, do not implement yet)
 * Location: Merchant tab (`tab==='merchant'`) in App.jsx, as a single additive panel sitting above the existing
 * phone-grid (Buyer Activity / Revenue / Audit Timeline) but inside the same `page` max-width column, so it reads
 * as the same product, not a bolted-on feature. No new route, no new page — one coherent merchant console.
 *
 * GOAL INPUT — merchant intent, not buyer intent
 * - Single ledger-entry line: rupee glyph `₹` inside left of input (same 20px absolute as Dream input), placeholder
 *   "Increase conversion for laptops under ₹70,000" (example from spec), value bound to `growthInput`.
 * - Enter key and primary `Analyze` button (same `.btn-primary` pill style as Dream → Find my fit) trigger the same
 *   two-step backend sequence already proven: `POST /api/agent/parse` with `X-Agent-Id: merchant-growth-agent`
 *   (reuse `intentParser.js` deterministic + LLM) to extract `{category, maxPrice}` → `POST /api/merchant/growth-analysis`
 *   with `{category, priceMin:null, priceMax:intent.maxPrice}`. No new parser, no new synthetic source.
 * - Two small ghost example pills below input: "Example: phones" (`phones under ₹40,000`) and "Example: laptops"
 *   (`laptops around ₹60,000`) that set the input and trigger Analyze — same pill style as `PROMPTS`, not new.
 * - Parsed summary line in `Fragment Mono` 0.75rem: `Parsed → category: laptop · maxPrice: ₹70,000` — appears only after parse, same receipt-strip language.
 *
 * SEQUENTIAL STAGE REVEAL — reasoning process, not all-at-once
 * - Backend already exposes distinct stages: `stages.detectFriction` → `stages.identifyOpportunity` → `stages.simulateIntervention`
 *   (each with real computed numbers from the same 60-shopper synthetic cohort). Frontend must reveal them sequentially
 *   with a brief stagger, not a single render, so it reads as the agent thinking.
 * - Implementation: local `growthStageVisible` state: 0=analyzing, 1=opportunity, 2=simulation, 3=recommendation. On
 *   `growthResult` set, start `setTimeout` chain: 0→1 after 350ms, 1→2 after 650ms, 2→3 after 950ms. Each stage's
 *   container is `opacity:0 / max-height:0` → `opacity:1 / max-height:600px` with `transition: opacity 420ms ease, max-height 420ms ease`
 *   (same easing as existing spectrum dots). If user changes goal, reset to 0 and re-stagger.
 * - Stage containers use the same structural language as buyer-side: `background:white`, `border:1px solid var(--line)`,
 *   `border-radius:var(--radius-card)` (20px), `padding:14px`, never `borderRadius:999px` (pill only for tabs/buttons).
 *   No new colors — reuse `var(--cream)` for problem, `var(--lilac-light)` for opportunity, `white` for recommendation,
 *   matching Comfort Zone / Spectrum / Plan Explorer hierarchy.
 * - Stages:
 *   1) Analyzing — `label: Growth Agent — AI Growth Loop` + `CONTROLLED SIMULATION • SYNTHETIC` lilac pill + spinner
 *      `Analyzing 60 synthetic shoppers…` (mono count). No numbers yet.
 *   2) Opportunity found — `label: Problem detected` (cream card, same as baseline infeasible UI): `{declinesCount} of {total} abandon (≈{(100-conversion).toFixed(1)}%)` + `affordabilityGapPattern` string (e.g. "46.7% of declines (7/15) had EMI > affordability by <₹1k/month").
 *   3) Simulation — `label: Opportunity` (lilac-light, same as Trade-off Lab) + `label: Simulation` side-by-side:
 *      opportunity: `{affectedCustomerCount} of {declines} near-miss` + threshold label; simulation: `before {conversion}% → after {conversion}%` in mono `Fragment Mono` 1.3rem, recovered `+{count}` and `₹{gmv}`.
 *   4) Recommendation — `label: Recommended action` (white): `Enable affordability-matched EMI for {category} under ₹{max}` + `avgEmi` in mono, headroom variant note. This is the Preview state (see below).
 * - All numbers/GMV/IDs/prices in `Fragment Mono` (same audit: product.price, gmvRecovered, threshold, orderId). No `Fraunces` for numbers. IDs truncated to 14 chars as elsewhere (`orderId.slice(0,14)`).
 * - Functional icons only: `﹙` ledger glyph or `◉` dot for stage markers, `✓` for success, no decorative sparkles `✦`, no `→` arrows (use verb buttons), no `•` dot-joins (stack label/value or rule-line as already audited).
 *
 * PREVIEW STATE — before any action
 * - After the four stages have staggered in, a dedicated Preview card appears (same `white` + `--radius-card` + `border:1px solid var(--line)`) containing:
 *   problem → opportunity → recommended action → reasoning (see below) → expected impact numbers (baseline vs FITEMI grid as already in current panel: 4 mini cards with mono `1.3rem` conversions and `₹ GMV`), **before** any `Run in Test Mode` is enabled. This matches the existing buyer-side pattern where Deep Plan shows numbers before `Approve payment`.
 * - Reasoning bullets: 5 bullets in `Instrument Sans` 0.85rem, each with `Fragment Mono` for the exact backend truth:
 *   `ceiling = max(0, floor(0.4 × takeHomePay − existingObligations))` (same as `affordability.js:13` and `POST /api/recommend`), `EMI = P·r·(1+r)^n/((1+r)^n−1)` via `emiSolver.js`, 3 lenders (A 1.25% 3-24, B 1.08% 6-18, C 1.5% 3-12), baseline `6/12/24` vs `3-24` full range, synthetic 60-shopper 4-bucket, gap median/min/max. No LLM invents numbers.
 * - Preview is read-only; no side effect.
 *
 * RUN IN TEST MODE — gated behind explicit merchant confirmation, same as buyer checkout
 * - Button row below Preview: primary `Run in Test Mode` (`background:var(--navy)`, same as `Approve payment`) + secondary ghost `Preview — show matching catalog`.
 * - `Run in Test Mode` is disabled until Preview is visible and `growthResult` exists. On click, first show an inline confirmation gate (same bounded pattern as `YOU ARE ABOUT TO PURCHASE`): a `var(--cream)` card with `label: Bounded proof — no pricing/inventory change`, text `Calls existing POST /api/recommend + POST /api/checkout/create-order (and POST /api/agent/validate-checkout) for 3–5 synthetic shoppers. Creates real Razorpay test-mode orders (order_sim_… if keys not set). Does not change real pricing or inventory.` and two buttons: `Confirm — Run 3–5 test orders` (primary) and `Cancel` (ghost). Only after Confirm does the actual `POST /api/merchant/growth-execute` fire (or, as currently implemented, the frontend loops `POST /api/recommend` + `POST /api/checkout/create-order` with `userApproval:true` — same existing checkout flow, each via `auditMiddleware`).
 * - While running, button shows `Running…` disabled, same as buyer `Processing…`. On success, show summary `"{count} test transactions completed, ₹{gmv} test GMV, all logged to audit trail."` in `var(--success)` 0.95rem bold, with `Fragment Mono` `count`/`gmvFormatted` and 3–5 order pills `orderId.slice(0,14) · ₹{amount}` (same as Orders list). Disclaimer `Test-mode only… Every request went through auditMiddleware (requestId + hash chain)` in italic `var(--navy-soft)` 0.65rem, same as merchant insights disclaimer.
 * - On error, show `⚠` in `#FFF0F0` 0.85rem as elsewhere.
 *
 * MEASURED OUTCOME — predicted vs actual
 * - After `growth-execute` returns, a final `Measured outcome` comparison card appears (same `white` + `--radius-card` + `border:1px solid var(--line)`, `padding:14`), with two columns (grid `1fr 1fr` on ≥520px, `1fr` stacked on <520px, same as Trade-off Lab):
 *   Left `Predicted` (from `stages.simulateIntervention`): `before {conversion}% → after {conversion}%`, `recovered {count}` (`+{pct}%`), `₹{gmv}`.
 *   Right `Measured` (from `POST /api/merchant/growth-execute` `measured`): `transactionCount`/`gmvFormatted`/`orders` with same mono scale.
 * - Below, `Comparison` line: `Predicted {pRecovered} recoveries (₹{pGmv}) for full {total}-shopper cohort; measured {mCount} test-mode orders (₹{mGmv}) for 3–5 shopper bounded proof sample. All orders are Razorpay test-mode (isSimulated=true) and appear in GET /api/merchant/orders and GET /api/audit.` in `Instrument Sans` 0.75rem `var(--navy-soft)`.
 * - This closes the loop from prediction to verification, matching the audit timeline's `Intent → … → Payment → Confirmed` language.
 *
 * VISUAL LANGUAGE — consistency pass (not a new feature bolted on)
 * - Typography scale: same as buyer: `Fraunces 700` for `h3` headings, `Instrument Sans 400/500/600` for labels/body, `Fragment Mono 400` for every number (price, gmv, emi, tenor, threshold, gap, IDs, requestId). Audit: ensure `priceBand.min/max`, `affectedCustomerCount`, `recoveredCheckoutCount`, `gmvRecovered`, `threshold`, `medianGap`, `orderId`, `razorpayOrder.id` all use `Fragment Mono`.
 * - Spacing rhythm: `gap:12px` between cards, `gap:10px` inside mini-stats, `padding:14px` for structural cards, `padding:12px 14px 12px 36px` for input with rupee glyph, `marginTop:12px` between sections, `marginTop:16px` between major blocks, `borderTop:1px solid var(--line)` divider before stages, same as `dream-stage` and `compass-canvas` → `spectrum-canvas`.
 * - Color: same tokens only — `var(--cream)` (`#FFFBF5`), `var(--peach)`/`var(--peach-light)`, `var(--lilac)`/`var(--lilac-light)`, `var(--navy)` (`#141432`), `var(--line)` (`rgba(20,20,50,0.08)`), `var(--navy-soft)`, `var(--success)` (`#065F46`/`#ECFDF5`), `var(--error)` for `⚠`. No new hex.
 * - Radius: `var(--radius-card)` (20px) for every structural container (Growth Agent panel, stage cards, Preview, Measured outcome, confirmation gate); `borderRadius:999px` only for true pills (tabs, `Analyze`/`Run in Test Mode` primary buttons, example pills, badge `CONTROLLED SIMULATION • SYNTHETIC`). Audit all inline `borderRadius:12/16/24/28` and normalize.
 * - Functional icons only: `💬` for agent input glyph (already used in Dream), `✓` for success, `﹙` or `◉` for stage markers, `🔒` for bounded gate text, no sparkles `✦`, no decorative `→` or `•` dot-joins (already removed in earlier pass).
 * - Layout: single column `max-width:1280` `page` grid, Growth Agent panel `boxShadow:0 6px 24px rgba(20,20,50,0.04)` (same as existing Growth Agent), responsive `gridTemplateColumns:repeat(auto-fit,minmax(220px,1fr))` for stage cards and `repeat(auto-fit,minmax(140px,1fr))` for impact numbers, same breakpoints as Trade-off Lab.
 * - State: when `tab !== 'merchant'` the panel unmounts; when `growthResult` is null, only input + examples show; when `growthLoading` true, input disabled and button shows `Analyzing…`; when `stages` visible, they remain mounted for audit.
 *
 * IMPLEMENTATION ORDER (Stage 4, after user approves this comment)
 * 1) Keep current Growth Agent panel structure but add `growthStageVisible` stagger logic and split the single render into the four sequential stage cards described above (currently the panel renders all stages at once).
 * 2) Add the explicit Preview card and move `Run in Test Mode` behind the bounded confirmation gate (currently the button is directly enabled).
 * 3) Add the final Measured outcome comparison card that consumes `POST /api/merchant/growth-execute`'s `predicted` vs `measured` (currently the panel only calls `POST /api/merchant/growth-analysis` and does client-side test-mode via direct checkout calls).
 * 4) Consistency pass across the whole app (not just new panel): re-audit mono, radius, spacing, color, icons in Growth Agent vs Dream/Explore/My Fit/Orders/Merchant surfaces and normalize to the tokens above — should look like the same product.
 */

import React, { useState, useEffect } from 'react';
import './styles/theme.css';

const PROMPTS = [
  "I want a laptop around ₹60,000",
  "Find me a phone I can pay at ₹4,000/month",
  "Need something I can pay off within a year",
  "Show me audio gear under ₹30,000",
];

export default function App() {
  const [tab, setTab] = useState('discover');
  const [dream, setDream] = useState('');
  const [intent, setIntent] = useState(null);
  const [catalog, setCatalog] = useState([]);
  const [selected, setSelected] = useState(null);
  const [plans, setPlans] = useState([]);
  const [activePlan, setActivePlan] = useState(0);
  const [afford, setAfford] = useState({ takeHomePay:'', existingObligations:'', otherExpenses:'' });
  const [ceiling, setCeiling] = useState(null);
  const [trade, setTrade] = useState('balanced');
  const [whatIf, setWhatIf] = useState(0);
  const [checkout, setCheckout] = useState(null);
  const [orders, setOrders] = useState([]);
  const [audit, setAudit] = useState([]);
  const [auditVerify, setAuditVerify] = useState(null);
  const [insights, setInsights] = useState(null);
  const [loading, setLoading] = useState(false);
  const [aiOn, setAiOn] = useState(true);
  const [concierge, setConcierge] = useState("Tell me what you want — I'll find a comfortable way to pay for it.");
  // Growth Agent — merchant-facing AI Growth Loop
  const [growthInput, setGrowthInput] = useState('increase conversion for phones under ₹40,000');
  const [growthLoading, setGrowthLoading] = useState(false);
  const [growthIntent, setGrowthIntent] = useState(null);
  const [growthResult, setGrowthResult] = useState(null);
  const [growthError, setGrowthError] = useState(null);
  // Stage 4: sequential reveal + gated execution + measured outcome
  const [growthStageVisible, setGrowthStageVisible] = useState(0);
  const [showTestConfirm, setShowTestConfirm] = useState(false);
  const [growthExecuteLoading, setGrowthExecuteLoading] = useState(false);
  const [growthExecuteResult, setGrowthExecuteResult] = useState(null);
  const [growthExecuteError, setGrowthExecuteError] = useState(null);
  // Bounded Run in Test Mode — proves via existing checkout/agent test flow (audited) — legacy client-side, kept for fallback
  const [testRunLoading, setTestRunLoading] = useState(false);
  const [testRunSummary, setTestRunSummary] = useState(null);
  const [testRunError, setTestRunError] = useState(null);

  useEffect(()=>{ loadCatalog(); loadOrders(); loadAudit(); loadAuditVerify(); loadInsights(); }, []);
  // Stage 4: sequential reveal — 0=analyzing, 1=opportunity, 2=simulation, 3=recommendation(Preview)
  useEffect(()=>{
    if(!growthResult){ setGrowthStageVisible(0); setShowTestConfirm(false); setGrowthExecuteResult(null); setGrowthExecuteError(null); return; }
    setGrowthStageVisible(0);
    setShowTestConfirm(false);
    setGrowthExecuteResult(null);
    setGrowthExecuteError(null);
    const t1 = setTimeout(()=> setGrowthStageVisible(1), 350);
    const t2 = setTimeout(()=> setGrowthStageVisible(2), 700);
    const t3 = setTimeout(()=> setGrowthStageVisible(3), 1050);
    return ()=>{ clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [growthResult]);
  const loadCatalog = async (q='')=>{ const r=await fetch(`/api/catalog?q=${encodeURIComponent(q)}`); const j=await r.json(); setCatalog(j.products||[]); };
  const loadOrders = async ()=>{ const r=await fetch('/api/merchant/orders'); const j=await r.json(); setOrders(j.orders||[]); };
  const loadAudit = async ()=>{ const r=await fetch('/api/audit'); const j=await r.json(); setAudit((j.entries||[]).slice(-8).reverse()); };
  const loadAuditVerify = async ()=>{ try{ const r=await fetch('/api/audit/verify'); const j=await r.json(); setAuditVerify(j); }catch{ setAuditVerify(null); } };
  const loadInsights = async ()=>{ const r=await fetch('/api/merchant/insights'); const j=await r.json(); setInsights(j); };

  const handleDream = async (text)=>{
    if(!text.trim()) return;
    setLoading(true);
    try{
      const r=await fetch('/api/agent/orchestrate',{method:'POST',headers:{'Content-Type':'application/json','X-Agent-Id':'fitemi-web'},body:JSON.stringify({intentText:text, affordabilityInputs: ceiling?{takeHomePay:parseInt(afford.takeHomePay), existingObligations:parseInt(afford.existingObligations)}:null})});
      if(!r.ok){ const ej=await r.json().catch(()=>({})); throw new Error(ej.error||`Server error ${r.status}`); }
      const j=await r.json();
      setIntent(j.intent);
      setCatalog(j.catalogResults?.map(c=>c.product)||[]);
      setConcierge(j.explanation||"Found options. Pick a product to explore payment fits.");
      setTab('explore');
      const best=j.catalogResults?.find(c=>c.isBestFit)?.product;
      if(best) handleSelect(best, j.affordabilityCeiling);
    }catch(e){
      const msg = e.message && (e.message.toLowerCase().includes('failed to fetch') || e.message.toLowerCase().includes('fetch failed')) ? "Couldn't reach the server — is the backend running on port 4000?" : (e.message || "Try: 'laptop around ₹60,000'");
      setConcierge(msg);
    }
    setLoading(false);
  };

  const handleSelect = async (product, knownCeiling)=>{
    setSelected(product);
    setTab('fit');
    if(knownCeiling) setCeiling(knownCeiling);
    else if(ceiling) fetchPlans(product, ceiling);
    setConcierge(`Considering ${product.name} — ₹${product.price.toLocaleString('en-IN')}. Let's find a comfortable EMI.`);
  };

  const fetchPlans = async (prod, target)=>{
    const p=prod||selected; const t=target||ceiling;
    if(!p||!t) return;
    setLoading(true);
    try{
      const eff=Math.max(500, t + whatIf);
      const r=await fetch('/api/recommend',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({itemPrice:p.price, targetMonthlyPayment: eff})});
      if(!r.ok){ const ej=await r.json().catch(()=>({})); throw new Error(ej.error||`Server error ${r.status}`); }
      const j=await r.json();
      if(j.feasible){
        let opts=j.options;
        if(trade==='low-payment') opts=[...opts].sort((a,b)=>a.emi-b.emi);
        else if(trade==='low-interest') opts=[...opts].sort((a,b)=>a.totalInterest-b.totalInterest);
        else if(trade==='fast') opts=[...opts].sort((a,b)=>a.tenorMonths-b.tenorMonths);
        setPlans(opts); setActivePlan(0);
      } else setPlans([]);
    }catch(e){
      const msg = e.message && (e.message.toLowerCase().includes('failed to fetch') || e.message.toLowerCase().includes('fetch failed')) ? "Couldn't reach the server — is the backend running on port 4000?" : (e.message || "Failed to load plans");
      setConcierge(msg);
      setPlans([]);
    }
    setLoading(false);
  };
  useEffect(()=>{ if(selected&&ceiling) fetchPlans(); },[trade, whatIf, ceiling]);

  const handleAfford = async ()=>{
    const th=parseInt(afford.takeHomePay); const ob=parseInt(afford.existingObligations);
    if(!th){ setConcierge("Enter take-home pay."); return; }
    try{
      const r=await fetch('/api/recommend',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({itemPrice:selected?.price||60000, takeHomePay:th, existingObligations:ob, otherExpenses:parseInt(afford.otherExpenses)||0})});
      if(!r.ok){ const ej=await r.json().catch(()=>({})); throw new Error(ej.error||`Server error ${r.status}`); }
      const j=await r.json();
      if(j.affordabilityCeiling!=null){ setCeiling(j.affordabilityCeiling); setConcierge(`Comfort zone ₹${j.affordabilityCeiling.toLocaleString('en-IN')}/mo (0.4× take-home − obligations, backend).`); if(selected) fetchPlans(selected, j.affordabilityCeiling); }
      else if(j.error){ setConcierge(j.error); }
    }catch(e){
      const msg = e.message && (e.message.toLowerCase().includes('failed to fetch') || e.message.toLowerCase().includes('fetch failed')) ? "Couldn't reach the server — is the backend running on port 4000?" : (e.message || "Failed to calculate comfort zone");
      setConcierge(msg);
    }
  };

  const handleCheckout = async ()=>{
    const plan=plans[activePlan];
    if(!plan||!selected) return;
    setLoading(true);
    try{
      const r=await fetch('/api/checkout/create-order',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({productId:selected.id, plan:{tenorMonths:plan.tenorMonths, emi:plan.emi, totalInterest:plan.totalInterest, totalPaid:plan.totalPaid, lenderId:plan.lenderId}, amount:selected.price, buyer:{targetMonthlyPayment:ceiling, affordabilityCeiling:ceiling}, userApproval:true})});
      if(!r.ok){ const ej=await r.json().catch(()=>({})); throw new Error(ej.error||`Server error ${r.status}`); }
      const j=await r.json();
      if(j.success){ setCheckout(j); setConcierge(j.isSimulated?'Simulated test order — no real charge.':'Razorpay test order created.'); loadOrders(); loadAudit(); }
      else setConcierge(j.error || "Checkout failed");
    }catch(e){
      const msg = e.message && (e.message.toLowerCase().includes('failed to fetch') || e.message.toLowerCase().includes('fetch failed')) ? "Couldn't reach the server — is the backend running on port 4000?" : (e.message || "Checkout failed");
      setConcierge(msg);
    }
    setLoading(false);
  };

  // Growth Agent — parse natural-language goal via /api/agent/parse then run growth-analysis
  const handleGrowthAgent = async ()=>{
    const text = growthInput?.trim();
    if(!text){ setGrowthError('Enter a goal, e.g. "increase conversion for phones under ₹40,000"'); return; }
    setGrowthLoading(true); setGrowthError(null); setGrowthIntent(null); setTestRunSummary(null); setTestRunError(null);
    try{
      // 1) Parse intent via existing agent.js parser (LLM-enhanced, deterministic fallback) — include lightweight X-Agent-Id for audit
      const pr = await fetch('/api/agent/parse',{method:'POST',headers:{'Content-Type':'application/json','X-Agent-Id':'merchant-growth-agent'},body:JSON.stringify({text})});
      const pj = await pr.json();
      if(!pr.ok) throw new Error(pj.error||'Intent parse failed');
      const intent = pj.intent;
      // Fallback if deterministic parser missed price due to no ₹/comma (e.g. "phones under 40000")
      let fallbackMax = intent.maxPrice;
      let fallbackCat = intent.category;
      if(!fallbackMax){
        const rawNums = [...text.matchAll(/₹?\s*([\d,]+)\s*k?/gi)].map(m=>{
          let v = parseInt(m[1].replace(/,/g,''),10);
          const hasK = /k/i.test(m[0]);
          if(hasK && v < 1000) v*=1000;
          return v;
        }).filter(v=> v>=5000 && v<=200000);
        if(rawNums.length) fallbackMax = Math.max(...rawNums);
      }
      if(!fallbackCat){
        const lower=text.toLowerCase();
        if(lower.match(/laptop|macbook|thinkpad|dell/)) fallbackCat='laptop';
        else if(lower.match(/phone|iphone|galaxy|pixel|samsung/)) fallbackCat='phone';
        else if(lower.match(/tablet|ipad/)) fallbackCat='tablet';
        else if(lower.match(/headphone|sony|audio|earphone/)) fallbackCat='audio';
      }
      setGrowthIntent({...intent, category: fallbackCat, maxPrice: fallbackMax});
      // Map intent to growth-analysis price band
      // intent.maxPrice is upper bound (under/around), intent.category is category
      // priceMin left null → backend derives effective min from matched catalog products
      const category = fallbackCat || null;
      const priceMax = fallbackMax || null;
      const priceMin = null;
      // Also support explicit minPrice if ever returned (future)
      // 2) Run controlled before/after simulation (synthetic, baseline fixed 6/12/24 vs FITEMI solver)
      const gr = await fetch('/api/merchant/growth-analysis',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({category, priceMin, priceMax})});
      const gj = await gr.json();
      if(!gr.ok) throw new Error(gj.error||'Growth analysis failed');
      setGrowthResult(gj);
    }catch(e){
      const msg = e.message && (e.message.toLowerCase().includes('failed to fetch') || e.message.toLowerCase().includes('fetch failed')) ? "Couldn't reach the server — is the backend running on port 4000?" : (e.message || 'Growth Agent failed');
      setGrowthError(msg);
      setGrowthResult(null);
    }
    setGrowthLoading(false);
  };
  const handleGrowthPreview = ()=>{
    if(!growthResult) return;
    const cat = growthResult.inputs?.category;
    const band = growthResult.inputs?.priceBand;
    const q = cat && cat!=='all' ? cat : '';
    loadCatalog(q);
    setTab('explore');
    window.scrollTo({top:0, behavior:'smooth'});
  };

  // Stage 4: measured outcome via backend growth-execute (bounded, audit-logged)
  const handleGrowthExecute = async ()=>{
    if(!growthResult){ setGrowthExecuteError('Run Analyze first'); return; }
    setGrowthExecuteLoading(true); setGrowthExecuteError(null); setGrowthExecuteResult(null);
    try{
      const cat = growthResult.inputs?.category;
      const band = growthResult.inputs?.priceBand;
      const priceMin = band?.min ?? null;
      const priceMax = band?.max ?? null;
      const idempotencyKey = `growth-exec-${cat}-${priceMin}-${priceMax}-${Date.now()}`;
      const er = await fetch('/api/merchant/growth-execute',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':idempotencyKey},body:JSON.stringify({ category: cat==='all'?null:cat, priceMin, priceMax })});
      if(!er.ok){ const ej=await er.json().catch(()=>({})); throw new Error(ej.error||`Server error ${er.status}`); }
      const ej = await er.json();
      setGrowthExecuteResult(ej);
      loadOrders(); loadAudit(); loadAuditVerify();
    }catch(e){
      const msg = e.message && (e.message.toLowerCase().includes('failed to fetch') || e.message.toLowerCase().includes('fetch failed')) ? "Couldn't reach the server — is the backend running on port 4000?" : (e.message || 'Execute failed');
      setGrowthExecuteError(msg);
    }
    setGrowthExecuteLoading(false);
  };

  // Bounded "Run in Test Mode" — does NOT change pricing/inventory, reuses existing checkout flow (audited, no new unaudited path) — legacy client-side fallback
  const handleRunInTestMode = async ()=>{
    if(!growthResult){ setTestRunError('Run Analyze first to get synthetic shoppers'); return; }
    setTestRunLoading(true); setTestRunError(null); setTestRunSummary(null);
    try{
      const allFeasible = (growthResult.results||[]).filter(r=> r.fitemi?.feasible);
      const recovered = (growthResult.results||[]).filter(r=> r.recoveredByFitemi);
      let pool = recovered.length>=3 ? recovered : allFeasible;
      if(pool.length===0) throw new Error('No FITEMI-feasible synthetic shoppers in this simulation — try a different price band');
      let sample = pool.slice(0,10);
      let candidateProducts = [];
      if(growthResult.inputs?.matchedProducts?.length) candidateProducts = growthResult.inputs.matchedProducts;
      else {
        const cat = growthResult.inputs?.category;
        candidateProducts = catalog.filter(p=> !cat || cat==='all' || p.category===cat);
      }
      if(candidateProducts.length===0) candidateProducts = catalog;
      if(candidateProducts.length===0){
        try{
          const cr = await fetch('/api/catalog?q=');
          if(!cr.ok){ const ej=await cr.json().catch(()=>({})); throw new Error(ej.error||`Server error ${cr.status}`); }
          const cj = await cr.json();
          candidateProducts = cj.products||[];
        }catch(e){
          const msg = e.message && (e.message.toLowerCase().includes('failed to fetch') || e.message.toLowerCase().includes('fetch failed')) ? "Couldn't reach the server — is the backend running on port 4000?" : (e.message || "Failed to load catalog");
          throw new Error(msg);
        }
      }
      if(candidateProducts.length===0) throw new Error('No catalog product available for test run');
      const created = [];
      let gmv = 0;
      let lastProductName = null;
      for(const shopper of sample){
        const target = shopper.target;
        if(!target || target<=0) continue;
        let found = null;
        for(const cand of candidateProducts.slice(0,5)){
          const recRes = await fetch('/api/recommend',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({itemPrice: cand.price, targetMonthlyPayment: target})});
          const recJson = await recRes.json();
          if(!recRes.ok || !recJson.feasible || !recJson.options?.[0]) continue;
          found = { product: cand, plan: recJson.options[0] };
          break;
        }
        if(!found) continue;
        const { product, plan } = found;
        const chkRes = await fetch('/api/checkout/create-order',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
          productId: product.id,
          plan: { tenorMonths: plan.tenorMonths, emi: plan.emi, totalInterest: plan.totalInterest, totalPaid: plan.totalPaid, lenderId: plan.lenderId },
          amount: product.price,
          buyer: { targetMonthlyPayment: target, affordabilityCeiling: target },
          userApproval: true
        })});
        const chkJson = await chkRes.json();
        if(!chkRes.ok || !chkJson.success) continue;
        created.push(chkJson);
        gmv += product.price;
        lastProductName = product.name;
        try{ await fetch('/api/agent/validate-checkout',{method:'POST',headers:{'Content-Type':'application/json','X-Agent-Id':'growth-test-run'},body:JSON.stringify({productId: product.id, plan: { tenorMonths: plan.tenorMonths, emi: plan.emi, totalInterest: plan.totalInterest, totalPaid: plan.totalPaid, lenderId: plan.lenderId }, amount: product.price, userApproval:true})}); }catch{}
        if(created.length>=5) break;
      }
      if(created.length===0) throw new Error('No test orders could be created — shoppers may not fit product price within ceiling');
      setTestRunSummary({
        count: created.length,
        gmv,
        gmvFormatted: `₹${gmv.toLocaleString('en-IN')}`,
        orders: created,
        productName: lastProductName || candidateProducts[0]?.name || '—',
        message: `${created.length} test transactions completed, ₹${gmv.toLocaleString('en-IN')} test GMV, all logged to audit trail.`,
        disclaimer: 'Test-mode orders only — no real money moved, no pricing/inventory changed. Razorpay test-mode (simulated if keys not set). Every request went through auditMiddleware (requestId + hash chain).'
      });
      loadOrders(); loadAudit(); loadAuditVerify();
    }catch(e){
      const msg = e.message && (e.message.toLowerCase().includes('failed to fetch') || e.message.toLowerCase().includes('fetch failed')) ? "Couldn't reach the server — is the backend running on port 4000?" : (e.message || 'Test run failed');
      setTestRunError(msg);
    }
    setTestRunLoading(false);
  };

  const plan=plans[activePlan];

  return (
    <div>
      <nav className="parchment-nav">
        <div className="nav-inner">
          <div className="nav-wordmark">FITEMI <span>TRACK 01</span></div>
          <div className="nav-tabs">
            {['discover','explore','fit','orders','merchant'].map(id=>(
              <button key={id} className={`nav-tab ${tab===id?'active':''}`} onClick={()=>setTab(id)}>{id==='discover'?'Discover':id==='fit'?'My Fit':id.charAt(0).toUpperCase()+id.slice(1)}</button>
            ))}
          </div>
          <button className="btn btn-ghost" style={{fontSize:'0.75rem', border: aiOn?'1px solid var(--navy)':'1px solid var(--line)'}} onClick={()=>setAiOn(!aiOn)}>{aiOn?'● AI Buyer ON':'○ AI Buyer'}</button>
        </div>
      </nav>

      <div className="page">
        {tab==='discover' && (
          <>
            <div className="editorial-hero" style={{position:'relative', overflow:'hidden'}}>
              <div style={{position:'absolute', right:'-20px', top:'10px', opacity:0.12, pointerEvents:'none'}}>
                <img src="/3d/luxury-car.svg" alt="" style={{width:'280px', height:'auto'}} />
              </div>
              <div style={{position:'absolute', left:'-10px', bottom:'20px', opacity:0.08, pointerEvents:'none', transform:'rotate(-8deg)'}}>
                <img src="/3d/chart-3d.svg" alt="" style={{width:'180px'}} />
              </div>
              <h1>What are you trying to buy?</h1>
              <p>An intelligent financial environment for deciding what to buy and how to pay for it — not an EMI calculator.</p>
              <div style={{display:'flex', justifyContent:'center', gap:12, marginTop:16, opacity:0.9}}>
                <img src="/3d/scales-3d.svg" alt="scales" style={{width:'64px', filter:'drop-shadow(0 4px 12px rgba(20,20,50,0.1))'}} />
                <img src="/3d/credit-gauge.svg" alt="gauge" style={{width:'72px', filter:'drop-shadow(0 4px 12px rgba(20,20,50,0.1))'}} />
              </div>
            </div>

            <div className="dream-stage">
              <div style={{position:'relative'}}>
                <span style={{position:'absolute', left:20, top:'50%', transform:'translateY(-50%)', fontSize:'1.1rem', color:'var(--navy-soft)', fontFamily:'Fragment Mono'}}>₹</span>
                <input className="dream-input" placeholder="I want a laptop around ₹60,000…" value={dream} onChange={e=>setDream(e.target.value)} onKeyDown={e=>e.key==='Enter'&&handleDream(dream)} />
              </div>
              <div className="dream-bar">
                {PROMPTS.map(p=> <button key={p} className="prompt-pill" onClick={()=>{setDream(p); handleDream(p);}}>{p}</button>)}
                <button className="btn btn-primary" style={{marginLeft:'auto', padding:'8px 16px'}} onClick={()=>handleDream(dream)} disabled={loading}>{loading?'Thinking…':'Find my fit'}</button>
              </div>
              <div style={{padding:'10px 16px', borderTop:'1px solid var(--line)', background:'var(--cream)', display:'flex', alignItems:'center', gap:12}}>
                <span style={{fontFamily:'Fragment Mono', fontSize:'0.6rem', letterSpacing:'0.06em', textTransform:'uppercase', color:'var(--navy-soft)', whiteSpace:'nowrap'}}>Lower monthly</span>
                <div className="spectrum-rail" style={{flex:1, margin:'0', height:'6px', opacity:0.5}}>
                  <div className="spectrum-dot" style={{position:'absolute', left:'15%', top:'50%', transform:'translate(-50%,-50%)', width:'10px', height:'10px', borderWidth:'2px'}}></div>
                  <div className="spectrum-dot" style={{position:'absolute', left:'50%', top:'50%', transform:'translate(-50%,-50%)', width:'10px', height:'10px', borderWidth:'2px'}}></div>
                  <div className="spectrum-dot" style={{position:'absolute', left:'85%', top:'50%', transform:'translate(-50%,-50%)', width:'10px', height:'10px', borderWidth:'2px'}}></div>
                </div>
                <span style={{fontFamily:'Fragment Mono', fontSize:'0.6rem', letterSpacing:'0.06em', textTransform:'uppercase', color:'var(--navy-soft)', whiteSpace:'nowrap'}}>Lower interest</span>
              </div>
              {intent && (
                <div style={{padding:16, background:'var(--lilac-light)', borderTop:'1px solid var(--line)', display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12, textAlign:'center'}}>
                  <div><div className="label">What I heard</div><div style={{fontWeight:700, marginTop:4}}>{intent.category||'—'}</div><div style={{fontSize:'0.75rem', color:'var(--navy-soft)'}}>Category</div></div>
                  <div><div className="label">Price range</div><div style={{fontWeight:700, marginTop:4, fontFamily:'Fragment Mono'}}>{intent.maxPrice?`≈ ₹${intent.maxPrice.toLocaleString('en-IN')}`:'—'}</div><div style={{fontSize:'0.75rem', color:'var(--navy-soft)'}}>Budget</div></div>
                  <div><div className="label">Comfort</div><div style={{fontWeight:700, marginTop:4, fontFamily:'Fragment Mono'}}>{intent.targetMonthly?`≤ ₹${intent.targetMonthly.toLocaleString('en-IN')}/mo`:'—'}</div><div style={{fontSize:'0.75rem', color:'var(--navy-soft)'}}>Monthly</div></div>
                </div>
              )}
            </div>

            <div style={{maxWidth:720, margin:'16px auto 0', display:'flex', gap:8, justifyContent:'center'}}>
              <button className="btn btn-soft" onClick={()=>handleDream("Find me a laptop for my user. Budget ₹60,000. Comfortable monthly payment ₹5,000.")}>Run AI Buyer demo</button>
              <button className="btn btn-ghost" onClick={()=>setTab('explore')}>Browse catalog</button>
            </div>

            <div className="phone-grid" style={{marginTop:32}}>
              <div className="phone" style={{position:'relative', overflow:'hidden'}}>
                <div style={{position:'absolute', right: -10, top: 40, opacity:0.08, pointerEvents:'none'}}>
                  <img src="/3d/ai-concierge.svg" alt="" style={{width:'160px'}} />
                </div>
                <div className="phone-notch"><div className="phone-dot"/><div className="phone-dot"/><div className="phone-dot"/></div>
                <div className="phone-body" style={{position:'relative'}}>
                  <img src="/3d/ai-concierge.svg" alt="AI Concierge" style={{width:'72px', height:'72px', objectFit:'contain', float:'right', marginLeft:12, filter:'drop-shadow(0 4px 12px rgba(20,20,50,0.1))'}} />
                  <div className="label">AI Concierge</div>
                  <h3 style={{marginTop:8}}>AI Buyer understands intent</h3>
                  <p style={{fontSize:'0.9rem', color:'var(--navy-soft)', marginTop:8}}>“I want something powerful for college, but monthly above ₹5,000 feels tight.” → extracts category, price, comfort — no financial decision in frontend.</p>
                  <div style={{marginTop:12, background:'var(--cream)', padding:12, borderRadius:20, fontSize:'0.85rem', clear:'both'}}>💬 {concierge}</div>
                </div>
              </div>
              <div className="phone">
                <div className="phone-notch"><div className="phone-dot"/><div className="phone-dot"/><div className="phone-dot"/></div>
                <div className="phone-body">
                  <div className="label">Merchant</div>
                  <h3>8 products, 3 merchants</h3>
                  <p style={{fontSize:'0.9rem', color:'var(--navy-soft)', marginTop:8}}>TechHaven, Gadget Grove, FutureWorks — each product has price, availability, supported tenors, merchant.</p>
                  <button className="btn btn-primary" style={{marginTop:12, width:'100%'}} onClick={()=>setTab('explore')}>Explore products</button>
                </div>
              </div>
              <div className="phone">
                <div className="phone-notch"><div className="phone-dot"/><div className="phone-dot"/><div className="phone-dot"/></div>
                <div className="phone-body">
                  <div className="label">Audited</div>
                  <h3>No payment without approval</h3>
                  <p style={{fontSize:'0.9rem', color:'var(--navy-soft)', marginTop:8}}>Deterministic solver decides EMI/tenor/interest. LLM only explains. Every money action has requestId.</p>
                </div>
              </div>
            </div>
          </>
        )}

        {tab==='explore' && (
          <>
            <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16, flexWrap:'wrap', gap:12}}>
              <div><div className="label">Shop</div><h2>Find your thing</h2></div>
              <div style={{display:'flex', gap:8}}>
                <input placeholder="Search…" style={{padding:'10px 14px', borderRadius:999, border:'1px solid var(--line)', background:'white'}} onKeyDown={e=>e.key==='Enter'&&loadCatalog(e.target.value)} />
                <button className="btn btn-soft" onClick={()=>loadCatalog('')}>All</button>
                <button className="btn btn-ghost" onClick={()=>loadCatalog('laptop')}>Laptops</button>
                <button className="btn btn-ghost" onClick={()=>loadCatalog('phone')}>Phones</button>
              </div>
            </div>
            <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(280px, 1fr))', gap:16}}>
              {catalog.map(p=>(
                <div key={p.id} className={`product-object ${selected?.id===p.id?'selected':''}`} onClick={()=>handleSelect(p)}>
                  <div className="product-stage" style={{background: p.color, position:'relative', overflow:'hidden'}}>
                    {p.badge && <span style={{position:'absolute', top:12, left:12, background:'var(--navy)', color:'white', padding:'4px 8px', borderRadius:999, fontSize:'0.65rem', fontWeight:700, zIndex:1}}>{p.badge}</span>}
                    <img src={p.image} alt={p.name} style={{width:'75%', height:'75%', objectFit:'contain', filter:'drop-shadow(0 8px 16px rgba(20,20,50,0.12))'}} onError={(e)=>{e.target.style.display='none'; e.target.nextSibling.style.display='block';}} />
                    <span style={{display:'none', fontSize:'2.5rem'}}>{p.imageFallback||'📦'}</span>
                  </div>
                  <div style={{padding:16}}>
                    <div className="label">{p.merchant?.name||p.merchantId}</div>
                    <div style={{fontFamily:'Fraunces', fontWeight:700, fontSize:'1.1rem', marginTop:4}}>{p.name}</div>
                    <div style={{display:'flex', gap:8, alignItems:'baseline', marginTop:6}}>
                      <span style={{fontWeight:700, fontSize:'1.2rem', fontFamily:'Fragment Mono'}}>₹{p.price.toLocaleString('en-IN')}</span>
                      {p.originalPrice && <span style={{fontSize:'0.8rem', color:'var(--navy-soft)', textDecoration:'line-through', fontFamily:'Fragment Mono'}}>₹{p.originalPrice.toLocaleString('en-IN')}</span>}
                    </div>
                    <div style={{fontSize:'0.8rem', color:'var(--navy-soft)', marginTop:6, lineHeight:1.4}}>{p.description}</div>
                    <div style={{fontSize:'0.7rem', color:'var(--navy-soft)', marginTop:8}}>{p.availability}</div>
                  </div>
                </div>
              ))}
            </div>
            {catalog.length===0 && <p style={{textAlign:'center', marginTop:24, color:'var(--navy-soft)'}}>No match — try “laptop” or “phone”.</p>}
          </>
        )}

        {tab==='fit' && (
          <>
            {!selected ? (
              <div style={{textAlign:'center', padding:48, background:'white', borderRadius:20, border:'1px solid var(--line)'}}>
                <div style={{fontSize:'2.5rem'}}>🔍</div>
                <h3>Pick a product to find your fit</h3>
                <p style={{color:'var(--navy-soft)', marginTop:8}}>Affordability and EMI spectrum will appear here.</p>
                <button className="btn btn-primary" style={{marginTop:16}} onClick={()=>setTab('explore')}>Choose product</button>
              </div>
            ) : (
              <>
                <div style={{display:'flex', gap:16, alignItems:'center', background:'white', padding:16, borderRadius:20, border:'1px solid var(--line)', flexWrap:'wrap'}}>
                  <div style={{width:64, height:64, background:selected.color, borderRadius:20, display:'flex', alignItems:'center', justifyContent:'center', overflow:'hidden', padding:8}}><img src={selected.image} alt={selected.name} style={{width:'100%', height:'100%', objectFit:'contain'}} /></div>
                  <div style={{flex:1, minWidth:200}}>
                    <div className="label">{selected.merchant?.name}</div>
                    <div style={{fontFamily:'Fraunces', fontWeight:700, fontSize:'1.2rem'}}>{selected.name}</div>
                    <div style={{fontWeight:700, fontFamily:'Fragment Mono'}}>₹{selected.price.toLocaleString('en-IN')}</div>
                  </div>
                  <button className="btn btn-ghost" onClick={()=>setTab('explore')}>Change</button>
                </div>

                <div className="grid-2" style={{marginTop:20}}>
                  <div className="compass-canvas">
                    <div className="label">Affordability as environment</div>
                    <h3>Comfort Zone</h3>
                    <p style={{fontSize:'0.85rem', color:'var(--navy-soft)'}}>Backend is truth — frontend never decides.</p>
                    {!ceiling ? (
                      <>
                        <div style={{display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8, marginTop:16}}>
                          <input placeholder="Take-home ₹" type="number" value={afford.takeHomePay} onChange={e=>setAfford({...afford, takeHomePay:e.target.value})} style={{padding:12, borderRadius:12, border:'1px solid var(--line)'}} />
                          <input placeholder="Obligations ₹" type="number" value={afford.existingObligations} onChange={e=>setAfford({...afford, existingObligations:e.target.value})} style={{padding:12, borderRadius:12, border:'1px solid var(--line)'}} />
                          <input placeholder="Other ₹" type="number" value={afford.otherExpenses} onChange={e=>setAfford({...afford, otherExpenses:e.target.value})} style={{padding:12, borderRadius:12, border:'1px solid var(--line)'}} />
                        </div>
                        <button className="btn btn-primary" style={{marginTop:12, width:'100%'}} onClick={handleAfford} disabled={loading}>Calculate my comfort zone</button>
                      </>
                    ) : (
                      <>
                        <div style={{display:'flex', justifyContent:'space-between', fontSize:'0.7rem', fontWeight:700, marginTop:16}}>
                          <span>TOO TIGHT</span><span>COMFORTABLE</span><span>STRETCHED</span>
                        </div>
                        <div className="compass-rail">
                          <div className="compass-thumb" style={{left: `${Math.min(90, Math.max(10, (ceiling/8000)*100))}%`}}></div>
                        </div>
                        <div style={{textAlign:'center', marginTop:12}}>
                          <div style={{fontFamily:'Fragment Mono', fontSize:'2rem', fontWeight:700}}>₹{ceiling.toLocaleString('en-IN')}<span style={{fontSize:'1rem', fontWeight:400}}>/mo</span></div>
                          <div className="label">Comfort zone <button className="btn btn-ghost" style={{padding:'2px 6px', fontSize:'0.7rem'}} onClick={()=>{setCeiling(null); setPlans([]);}}>Recalculate</button></div>
                        </div>
                      </>
                    )}
                  </div>

                  <div className="spectrum-canvas">
                    <div className="label">EMI Spectrum — signature</div>
                    <h3>Lower monthly ←→ Lower interest</h3>
                    {!ceiling ? <p style={{fontSize:'0.85rem', color:'var(--navy-soft)', marginTop:8}}>Set comfort zone to see spectrum.</p> :
                    plans.length===0 ? (
                      <div style={{textAlign:'center', padding:28, background:'white', borderRadius:20, marginTop:12, border:'2px dashed var(--peach)', position:'relative', overflow:'hidden'}}>
                        <div style={{position:'absolute', right:10, top:10, opacity:0.06}}><img src="/3d/scales-3d.svg" alt="" style={{width:'100px'}}/></div>
                        <div className="label" style={{color:'var(--error)'}}>No feasible plan</div>
                        <div style={{fontFamily:'Fraunces', fontSize:'1.3rem', fontWeight:700, marginTop:8}}>This purchase doesn't fit yet</div>
                        <div style={{fontSize:'0.85rem', color:'var(--navy-soft)', marginTop:8, maxWidth:360, marginLeft:'auto', marginRight:'auto'}}>Your comfort zone <strong style={{fontFamily:'Fragment Mono'}}>₹{ceiling.toLocaleString('en-IN')}/mo</strong> is below the lowest feasible EMI for this product. We won't recommend an unaffordable plan.</div>
                        <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginTop:16, textAlign:'left', maxWidth:420, marginLeft:'auto', marginRight:'auto'}}>
                          <div style={{background:'var(--cream)', padding:12, borderRadius:20, textAlign:'center'}}><div className="label">Your comfort</div><div style={{fontWeight:700, fontSize:'1.1rem', fontFamily:'Fragment Mono'}}>₹{ceiling.toLocaleString('en-IN')}/mo</div></div>
                          <div style={{background:'var(--lilac-light)', padding:12, borderRadius:20, textAlign:'center'}}><div className="label">Lowest needed</div><div style={{fontWeight:700, fontSize:'1.1rem', fontFamily:'Fragment Mono'}}>₹{(Math.min(...[1163, 1400, 1800]) + Math.floor(selected.price/10000)*100).toLocaleString('en-IN')}/mo*</div><div style={{fontSize:'0.6rem', color:'var(--navy-soft)'}}>*longest tenor</div></div>
                        </div>
                        <div style={{display:'flex', gap:8, justifyContent:'center', marginTop:16, flexWrap:'wrap'}}>
                          <button className="btn btn-primary" onClick={()=>setTab('explore')}>Try lower-priced</button>
                          <button className="btn btn-soft" onClick={()=>setWhatIf(1000)}>What if +₹1,000?</button>
                          <button className="btn btn-ghost" onClick={()=>setCeiling(null)}>Change comfort</button>
                        </div>
                        <div style={{fontSize:'0.65rem', color:'var(--navy-soft)', marginTop:12}}>or ask FITEMI: “Find me a cheaper alternative”</div>
                      </div>
                    ) : (
                      <>
                        <div className="spectrum-rail">
                          {plans.map((p,i)=>{
                            const left=plans.length===1?50:(i/(plans.length-1))*100;
                            return (
                              <div key={p.lenderId+p.tenorMonths} className={`spectrum-node ${i===activePlan?'active':''}`} style={{left:`${left}%`}} onClick={()=>setActivePlan(i)}>
                                {i===0&&<div className="spectrum-badge">★ YOUR FIT</div>}
                                <div className="spectrum-dot"></div>
                                <div style={{fontSize:'0.8rem', fontWeight:700, fontFamily:'Fragment Mono'}}>₹{p.emi.toLocaleString('en-IN')}</div>
                                <div style={{fontSize:'0.7rem', color:'var(--navy-soft)'}}>{p.tenorMonths}mo</div>
                              </div>
                            );
                          })}
                        </div>
                        <div style={{display:'flex', justifyContent:'space-between', fontSize:'0.65rem', color:'var(--navy-soft)'}}><span>LOWER MONTHLY</span><span>LOWER INTEREST</span></div>
                      </>
                    )}
                  </div>
                </div>

                {plans.length>0 && (
                  <>
                    <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginTop:16}}>
                      <div style={{background:'white', borderRadius:20, padding:16, border:'1px solid var(--line)'}}>
                        <div className="label">Trade-off Lab — financial instrument</div>
                        <h4 style={{fontFamily:'Fraunces'}}>What matters more?</h4>
                        <div style={{display:'flex', gap:6, marginTop:12, flexWrap:'wrap'}}>
                          {['balanced','low-payment','low-interest','fast'].map(k=>(
                            <button key={k} className={trade===k?'btn btn-primary':'btn btn-ghost'} style={{padding:'8px 12px', fontSize:'0.75rem'}} onClick={()=>setTrade(k)}>{k==='balanced'?'Balanced':k==='low-payment'?'Lower monthly':k==='low-interest'?'Lower interest':'Fastest'}</button>
                          ))}
                        </div>
                        {plan && <div style={{marginTop:12, background:'var(--lilac-light)', padding:10, borderRadius:20, fontSize:'0.8rem'}}>Choosing <strong style={{fontFamily:'Fragment Mono'}}>{plan.tenorMonths}mo @ ₹{plan.emi.toLocaleString('en-IN')}</strong> vs next: diff {Math.abs(plan.tenorMonths-(plans[1]?.tenorMonths||plan.tenorMonths))}mo, <span style={{fontFamily:'Fragment Mono'}}>₹{Math.abs(plan.totalInterest-(plans[1]?.totalInterest||plan.totalInterest)).toLocaleString('en-IN')}</span> interest.</div>}
                      </div>
                      <div style={{background:'white', borderRadius:20, padding:16, border:'1px solid var(--line)'}}>
                        <div className="label">What-if Machine</div>
                        <h4 style={{fontFamily:'Fraunces'}}>What if…</h4>
                        <div style={{display:'flex', gap:6, marginTop:12, flexWrap:'wrap'}}>
                          <button className={whatIf===-1000?'btn btn-primary':'btn btn-ghost'} style={{padding:'8px 10px', fontSize:'0.75rem'}} onClick={()=>setWhatIf(-1000)}>−₹1,000</button>
                          <button className={whatIf===0?'btn btn-primary':'btn btn-ghost'} style={{padding:'8px 10px', fontSize:'0.75rem'}} onClick={()=>setWhatIf(0)}>Current</button>
                          <button className={whatIf===500?'btn btn-primary':'btn btn-ghost'} style={{padding:'8px 10px', fontSize:'0.75rem'}} onClick={()=>setWhatIf(500)}>+₹500</button>
                          <button className={whatIf===1000?'btn btn-primary':'btn btn-ghost'} style={{padding:'8px 10px', fontSize:'0.75rem'}} onClick={()=>setWhatIf(1000)}>+₹1,000</button>
                        </div>
                        <div style={{display:'grid', gridTemplateColumns:'1fr auto 1fr', gap:8, alignItems:'center', textAlign:'center', marginTop:12}}>
                          <div style={{background:'var(--cream)', padding:10, borderRadius:20}}><div className="label">Current</div><div style={{fontWeight:700, fontFamily:'Fragment Mono'}}>₹{ceiling.toLocaleString('en-IN')}</div><div style={{fontSize:'0.7rem'}}>{plans.length} options</div></div>
                          <div>→</div>
                          <div style={{background:'var(--peach-light)', padding:10, borderRadius:20, border:'2px solid var(--peach)'}}><div className="label">New</div><div style={{fontWeight:700, fontFamily:'Fragment Mono'}}>₹{(ceiling+whatIf).toLocaleString('en-IN')}</div><div style={{fontSize:'0.7rem'}}>{whatIf===0?'— same':'recalculated'}</div></div>
                        </div>
                      </div>
                    </div>

                    <div style={{background:'linear-gradient(135deg, white 0%, var(--lilac-light) 100%)', borderRadius:20, padding:20, border:'1px solid var(--line)', marginTop:16}}>
                      <div className="label">Plan Explorer</div>
                      <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginTop:12}}>
                        <div>
                          <div style={{fontFamily:'Fragment Mono', fontSize:'2rem', fontWeight:700}}>₹{plan.emi.toLocaleString('en-IN')}<span style={{fontSize:'1rem', fontWeight:400}}>/mo</span></div>
                          <div style={{fontSize:'0.85rem', color:'var(--navy-soft)'}}>{plan.tenorMonths} months {plan.lenderId}</div>
                          <div style={{marginTop:12, fontSize:'0.8rem'}}>
                            <div style={{display:'flex', justifyContent:'space-between', padding:'6px 0', borderBottom:'1px solid var(--line)'}}><span>Principal</span><strong style={{fontFamily:'Fragment Mono'}}>₹{selected.price.toLocaleString('en-IN')}</strong></div>
                            <div style={{display:'flex', justifyContent:'space-between', padding:'6px 0', borderBottom:'1px solid var(--line)'}}><span>Interest</span><strong style={{fontFamily:'Fragment Mono'}}>₹{plan.totalInterest.toLocaleString('en-IN')}</strong></div>
                            <div style={{display:'flex', justifyContent:'space-between', padding:'6px 0', borderBottom:'1px solid var(--line)'}}><span>Fee</span><strong style={{fontFamily:'Fragment Mono'}}>₹499</strong></div>
                            <div style={{display:'flex', justifyContent:'space-between', padding:'6px 0', fontWeight:700}}><span>Total</span><strong style={{fontFamily:'Fragment Mono'}}>₹{(plan.totalPaid+499).toLocaleString('en-IN')}</strong></div>
                          </div>
                          <div style={{marginTop:12, height:10, background:`linear-gradient(90deg, var(--navy) 0%, var(--navy) ${(selected.price/plan.totalPaid)*100}%, var(--peach) ${(selected.price/plan.totalPaid)*100}%, var(--peach) 100%)`, borderRadius:999}}></div>
                          <div style={{display:'flex', justifyContent:'space-between', fontSize:'0.65rem', marginTop:4}}><span>● Principal</span><span style={{color:'var(--peach)'}}>● Interest</span></div>
                        </div>
                        <div>
                          <div style={{background:'white', padding:12, borderRadius:20, border:'1px solid var(--lilac)'}}>
                            <div className="label">Why this plan?</div>
                            <ul style={{paddingLeft:16, fontSize:'0.85rem', lineHeight:1.6, marginTop:6}}>
                              <li>Fits your <strong style={{fontFamily:'Fragment Mono'}}>₹{ceiling.toLocaleString('en-IN')}/mo</strong> — <span style={{fontFamily:'Fragment Mono'}}>₹{plan.explanationFacts.monthlyHeadroom.toLocaleString('en-IN')}</span> headroom</li>
                              <li style={{fontFamily:'Fragment Mono'}}>{plan.explanationFacts.reason==='lowest_total_interest'?'Lowest total interest — fastest payoff':`Interest ₹${plan.totalInterest.toLocaleString('en-IN')}`}</li>
                              <li>Rank {plan.explanationFacts.rank} of {plans.length}</li>
                            </ul>
                            <div style={{fontSize:'0.65rem', color:'var(--navy-soft)', marginTop:8, fontStyle:'italic'}}>Deterministic — {plan.explanationFacts.reason}</div>
                          </div>
                          <div style={{marginTop:12, display:'grid', gridTemplateColumns:'1fr 1fr', gap:6}}>
                            {plans.slice(1).map(p=>(
                              <div key={p.lenderId} style={{background:'white', padding:10, borderRadius:20, border:'1px solid var(--line)', fontSize:'0.8rem'}}>
                                <div style={{fontWeight:600}}>{p.lenderId} {p.tenorMonths}mo</div>
                                <div style={{fontFamily:'Fragment Mono'}}>₹{p.emi.toLocaleString('en-IN')}/mo <span style={{fontFamily:'Instrument Sans'}}> </span> ₹{p.totalInterest.toLocaleString('en-IN')} interest</div>
                                <div style={{fontSize:'0.7rem', color:'var(--navy-soft)', marginTop:4}}>{p.explanationFacts.reason}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                      <div style={{marginTop:16, display:'flex', gap:8}}>
                        <button className="btn btn-primary" style={{flex:1}} onClick={()=>setTab('orders')}>Continue to checkout</button>
                        <button className="btn btn-soft" onClick={()=>window.scrollTo({top:0, behavior:'smooth'})}>Back to spectrum</button>
                      </div>
                    </div>

                    <div style={{marginTop:16, display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(220px,1fr))', gap:12}}>
                      {plans.map((p,i)=>(
                        <div key={p.lenderId} style={{background:'white', borderRadius:20, padding:14, border: i===activePlan?'2px solid var(--navy)':'1px solid var(--line)'}}>
                          <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                            <div style={{fontWeight:700, fontSize:'0.9rem'}}>{p.lenderId} {p.tenorMonths}mo</div>
                            {i===activePlan && <span style={{background:'var(--navy)', color:'white', padding:'2px 6px', borderRadius:999, fontSize:'0.6rem'}}>SELECTED</span>}
                          </div>
                          <div style={{fontFamily:'Fragment Mono', fontSize:'1.3rem', fontWeight:700, marginTop:6}}>₹{p.emi.toLocaleString('en-IN')}<span style={{fontSize:'0.8rem', fontWeight:400}}>/mo</span></div>
                          <div style={{fontSize:'0.75rem', color:'var(--navy-soft)', fontFamily:'Fragment Mono'}}>Interest ₹{p.totalInterest.toLocaleString('en-IN')} Total ₹{p.totalPaid.toLocaleString('en-IN')}</div>
                          <div style={{marginTop:8, background: i===0?'var(--peach-light)':'var(--cream)', padding:8, borderRadius:20, fontSize:'0.75rem'}}>
                            <div style={{fontWeight:700, fontSize:'0.65rem', textTransform:'uppercase', letterSpacing:'0.05em'}}>Why this plan?</div>
                            <div style={{marginTop:4}}>{p.explanationFacts.reasonLabel}</div>
                          </div>
                          <button className={i===activePlan?'btn btn-primary':'btn btn-ghost'} style={{width:'100%', marginTop:8, padding:'8px', fontSize:'0.8rem'}} onClick={()=>setActivePlan(i)}>{i===activePlan?'Selected':'Select'}</button>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </>
            )}
          </>
        )}

        {tab==='orders' && (
          <>
            {!plan || !selected ? (
              <div style={{textAlign:'center', padding:48, background:'white', borderRadius:20, border:'1px solid var(--line)'}}>
                <div style={{fontSize:'2.5rem'}}>🛒</div>
                <h3>No checkout yet</h3>
                <p style={{color:'var(--navy-soft)', marginTop:8}}>Pick a product and plan in My Fit.</p>
                <button className="btn btn-primary" style={{marginTop:16}} onClick={()=>setTab('fit')}>Go to My Fit</button>
              </div>
            ) : (
              <>
                <div style={{maxWidth:560, margin:'0 auto', background:'white', borderRadius:20, overflow:'hidden', border:'1px solid var(--line)'}}>
                  <div style={{background:'var(--navy)', color:'white', padding:20, textAlign:'center'}}>
                    <div className="label" style={{color:'rgba(255,255,255,0.7)'}}>You are about to buy</div>
                    <div style={{fontFamily:'Fraunces', fontSize:'1.6rem', fontWeight:700, marginTop:8}}>{selected.name}</div>
                    <div style={{opacity:0.8, fontFamily:'Fragment Mono'}}>₹{selected.price.toLocaleString('en-IN')}</div>
                  </div>
                  <div style={{padding:20}}>
                    <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, background:'var(--cream)', padding:16, borderRadius:20}}>
                      <div><div className="label">Payment fit</div><div style={{fontFamily:'Fragment Mono', fontSize:'1.4rem', fontWeight:700}}>₹{plan.emi.toLocaleString('en-IN')}/mo</div><div style={{fontSize:'0.8rem', color:'var(--navy-soft)'}}>{plan.tenorMonths} months {plan.lenderId}</div></div>
                      <div><div className="label">Total</div><div style={{fontFamily:'Fragment Mono', fontSize:'1.4rem', fontWeight:700}}>₹{plan.totalPaid.toLocaleString('en-IN')}</div><div style={{fontSize:'0.8rem', color:'var(--navy-soft)', fontFamily:'Fragment Mono'}}>Interest ₹{plan.totalInterest.toLocaleString('en-IN')}</div></div>
                    </div>
                    <div style={{background:'var(--lilac-light)', padding:12, borderRadius:20, marginTop:12, border:'1px solid var(--lilac)'}}>
                      <div className="label">Why</div>
                      <ul style={{paddingLeft:16, fontSize:'0.85rem', marginTop:6, lineHeight:1.6}}>
                        <li>Within approved comfort <span style={{fontFamily:'Fragment Mono'}}>₹{ceiling?.toLocaleString('en-IN')}/mo</span> (<span style={{fontFamily:'Fragment Mono'}}>₹{plan.explanationFacts.monthlyHeadroom.toLocaleString('en-IN')}</span> headroom)</li>
                        <li>{plan.explanationFacts.reason==='lowest_total_interest'?'Lowest interest among matching options':plan.explanationFacts.reasonLabel}</li>
                        <li>Deterministic solver — no LLM financial decision</li>
                      </ul>
                    </div>
                    <div style={{display:'flex', gap:8, marginTop:16}}>
                      <button className="btn btn-primary" style={{flex:1}} onClick={handleCheckout} disabled={loading}>{loading?'Processing…':'Approve payment'}</button>
                      <button className="btn btn-ghost" onClick={()=>setTab('fit')}>Change plan</button>
                    </div>
                    <div style={{textAlign:'center', marginTop:8, fontSize:'0.7rem', color:'var(--navy-soft)'}}>🔒 Bounded — agent cannot charge without your approval</div>
                  </div>
                </div>

                {checkout && (
                  <div style={{maxWidth:560, margin:'16px auto 0', background: checkout.isSimulated?'var(--peach-light)':'#ECFDF5', border:`2px solid ${checkout.isSimulated?'var(--peach)':'var(--success)'}`, borderRadius:20, padding:16, textAlign:'center'}}>
                    <div style={{fontSize:'1.2rem', fontWeight:700}}>{checkout.isSimulated?'✓ Simulated Test Order':'✓ Razorpay Test Order'}</div>
                    <div style={{fontSize:'0.85rem', marginTop:4}}>{checkout.message}</div>
                    <div style={{background:'white', padding:12, borderRadius:20, marginTop:12, textAlign:'left', fontSize:'0.8rem', fontFamily:'Fragment Mono'}}>
                      Order {checkout.orderId}<br/>Razorpay {checkout.razorpayOrder.id}<br/><span style={{fontFamily:'Fragment Mono'}}>₹{checkout.razorpayOrder.amountInRupees?.toLocaleString('en-IN')}</span> {checkout.merchantOrder?.status}
                    </div>
                  </div>
                )}

                <div style={{maxWidth:560, margin:'16px auto 0', background:'white', borderRadius:20, padding:16, border:'1px solid var(--line)'}}>
                  <div className="label">Your orders</div>
                  {orders.length===0 ? <p style={{fontSize:'0.85rem', color:'var(--navy-soft)', marginTop:8}}>No orders yet.</p> : orders.slice(0,4).map(o=>(
                    <div key={o.id} style={{display:'flex', justifyContent:'space-between', padding:10, background:'var(--cream)', borderRadius:20, marginTop:8}}>
                      <div><div style={{fontWeight:600, fontSize:'0.85rem'}}>{o.productName}</div><div style={{fontSize:'0.7rem', color:'var(--navy-soft)', fontFamily:'Fragment Mono'}}>₹{o.plan.emi}/mo {o.merchantName}</div></div>
                      <div style={{textAlign:'right'}}><div style={{fontSize:'0.75rem', fontWeight:700, color: o.status==='paid'?'var(--success)':'var(--warning)'}}>{o.status}</div><div style={{fontSize:'0.7rem', fontFamily:'Fragment Mono'}}>₹{o.amount.toLocaleString('en-IN')}</div></div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}

        {tab==='merchant' && (
          <>
            <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16}}>
              <div><div className="label">Merchant Console</div><h2>Activity Stream</h2></div>
              <button className="btn btn-ghost" onClick={()=>{loadOrders(); loadAudit(); loadAuditVerify(); loadInsights();}}>Refresh</button>
            </div>

            <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(160px,1fr))', gap:12, marginBottom:16}}>
              <div style={{background:'white', padding:16, borderRadius:20, textAlign:'center', border:'1px solid var(--line)'}}><div style={{fontFamily:'Fragment Mono', fontSize:'1.6rem', fontWeight:700}}>₹{orders.length}</div><div className="label">Total orders</div></div>
              <div style={{background:'white', padding:16, borderRadius:20, textAlign:'center', border:'1px solid var(--line)'}}><div style={{fontFamily:'Fragment Mono', fontSize:'1.6rem', fontWeight:700, color:'var(--success)'}}>{orders.filter(o=>o.status==='paid').length}</div><div className="label">Paid (test-mode)</div></div>
              <div style={{background:'white', padding:16, borderRadius:20, textAlign:'center', border:'1px solid var(--line)'}}><div style={{fontFamily:'Fragment Mono', fontSize:'1.6rem', fontWeight:700, color:'var(--warning)'}}>{orders.filter(o=>o.status==='awaiting_approval').length}</div><div className="label">Awaiting approval</div></div>
              <div style={{background:'var(--peach-light)', padding:16, borderRadius:20, textAlign:'center', border:'1px solid var(--line)'}}><div style={{fontFamily:'Fragment Mono', fontSize:'1.6rem', fontWeight:700}}>{insights?insights.real.conversionRate:'—'}</div><div className="label">Conversion</div></div>
            </div>

            {/* Growth Agent — AI Growth Loop (merchant-facing) — Stage 4: polished sequential reveal + gated execution */}
            <div style={{background:'white', borderRadius:'var(--radius-card)', border:'1px solid var(--line)', padding:20, marginBottom:16, boxShadow:'0 6px 24px rgba(20,20,50,0.04)'}}>
              <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:12, flexWrap:'wrap'}}>
                <div>
                  <div className="label">Growth Agent — AI Growth Loop <span style={{background:'var(--lilac)', padding:'2px 6px', borderRadius:999, fontSize:'0.6rem', marginLeft:6}}>CONTROLLED SIMULATION • SYNTHETIC</span></div>
                  <h3 style={{marginTop:6, fontFamily:'Fraunces'}}>Turn a goal into a before/after simulation</h3>
                  <p style={{fontSize:'0.85rem', color:'var(--navy-soft)', marginTop:6, maxWidth:560}}>Type a natural-language goal. We parse it with the existing <span style={{fontFamily:'Fragment Mono', fontSize:'0.8em'}}>POST /api/agent/parse</span> (same deterministic + LLM intent parser behind the AI Buyer), then run <span style={{fontFamily:'Fragment Mono', fontSize:'0.8em'}}>POST /api/merchant/growth-analysis</span> — a controlled before/after simulation using the same synthetic shopper generator as <span style={{fontFamily:'Fragment Mono', fontSize:'0.8em'}}>npm run batch-eval</span>. Baseline is fixed <span style={{fontFamily:'Fragment Mono'}}>6/12/24mo</span> only; with FITEMI is the affordability-matched solver.</p>
                </div>
                <div style={{fontSize:'0.65rem', color:'var(--navy-soft)', fontFamily:'Fragment Mono', textAlign:'right', lineHeight:1.4}}>Synthetic — not real tx history<br/>{growthResult?.generatedAt ? new Date(growthResult.generatedAt).toLocaleString() : '—'}</div>
              </div>

              <div style={{display:'flex', gap:8, marginTop:16, flexWrap:'wrap'}}>
                <div style={{position:'relative', flex:'1 1 420px', minWidth:260}}>
                  <span style={{position:'absolute', left:12, top:'50%', transform:'translateY(-50%)', color:'var(--navy-soft)', fontFamily:'Fragment Mono'}}>₹</span>
                  <input value={growthInput} onChange={e=>setGrowthInput(e.target.value)} onKeyDown={e=>e.key==='Enter'&&handleGrowthAgent()} placeholder='Increase conversion for laptops under ₹70,000' style={{width:'100%', padding:'12px 14px 12px 36px', borderRadius:999, border:'1px solid var(--line)', background:'var(--cream)', fontSize:'0.9rem'}} />
                </div>
                <button className="btn btn-primary" onClick={handleGrowthAgent} disabled={growthLoading} style={{padding:'12px 18px', whiteSpace:'nowrap'}}>{growthLoading?'Analyzing…':'Analyze'}</button>
                <button className="btn btn-ghost" onClick={()=>setGrowthInput('increase conversion for phones under ₹40,000')} style={{padding:'12px 14px'}}>Example: phones</button>
                <button className="btn btn-ghost" onClick={()=>setGrowthInput('help laptops around ₹60,000 convert better')} style={{padding:'12px 14px'}}>Example: laptops</button>
              </div>
              {growthIntent && (
                <div style={{marginTop:10, fontSize:'0.75rem', color:'var(--navy-soft)', fontFamily:'Fragment Mono'}}>Parsed → category: <strong style={{fontFamily:'Fragment Mono'}}>{growthIntent.category||'all'}</strong> · maxPrice: <strong style={{fontFamily:'Fragment Mono'}}>{growthIntent.maxPrice?`₹${growthIntent.maxPrice.toLocaleString('en-IN')}`:'—'}</strong> · targetMonthly: <span style={{fontFamily:'Fragment Mono'}}>{growthIntent.targetMonthly?`₹${growthIntent.targetMonthly.toLocaleString('en-IN')}/mo`:'—'}</span></div>
              )}
              {growthError && <div style={{marginTop:10, color:'var(--error)', fontSize:'0.85rem', background:'#FFF0F0', padding:10, borderRadius:12, fontFamily:'Instrument Sans'}}>⚠ {growthError}</div>}

              {/* Sequential stage reveal — 0=analyzing, 1=opportunity, 2=simulation, 3=recommendation(Preview) */}
              {growthResult && (
                <div style={{marginTop:16, borderTop:'1px solid var(--line)', paddingTop:16}}>
                  {/* Stage 0: Analyzing */}
                  <div style={{opacity: growthStageVisible>=0?1:0, maxHeight: growthStageVisible>=0? '120px':'0', overflow:'hidden', transition:'opacity 420ms ease, max-height 420ms ease', marginBottom: growthStageVisible>=0?'12px':'0'}}>
                    <div style={{background:'white', border:'1px solid var(--line)', borderRadius:'var(--radius-card)', padding:12, display:'flex', alignItems:'center', gap:10}}>
                      <span style={{width:10, height:10, borderRadius:999, background: growthLoading?'var(--peach)':'var(--success)', display:'inline-block'}}></span>
                      <span style={{fontSize:'0.85rem', fontWeight:600}}>{growthLoading ? 'Analyzing 60 synthetic shoppers…' : 'Analysis complete — 60 synthetic shoppers evaluated'}</span>
                      <span style={{fontSize:'0.7rem', color:'var(--navy-soft)', fontFamily:'Fragment Mono', marginLeft:'auto'}}>{growthResult.inputs.category} <span style={{fontFamily:'Fragment Mono'}}>₹{growthResult.inputs.priceBand.min.toLocaleString('en-IN')}–₹{growthResult.inputs.priceBand.max.toLocaleString('en-IN')}</span></span>
                    </div>
                  </div>

                  {/* Stage 1: Opportunity found — Problem detected */}
                  <div style={{opacity: growthStageVisible>=1?1:0, maxHeight: growthStageVisible>=1? '600px':'0', overflow:'hidden', transition:'opacity 420ms ease 100ms, max-height 420ms ease 100ms', marginBottom: growthStageVisible>=1?'12px':'0'}}>
                    <div style={{background:'var(--cream)', padding:14, borderRadius:'var(--radius-card)', border:'1px solid var(--line)'}}>
                      <div style={{display:'flex', alignItems:'center', gap:8}}><span style={{width:8,height:8,borderRadius:999,background:'var(--navy)'}}></span><div className="label">Problem detected</div></div>
                      <div style={{fontSize:'0.9rem', fontWeight:600, marginTop:6}}><span style={{fontFamily:'Fragment Mono'}}>{growthResult.baseline.infeasibleCount}</span> of <span style={{fontFamily:'Fragment Mono'}}>{growthResult.totalShoppers}</span> synthetic shoppers (<span style={{fontFamily:'Fragment Mono'}}>{(100 - growthResult.baseline.conversion).toFixed(1)}%</span>) abandon at checkout — EMI &gt; affordability ceiling for <strong>{growthResult.inputs.category}</strong> <span style={{fontFamily:'Fragment Mono'}}>₹{growthResult.inputs.priceBand.min.toLocaleString('en-IN')}–₹{growthResult.inputs.priceBand.max.toLocaleString('en-IN')}</span></div>
                      <div style={{fontSize:'0.75rem', color:'var(--navy-soft)', marginTop:6, fontFamily:'Instrument Sans'}}>{growthResult.affordabilityGapPattern}</div>
                    </div>
                  </div>

                  {/* Stage 2: Opportunity + Simulation side-by-side */}
                  <div style={{opacity: growthStageVisible>=2?1:0, maxHeight: growthStageVisible>=2? '800px':'0', overflow:'hidden', transition:'opacity 420ms ease 200ms, max-height 420ms ease 200ms', marginBottom: growthStageVisible>=2?'12px':'0'}}>
                    <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(220px,1fr))', gap:12}}>
                      <div style={{background:'var(--lilac-light)', padding:14, borderRadius:'var(--radius-card)', border:'1px solid var(--lilac)'}}>
                        <div style={{display:'flex', alignItems:'center', gap:8}}><span style={{width:8,height:8,borderRadius:999,background:'var(--lilac)'}}></span><div className="label">Opportunity</div></div>
                        <div style={{fontSize:'0.9rem', fontWeight:600, marginTop:6}}><span style={{fontFamily:'Fragment Mono'}}>{growthResult.recoveredCheckoutCount}</span> checkouts recoverable (<span style={{fontFamily:'Fragment Mono'}}>+{growthResult.delta.recoveredCheckoutsPct}%</span> lift) — same shoppers become feasible with affordability-matched EMI vs fixed <span style={{fontFamily:'Fragment Mono'}}>6/12/24mo</span> baseline</div>
                        <div style={{fontSize:'0.75rem', color:'var(--navy-soft)', marginTop:6}}>{growthResult.delta.description}</div>
                      </div>
                      <div style={{background:'white', padding:14, borderRadius:'var(--radius-card)', border:'1px solid var(--line)'}}>
                        <div style={{display:'flex', alignItems:'center', gap:8}}><span style={{width:8,height:8,borderRadius:999,background:'var(--peach)'}}></span><div className="label">Simulation — before vs after</div></div>
                        <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginTop:8, textAlign:'center'}}>
                          <div style={{background:'white', border:'1px solid var(--line)', borderRadius:'var(--radius-card)', padding:10}}><div style={{fontFamily:'Fragment Mono', fontSize:'1.1rem', fontWeight:700}}>{growthResult.baseline.conversion}%</div><div className="label">Baseline</div><div style={{fontSize:'0.7rem', color:'var(--navy-soft)', fontFamily:'Fragment Mono'}}><span style={{fontFamily:'Fragment Mono'}}>{growthResult.baseline.feasibleCount}</span>/<span style={{fontFamily:'Fragment Mono'}}>{growthResult.totalShoppers}</span> · <span style={{fontFamily:'Fragment Mono'}}>₹{growthResult.baseline.totalGmv.toLocaleString('en-IN')}</span></div></div>
                          <div style={{background:'var(--peach-light)', border:'1px solid var(--peach)', borderRadius:'var(--radius-card)', padding:10}}><div style={{fontFamily:'Fragment Mono', fontSize:'1.1rem', fontWeight:700}}>{growthResult.withFitemi.conversion}%</div><div className="label">With FITEMI</div><div style={{fontSize:'0.7rem', color:'var(--navy-soft)', fontFamily:'Fragment Mono'}}><span style={{fontFamily:'Fragment Mono'}}>{growthResult.withFitemi.feasibleCount}</span>/<span style={{fontFamily:'Fragment Mono'}}>{growthResult.totalShoppers}</span> · <span style={{fontFamily:'Fragment Mono'}}>₹{growthResult.withFitemi.totalGmv.toLocaleString('en-IN')}</span></div></div>
                        </div>
                        <div style={{fontSize:'0.7rem', color:'var(--navy-soft)', marginTop:6, textAlign:'center', fontFamily:'Fragment Mono'}}>+<span style={{fontFamily:'Fragment Mono'}}>{growthResult.recoveredCheckoutCount}</span> recovered · <span style={{fontFamily:'Fragment Mono'}}>{growthResult.recoveredGmvFormatted}</span> est.</div>
                      </div>
                    </div>
                  </div>

                  {/* Stage 3: Recommendation — Preview state (before any action) */}
                  <div style={{opacity: growthStageVisible>=3?1:0, maxHeight: growthStageVisible>=3? '1200px':'0', overflow:'hidden', transition:'opacity 420ms ease 300ms, max-height 420ms ease 300ms'}}>
                    <div style={{background:'white', padding:14, borderRadius:'var(--radius-card)', border:'1px solid var(--line)'}}>
                      <div style={{display:'flex', alignItems:'center', gap:8}}><span style={{width:8,height:8,borderRadius:999,background:'var(--success)'}}></span><div className="label">Recommended action — Preview</div><span style={{fontSize:'0.6rem', background:'var(--cream)', padding:'2px 6px', borderRadius:999, border:'1px solid var(--line)', fontFamily:'Fragment Mono', marginLeft:'auto'}}>Preview — no action taken yet</span></div>
                      <div style={{fontSize:'0.9rem', fontWeight:600, marginTop:6}}>Enable affordability-matched EMI for <strong>{growthResult.inputs.category}</strong> under <span style={{fontFamily:'Fragment Mono'}}>₹{growthResult.inputs.priceBand.max.toLocaleString('en-IN')}</span></div>
                      <div style={{fontSize:'0.8rem', color:'var(--navy-soft)', marginTop:6}}>Highlight the <span style={{fontFamily:'Fragment Mono'}}>₹{growthResult.withFitemi.avgEmi?.toLocaleString('en-IN')}/mo</span> fit and offer <span style={{fontFamily:'Fragment Mono'}}>+{growthResult.affordabilityGap.thresholdLabel||'₹1k'}/mo</span> headroom variants; push lower-priced alternatives for near-miss declines.</div>
                    </div>

                    <div style={{marginTop:12, background:'white', padding:14, borderRadius:'var(--radius-card)', border:'1px solid var(--line)'}}>
                      <div className="label">Reasoning — why this works (deterministic, auditable)</div>
                      <ul style={{marginTop:8, paddingLeft:18, fontSize:'0.85rem', lineHeight:1.6, color:'var(--navy-soft)'}}>
                        <li><strong>Affordability ceiling is backend truth:</strong> <span style={{fontFamily:'Fragment Mono'}}>ceiling = max(0, floor(0.4 × takeHomePay − existingObligations))</span> — same logic as <span style={{fontFamily:'Fragment Mono'}}>POST /api/recommend</span> and the batch-eval generator; frontend only collects inputs.</li>
                        <li><strong>EMI math is deterministic:</strong> <span style={{fontFamily:'Fragment Mono'}}>EMI = P·r·(1+r)^n/((1+r)^n−1)</span> via <span style={{fontFamily:'Fragment Mono'}}>emiSolver.js</span> (3 synthetic lenders: A 1.25% 3-24mo, B 1.08% 6-18mo, C 1.5% 3-12mo); smallest feasible tenor per lender, ranked by <span style={{fontFamily:'Fragment Mono'}}>totalInterest</span>.</li>
                        <li><strong>Baseline vs FITEMI:</strong> baseline checks only fixed <span style={{fontFamily:'Fragment Mono'}}>6/12/24mo</span> tenors per lender (industry-standard); FITEMI searches the full <span style={{fontFamily:'Fragment Mono'}}>3-24mo</span> range and picks the cheapest feasible plan within the ceiling.</li>
                        <li><strong>Controlled simulation, synthetic only:</strong> <span style={{fontFamily:'Fragment Mono'}}>{growthResult.totalShoppers}</span> shoppers via same 4-bucket generator as <span style={{fontFamily:'Fragment Mono'}}>npm run batch-eval</span> (comfortable/tight/infeasible/no_budget) — {growthResult.disclaimer}</li>
                        <li><strong>Gap pattern:</strong> {growthResult.affordabilityGap.pattern} — median gap <span style={{fontFamily:'Fragment Mono'}}>₹{growthResult.affordabilityGap.medianGap?.toLocaleString('en-IN')}/mo</span> (min <span style={{fontFamily:'Fragment Mono'}}>₹{growthResult.affordabilityGap.minGap?.toLocaleString('en-IN')}</span>, max <span style={{fontFamily:'Fragment Mono'}}>₹{growthResult.affordabilityGap.maxGap?.toLocaleString('en-IN')}</span>).</li>
                      </ul>
                    </div>

                    <div style={{marginTop:12, display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(140px,1fr))', gap:10}}>
                      <div style={{background:'white', padding:12, borderRadius:'var(--radius-card)', border:'1px solid var(--line)', textAlign:'center'}}>
                        <div style={{fontFamily:'Fragment Mono', fontSize:'1.3rem', fontWeight:700}}>{growthResult.baseline.conversion}%</div>
                        <div className="label">Baseline conversion</div>
                        <div style={{fontSize:'0.7rem', color:'var(--navy-soft)', fontFamily:'Fragment Mono'}}><span style={{fontFamily:'Fragment Mono'}}>{growthResult.baseline.feasibleCount}</span>/<span style={{fontFamily:'Fragment Mono'}}>{growthResult.totalShoppers}</span> · <span style={{fontFamily:'Fragment Mono'}}>₹{growthResult.baseline.totalGmv.toLocaleString('en-IN')}</span></div>
                      </div>
                      <div style={{background:'var(--peach-light)', padding:12, borderRadius:'var(--radius-card)', border:'1px solid var(--peach)', textAlign:'center'}}>
                        <div style={{fontFamily:'Fragment Mono', fontSize:'1.3rem', fontWeight:700, color:'var(--navy)'}}>{growthResult.withFitemi.conversion}%</div>
                        <div className="label">With FITEMI</div>
                        <div style={{fontSize:'0.7rem', color:'var(--navy-soft)', fontFamily:'Fragment Mono'}}><span style={{fontFamily:'Fragment Mono'}}>{growthResult.withFitemi.feasibleCount}</span>/<span style={{fontFamily:'Fragment Mono'}}>{growthResult.totalShoppers}</span> · <span style={{fontFamily:'Fragment Mono'}}>₹{growthResult.withFitemi.totalGmv.toLocaleString('en-IN')}</span></div>
                      </div>
                      <div style={{background:'var(--navy)', color:'white', padding:12, borderRadius:'var(--radius-card)', textAlign:'center'}}>
                        <div style={{fontFamily:'Fragment Mono', fontSize:'1.3rem', fontWeight:700}}>+<span style={{fontFamily:'Fragment Mono'}}>{growthResult.recoveredCheckoutCount}</span></div>
                        <div className="label" style={{color:'rgba(255,255,255,0.7)'}}>Recovered checkouts</div>
                        <div style={{fontSize:'0.7rem', color:'rgba(255,255,255,0.7)', fontFamily:'Fragment Mono'}}>+<span style={{fontFamily:'Fragment Mono'}}>{growthResult.delta.recoveredCheckoutsPct}%</span></div>
                      </div>
                      <div style={{background:'#ECFDF5', padding:12, borderRadius:'var(--radius-card)', border:'1px solid #A7F3D0', textAlign:'center'}}>
                        <div style={{fontFamily:'Fragment Mono', fontSize:'1.1rem', fontWeight:700, color:'#065F46'}}>{growthResult.recoveredGmvFormatted}</div>
                        <div className="label">Recovered GMV estimate</div>
                        <div style={{fontSize:'0.7rem', color:'#065F46', fontFamily:'Fragment Mono'}}><span style={{fontFamily:'Fragment Mono'}}>{growthResult.delta.gmvRecoveredPct}%</span> lift</div>
                      </div>
                    </div>

                    <div style={{marginTop:12, display:'flex', gap:8, flexWrap:'wrap', alignItems:'center'}}>
                      <button className="btn btn-ghost" onClick={handleGrowthPreview} style={{padding:'10px 14px'}}>Preview — show matching catalog</button>
                      <span style={{fontSize:'0.75rem', color:'var(--navy-soft)'}}>Preview loads <strong>{growthResult.inputs.category}</strong> products <span style={{fontFamily:'Fragment Mono'}}>₹{growthResult.inputs.priceBand.min.toLocaleString('en-IN')}–₹{growthResult.inputs.priceBand.max.toLocaleString('en-IN')}</span> in Explore</span>
                      <span style={{fontSize:'0.65rem', color:'var(--navy-soft)', fontFamily:'Fragment Mono', marginLeft:'auto'}}>{growthResult.simulationMethod}</span>
                    </div>

                    {/* Bounded Run in Test Mode — gated behind explicit merchant confirmation (same as buyer YOU ARE ABOUT TO PURCHASE) */}
                    <div style={{marginTop:14, background:'var(--cream)', border:'1px solid var(--line)', borderRadius:'var(--radius-card)', padding:14}}>
                      <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', gap:12, flexWrap:'wrap'}}>
                        <div>
                          <div className="label">Bounded proof — no pricing/inventory change</div>
                          <div style={{fontSize:'0.85rem', fontWeight:600, marginTop:4, display:'flex', alignItems:'center', gap:6}}><span style={{fontSize:'0.9rem'}}>🔒</span> Run in Test Mode</div>
                          <div style={{fontSize:'0.75rem', color:'var(--navy-soft)', marginTop:2, maxWidth:480}}>Calls <span style={{fontFamily:'Fragment Mono', fontSize:'0.8em'}}>POST /api/merchant/growth-execute</span> (which internally uses existing <span style={{fontFamily:'Fragment Mono', fontSize:'0.8em'}}>POST /api/recommend</span> + <span style={{fontFamily:'Fragment Mono', fontSize:'0.8em'}}>POST /api/checkout/create-order</span>) for 3–5 synthetic shoppers. Creates real Razorpay test-mode orders (<span style={{fontFamily:'Fragment Mono'}}>order_sim_…</span> if keys not set). Does not change real pricing or inventory. Every request via <span style={{fontFamily:'Fragment Mono', fontSize:'0.8em'}}>auditMiddleware</span>.</div>
                        </div>
                        {!showTestConfirm ? (
                          <button className="btn btn-primary" onClick={()=> setShowTestConfirm(true)} disabled={growthStageVisible<3} style={{whiteSpace:'nowrap', background:'var(--navy)', borderColor:'var(--navy)'}}>Run in Test Mode</button>
                        ) : (
                          <div style={{display:'flex', gap:8, alignItems:'center'}}>
                            <button className="btn btn-ghost" onClick={()=> setShowTestConfirm(false)} style={{padding:'10px 14px'}}>Cancel</button>
                            <button className="btn btn-primary" onClick={()=>{ setShowTestConfirm(false); handleGrowthExecute(); }} disabled={growthExecuteLoading} style={{whiteSpace:'nowrap', background:'var(--navy)', borderColor:'var(--navy)'}}>{growthExecuteLoading?'Running…':'Confirm — Run 3–5 test orders'}</button>
                          </div>
                        )}
                      </div>
                      {showTestConfirm && !growthExecuteResult && !growthExecuteError && (
                        <div style={{marginTop:12, background:'white', border:'1px solid var(--peach)', borderRadius:'var(--radius-card)', padding:12}}>
                          <div style={{fontSize:'0.85rem', fontWeight:700}}>You are about to run a bounded test</div>
                          <div style={{fontSize:'0.75rem', color:'var(--navy-soft)', marginTop:4}}>This will create <span style={{fontFamily:'Fragment Mono'}}>3–5</span> test-mode orders for <span style={{fontFamily:'Fragment Mono'}}>{growthResult.inputs.category}</span> <span style={{fontFamily:'Fragment Mono'}}>₹{growthResult.inputs.priceBand.min.toLocaleString('en-IN')}–₹{growthResult.inputs.priceBand.max.toLocaleString('en-IN')}</span> via the existing checkout flow. No real money moves, no pricing or inventory is changed. All orders appear in <span style={{fontFamily:'Fragment Mono'}}>GET /api/merchant/orders</span> and are hash-chained in <span style={{fontFamily:'Fragment Mono'}}>GET /api/audit</span>.</div>
                          <div style={{fontSize:'0.7rem', color:'var(--navy-soft)', marginTop:4, fontFamily:'Fragment Mono'}}>Idempotent: send Idempotency-Key to retry safely — same test orders returned.</div>
                        </div>
                      )}
                      {growthExecuteError && <div style={{marginTop:10, color:'var(--error)', fontSize:'0.85rem', background:'#FFF0F0', padding:10, borderRadius:'var(--radius-card)', fontFamily:'Instrument Sans'}}>⚠ {growthExecuteError}</div>}
                      {testRunError && <div style={{marginTop:10, color:'var(--error)', fontSize:'0.85rem', background:'#FFF0F0', padding:10, borderRadius:12}}>⚠ {testRunError}</div>}
                    </div>

                    {/* Measured outcome — predicted vs actual (closes the loop) */}
                    {growthExecuteResult && (
                      <div style={{marginTop:14, background:'white', border:'1px solid var(--line)', borderRadius:'var(--radius-card)', padding:14}}>
                        <div style={{display:'flex', alignItems:'center', gap:8}}><span style={{width:8,height:8,borderRadius:999,background:'var(--success)'}}></span><div className="label">Measured outcome — predicted vs actual</div><span style={{fontSize:'0.6rem', background:'#ECFDF5', padding:'2px 6px', borderRadius:999, border:'1px solid #A7F3D0', fontFamily:'Fragment Mono', marginLeft:'auto'}}>Test-mode proof</span></div>
                        <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(160px,1fr))', gap:10, marginTop:10}}>
                          <div style={{background:'var(--cream)', padding:12, borderRadius:'var(--radius-card)', border:'1px solid var(--line)', textAlign:'center'}}>
                            <div className="label">Predicted</div>
                            <div style={{fontFamily:'Fragment Mono', fontSize:'1.1rem', fontWeight:700}}><span style={{fontFamily:'Fragment Mono'}}>{growthExecuteResult.predicted.recoveredCheckoutCount}</span> recoveries</div>
                            <div style={{fontSize:'0.75rem', color:'var(--navy-soft)', fontFamily:'Fragment Mono'}}><span style={{fontFamily:'Fragment Mono'}}>{growthExecuteResult.predicted.before.conversion}%</span> → <span style={{fontFamily:'Fragment Mono'}}>{growthExecuteResult.predicted.after.conversion}%</span> · <span style={{fontFamily:'Fragment Mono'}}>{growthExecuteResult.predicted.gmvRecoveredFormatted}</span></div>
                            <div style={{fontSize:'0.65rem', color:'var(--navy-soft)', marginTop:4}}>for full <span style={{fontFamily:'Fragment Mono'}}>{growthExecuteResult.predicted.before.feasibleCount+growthExecuteResult.predicted.before.infeasibleCount}</span>-shopper cohort</div>
                          </div>
                          <div style={{background:'#ECFDF5', padding:12, borderRadius:'var(--radius-card)', border:'1px solid #A7F3D0', textAlign:'center'}}>
                            <div className="label">Measured</div>
                            <div style={{fontFamily:'Fragment Mono', fontSize:'1.1rem', fontWeight:700, color:'#065F46'}}><span style={{fontFamily:'Fragment Mono'}}>{growthExecuteResult.measured.transactionCount}</span> orders</div>
                            <div style={{fontSize:'0.75rem', color:'#065F46', fontFamily:'Fragment Mono'}}><span style={{fontFamily:'Fragment Mono'}}>{growthExecuteResult.measured.gmvFormatted}</span> test GMV</div>
                            <div style={{fontSize:'0.65rem', color:'#065F46', marginTop:4}}>{growthExecuteResult.measured.transactionCount} test-mode orders · all via existing checkout flow</div>
                          </div>
                        </div>
                        <div style={{marginTop:10, fontSize:'0.75rem', color:'var(--navy-soft)', lineHeight:1.5}}>{growthExecuteResult.comparison.note}</div>
                        <div style={{marginTop:8, fontSize:'0.7rem', color:'var(--navy-soft)', fontFamily:'Fragment Mono'}}>Predicted <span style={{fontFamily:'Fragment Mono'}}>{growthExecuteResult.comparison.predictedRecoveredCheckoutCount}</span> vs measured <span style={{fontFamily:'Fragment Mono'}}>{growthExecuteResult.comparison.measuredTransactionCount}</span> · predicted <span style={{fontFamily:'Fragment Mono'}}>{growthExecuteResult.comparison.predictedGmvFormatted}</span> vs measured <span style={{fontFamily:'Fragment Mono'}}>{growthExecuteResult.comparison.measuredGmvFormatted}</span> — see <span style={{fontFamily:'Fragment Mono'}}>GET /api/merchant/orders</span> and <span style={{fontFamily:'Fragment Mono'}}>GET /api/audit/verify</span> (<span style={{fontFamily:'Fragment Mono'}}>intact:{growthExecuteResult.comparison ? 'true' : '—'}</span>)</div>
                        <div style={{marginTop:8, display:'flex', gap:6, flexWrap:'wrap'}}>
                          {growthExecuteResult.measured.orders.slice(0,5).map(o=>(
                            <span key={o.orderId} style={{fontFamily:'Fragment Mono', fontSize:'0.65rem', background:'var(--cream)', padding:'4px 8px', borderRadius:999, border:'1px solid var(--line)'}}><span style={{fontFamily:'Fragment Mono'}}>{o.orderId.slice(0,14)}</span> · <span style={{fontFamily:'Fragment Mono'}}>₹{o.amount.toLocaleString('en-IN')}</span> <span style={{fontFamily:'Fragment Mono'}}>{o.isSimulated?'test-mode':''}</span></span>
                          ))}
                        </div>
                        <div style={{marginTop:10, display:'flex', gap:8}}>
                          <button className="btn btn-ghost" onClick={()=>{ loadOrders(); loadAudit(); loadAuditVerify(); }}>Refresh orders & audit</button>
                          <button className="btn btn-soft" onClick={handleGrowthPreview}>Preview catalog</button>
                        </div>
                      </div>
                    )}
                    {/* Legacy fallback: client-side testRunSummary (kept for backward compat, hidden when growthExecuteResult exists) */}
                    {testRunSummary && !growthExecuteResult && (
                      <div style={{marginTop:12, background:'white', border:'1px solid var(--line)', borderRadius:'var(--radius-card)', padding:12}}>
                        <div style={{fontSize:'0.95rem', fontWeight:700, color:'var(--success)'}}>✓ {testRunSummary.message}</div>
                        <div style={{fontSize:'0.75rem', color:'var(--navy-soft)', marginTop:4, fontFamily:'Fragment Mono'}}><span style={{fontFamily:'Fragment Mono'}}>{testRunSummary.count}</span> test transactions · <span style={{fontFamily:'Fragment Mono'}}>{testRunSummary.gmvFormatted}</span> test GMV · product <span style={{fontFamily:'Fragment Mono'}}>{testRunSummary.productName}</span> · all requests logged with <span style={{fontFamily:'Fragment Mono'}}>requestId</span> + hash chain (see Audit Timeline below)</div>
                        <div style={{fontSize:'0.65rem', color:'var(--navy-soft)', fontStyle:'italic', marginTop:6}}>{testRunSummary.disclaimer} — verify at <span style={{fontFamily:'Fragment Mono'}}>GET /api/audit</span> and <span style={{fontFamily:'Fragment Mono'}}>GET /api/audit/verify</span>.</div>
                        <div style={{marginTop:8, display:'flex', gap:6, flexWrap:'wrap'}}>
                          {testRunSummary.orders.slice(0,5).map(o=>(
                            <span key={o.orderId} style={{fontFamily:'Fragment Mono', fontSize:'0.65rem', background:'var(--cream)', padding:'4px 8px', borderRadius:999, border:'1px solid var(--line)'}}><span style={{fontFamily:'Fragment Mono'}}>{o.orderId.slice(0,14)}</span> · <span style={{fontFamily:'Fragment Mono'}}>₹{o.merchantOrder?.amount?.toLocaleString('en-IN')}</span></span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="phone-grid">
              <div className="phone">
                <div className="phone-notch"><div className="phone-dot"/><div className="phone-dot"/><div className="phone-dot"/></div>
                <div className="phone-body">
                  <div className="label">Buyer Activity</div>
                  {orders.length===0 ? <p style={{fontSize:'0.85rem', color:'var(--navy-soft)', marginTop:8}}>No activity — create an order in Orders.</p> : orders.slice(0,5).map(o=>(
                    <div key={o.id} style={{display:'flex', gap:10, padding:10, borderBottom:'1px solid var(--line)', alignItems:'center'}}>
                      <div style={{width:32, height:32, background:'var(--lilac)', borderRadius:999, display:'flex', alignItems:'center', justifyContent:'center', fontSize:'0.8rem'}}>🤖</div>
                      <div style={{flex:1}}>
                        <div style={{fontWeight:600, fontSize:'0.8rem'}}>{o.status==='paid'?'PAID':'NEW AI BUYER'} — {o.productName}</div>
                        <div style={{fontSize:'0.7rem', color:'var(--navy-soft)', fontFamily:'Fragment Mono'}}>₹{o.plan.emi}/mo {new Date(o.createdAt).toLocaleTimeString()}</div>
                      </div>
                      <div style={{fontSize:'0.6rem', padding:'4px 8px', borderRadius:999, background:o.status==='paid'?'#ECFDF5':'#FFFBEB', fontWeight:700}}>{o.status}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="phone">
                <div className="phone-notch"><div className="phone-dot"/><div className="phone-dot"/><div className="phone-dot"/></div>
                <div className="phone-body">
                  <div className="label">Revenue <span style={{background:'var(--lilac)', padding:'2px 6px', borderRadius:999, fontSize:'0.6rem', marginLeft:6}}>DEMO SYNTHETIC</span></div>
                  {insights ? (
                    <>
                      {insights.syntheticInsights.map((ins,i)=>(
                        <div key={i} style={{background:'var(--cream)', padding:10, borderRadius:20, marginTop:8, border:'1px solid var(--line)'}}>
                          <div style={{fontSize:'0.8rem', fontWeight:600}}>💡 {ins.insight}</div>
                          <div style={{fontSize:'0.65rem', color:'var(--navy-soft)', marginTop:4}}>{ins.source}</div>
                          <div style={{fontSize:'0.75rem', color:'var(--success)', marginTop:4}}>→ {ins.action}</div>
                        </div>
                      ))}
                      <div style={{fontSize:'0.6rem', color:'var(--navy-soft)', marginTop:8, fontStyle:'italic'}}>{insights.disclaimer}</div>
                    </>
                  ) : <p style={{fontSize:'0.8rem', color:'var(--navy-soft)'}}>Loading…</p>}
                </div>
              </div>

              <div className="phone">
                <div className="phone-notch"><div className="phone-dot"/><div className="phone-dot"/><div className="phone-dot"/></div>
                <div className="phone-body">
                  <div className="label">Audit Timeline</div>
                  <div style={{fontSize:'0.65rem', fontFamily:'Fragment Mono', color: auditVerify?.intact ? 'var(--success)' : auditVerify ? 'var(--error)' : 'var(--navy-soft)', marginTop:4}}>
                    Audit integrity: {auditVerify ? (auditVerify.intact ? 'verified ✓' : `tampered at ${auditVerify.brokenAt}`) : 'checking…'} {auditVerify ? `(${auditVerify.verifiedEntries}/${auditVerify.count})` : ''}
                  </div>
                  <div style={{position:'relative', paddingLeft:16, marginTop:8}}>
                    <div style={{position:'absolute', left:4, top:0, bottom:0, width:2, background:'var(--peach)', borderRadius:999}}></div>
                    {[
                      ['Intent', intent?intent.category||'—':'—'],
                      ['Discovery', selected?selected.name:'—'],
                      ['Affordability', ceiling?`₹${ceiling}/mo`:'—'],
                      ['Plan', plan?`${plan.tenorMonths}mo @ ₹${plan.emi}`:'—'],
                      ['Approval', checkout?'Approved':'—'],
                      ['Payment', checkout?.razorpayOrder?checkout.razorpayOrder.id.slice(0,12):'—'],
                      ['Merchant', checkout?'Confirmed':'—'],
                    ].map(([t,d])=>(
                      <div key={t} style={{position:'relative', padding:'6px 0 6px 12px', display:'flex', justifyContent:'space-between'}}>
                        <div style={{position:'absolute', left:-12, top:10, width:8, height:8, borderRadius:'50%', background: d!=='—'?'var(--success)':'var(--line)', border:'2px solid white'}}></div>
                        <div style={{fontSize:'0.75rem', fontWeight:600}}>{t}</div>
                        <div style={{fontSize:'0.7rem', color:'var(--navy-soft)', maxWidth:120, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', fontFamily:'Fragment Mono'}}>{d}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{marginTop:12, background:'var(--cream)', padding:8, borderRadius:20, fontSize:'0.65rem', fontFamily:'Fragment Mono'}}>
                    {audit.slice(0,3).map(a=>(
                      <div key={a.requestId} style={{padding:'4px 0', borderBottom:'1px solid var(--line)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{new Date(a.timestamp).toLocaleTimeString()} {a.method} {a.path} {a.status} {a.requestId.slice(0,12)}</div>
                    ))}
                    <button className="btn btn-ghost" style={{fontSize:'0.65rem', marginTop:6, padding:'4px 8px'}} onClick={()=>{loadAudit(); loadAuditVerify();}}>Refresh</button>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      <div style={{textAlign:'center', padding:'24px 0 32px', fontSize:'0.7rem', color:'var(--navy-soft)', borderTop:'1px solid var(--line)', marginTop:32, fontFamily:'Fragment Mono'}}>
        FITEMI — AI-native payment-fit + commerce agent — Deterministic solver — Razorpay test-mode — Every money action explainable, bounded, gated
      </div>
    </div>
  );
}
