/**
 * growthAnalysis.js — AI Growth Loop (merchant-facing)
 *
 * Reuses the existing batch-eval synthetic shopper generator (the same one
 * behind `npm run batch-eval` / `server/scripts/generateShoppers.js`) to run
 * a controlled BEFORE vs WITH FITEMI simulation for a given product category +
 * price band.
 *
 * - BEFORE FITEMI (baseline): fixed 6/12/24mo tenures only (current
 *   industry-standard baseline). A shopper can check out only if EMI for one
 *   of those fixed tenors (on any synthetic lender, respecting that lender's
 *   min/max) is <= their affordability target.
 * - WITH FITEMI: affordability-matched solver via `findFeasiblePlans` (searches
 *   smallest feasible tenor across all lenders 3-24mo, ranked by totalInterest).
 *
 * Computes delta in feasible/completed checkouts and total GMV recovered.
 *
 * Explicitly labeled as a controlled simulation using synthetic data — does NOT
 * represent real transaction history or business performance.
 *
 * Constraints: additive only. No new database, no new synthetic data source,
 * does not touch EMI solver, checkout flow, or agent routes. All money math
 * delegated to existing deterministic libs.
 */

import { emiForTenor, findFeasiblePlans } from "./emiSolver.js";
import { lenders } from "./lenders.js";
import { computeAffordabilityCeiling } from "./affordability.js";
import { products } from "./catalog.js";

// ---------------------------------------------------------------------------
// Explicit simulation labeling (merchant-facing honesty)
// ---------------------------------------------------------------------------

export const SIMULATION_LABEL = "AI Growth Loop — controlled simulation (synthetic shoppers)";
export const SIMULATION_METHOD = "before/after affordability-matched EMI simulation (synthetic)";
export const SIMULATION_DISCLAIMER =
  "Controlled simulation using synthetic data (same generator as npm run batch-eval). Does not represent real transaction history or business performance. For merchant illustration only.";
export const BASELINE_DESCRIPTION =
  "Without FITEMI: fixed 6/12/24mo tenures only (industry-standard baseline) — feasibility checked only on those tenors per lender";
export const FITEMI_DESCRIPTION =
  "With FITEMI: affordability-matched solver (findFeasiblePlans across synthetic lenders 3-24mo, smallest feasible tenor, ranked by totalInterest)";

// Industry baseline: fixed tenors offered by generic checkout
export const BASELINE_TENORS = [6, 12, 24];

// ---------------------------------------------------------------------------
// Reused helpers from server/scripts/generateShoppers.js (same logic)
// ---------------------------------------------------------------------------

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function minEmiForPrice(price) {
  let min = Infinity;
  for (const l of lenders) {
    const emi = emiForTenor(price, l.monthlyRate, l.maxTenor);
    if (emi < min) min = emi;
  }
  return min;
}

// ---------------------------------------------------------------------------
// Category + price band helpers (reuse existing catalog, no new DB)
// ---------------------------------------------------------------------------

/**
 * Normalize priceBand input into { min, max }.
 * Accepts: {min,max} | {minPrice,maxPrice} | [min,max] | "min-max" | null
 */
export function normalizePriceBand(priceBand) {
  if (!priceBand) return null;
  if (Array.isArray(priceBand) && priceBand.length === 2) {
    return { min: Number(priceBand[0]), max: Number(priceBand[1]) };
  }
  if (typeof priceBand === "string" && priceBand.includes("-")) {
    const [a, b] = priceBand.split("-").map((s) => Number(s.trim()));
    if (!Number.isNaN(a) && !Number.isNaN(b)) return { min: a, max: b };
  }
  if (typeof priceBand === "object") {
    if (priceBand.min != null || priceBand.max != null) {
      return { min: priceBand.min != null ? Number(priceBand.min) : null, max: priceBand.max != null ? Number(priceBand.max) : null };
    }
    if (priceBand.minPrice != null || priceBand.maxPrice != null) {
      return { min: priceBand.minPrice != null ? Number(priceBand.minPrice) : null, max: priceBand.maxPrice != null ? Number(priceBand.maxPrice) : null };
    }
  }
  return null;
}

/**
 * Filter catalog products by category + priceBand (reuse existing catalog).
 */
export function filterProductsByCategoryAndPrice({ category, priceBand } = {}) {
  let filtered = [...products];
  if (category) {
    const c = String(category).toLowerCase().trim();
    filtered = filtered.filter((p) => p.category.toLowerCase() === c);
  }
  const band = normalizePriceBand(priceBand);
  if (band) {
    if (band.min != null) filtered = filtered.filter((p) => p.price >= band.min);
    if (band.max != null) filtered = filtered.filter((p) => p.price <= band.max);
  }
  return filtered;
}

/**
 * Derive effective price range for simulation.
 * If products found, use their actual min/max. Otherwise fall back to priceBand or catalog extremes.
 * Handles single-sided bands (e.g. only priceMax for "under ₹40,000").
 */
export function deriveEffectivePriceRange({ category, priceBand } = {}) {
  const filtered = filterProductsByCategoryAndPrice({ category, priceBand });
  if (filtered.length > 0) {
    const prices = filtered.map((p) => p.price);
    return { min: Math.min(...prices), max: Math.max(...prices), products: filtered };
  }
  const band = normalizePriceBand(priceBand);
  if (band && (band.min != null || band.max != null)) {
    const allPrices = products.map((p) => p.price);
    const catPrices = category ? products.filter((p) => p.category === category).map((p) => p.price) : null;
    const fallbackMin = catPrices && catPrices.length ? Math.min(...catPrices) : Math.min(...allPrices);
    const fallbackMax = catPrices && catPrices.length ? Math.max(...catPrices) : Math.max(...allPrices);
    const effMin = band.min != null ? band.min : fallbackMin;
    const effMax = band.max != null ? band.max : fallbackMax;
    // Ensure min <= max, clamp to sensible range
    const finalMin = Math.min(effMin, effMax);
    const finalMax = Math.max(effMin, effMax);
    return { min: finalMin, max: finalMax, products: [] };
  }
  // Fallback: full catalog range
  const allPrices = products.map((p) => p.price);
  return { min: Math.min(...allPrices), max: Math.max(...allPrices), products: filtered };
}

// ---------------------------------------------------------------------------
// Synthetic shopper generation — same bucket logic as generateShoppers.js
// but scoped to derived price range (no new data source, same distributions)
// ---------------------------------------------------------------------------

/**
 * Generate N synthetic shoppers scoped to a price range.
 * Reuses the 4-bucket distribution from generateShoppers.js:
 *  - comfortable (~25%): budget 1.5-3x minEmi
 *  - tight (~25%): budget 1.02-1.30x minEmi
 *  - infeasible (~25%): budget 0.4-0.9x minEmi (below minimum)
 *  - no_budget (~25%): statedBudget null, ceiling via affordability
 *
 * @param {{ priceMin:number, priceMax:number, count:number }} opts
 * @returns {Array} shoppers
 */
export function generateSimulationShoppers({ priceMin, priceMax, count = 60 }) {
  const shoppers = [];
  let id = 1;

  // Clamp price range
  const pMin = Math.max(5000, Math.floor(priceMin));
  const pMax = Math.max(pMin + 1000, Math.floor(priceMax));

  const bucketCounts = {
    comfortable: Math.floor(count * 0.25),
    tight: Math.floor(count * 0.25),
    infeasible: Math.floor(count * 0.25),
    no_budget: count - Math.floor(count * 0.25) * 3,
  };

  // Helper to create shopper with itemPrice in range
  const samplePrice = () => randInt(pMin, pMax);

  // Bucket A: comfortable
  for (let i = 0; i < bucketCounts.comfortable; i++) {
    const itemPrice = samplePrice();
    const minEmi = minEmiForPrice(itemPrice);
    const statedBudget = Math.round(minEmi * (1.5 + Math.random() * 1.5));
    const takeHomePay = randInt(35000, 90000);
    const existingObligations = randInt(5000, 20000);
    const otherExpenses = randInt(8000, 25000);
    shoppers.push({ id: `sim_${String(id++).padStart(3, "0")}`, bucket: "comfortable", itemPrice, statedBudget, takeHomePay, existingObligations, otherExpenses });
  }

  // Bucket B: tight but feasible
  for (let i = 0; i < bucketCounts.tight; i++) {
    const itemPrice = samplePrice();
    const minEmi = minEmiForPrice(itemPrice);
    const statedBudget = Math.round(minEmi * (1.02 + Math.random() * 0.28));
    const takeHomePay = randInt(25000, 60000);
    const existingObligations = randInt(5000, 18000);
    const otherExpenses = randInt(6000, 20000);
    shoppers.push({ id: `sim_${String(id++).padStart(3, "0")}`, bucket: "tight", itemPrice, statedBudget, takeHomePay, existingObligations, otherExpenses });
  }

  // Bucket C: infeasible
  for (let i = 0; i < bucketCounts.infeasible; i++) {
    const itemPrice = samplePrice();
    const minEmi = minEmiForPrice(itemPrice);
    const statedBudget = Math.round(minEmi * (0.4 + Math.random() * 0.5));
    const budget = Math.max(500, statedBudget);
    const takeHomePay = randInt(15000, 40000);
    const existingObligations = randInt(8000, 22000);
    const otherExpenses = randInt(5000, 15000);
    shoppers.push({ id: `sim_${String(id++).padStart(3, "0")}`, bucket: "infeasible", itemPrice, statedBudget: budget, takeHomePay, existingObligations, otherExpenses });
  }

  // Bucket D: no_budget
  for (let i = 0; i < bucketCounts.no_budget; i++) {
    const itemPrice = samplePrice();
    let takeHomePay, existingObligations;
    if (i < Math.ceil(bucketCounts.no_budget / 2)) {
      takeHomePay = randInt(40000, 80000);
      existingObligations = randInt(4000, 12000);
    } else {
      takeHomePay = randInt(18000, 30000);
      existingObligations = randInt(10000, 18000);
    }
    const otherExpenses = randInt(6000, 20000);
    shoppers.push({ id: `sim_${String(id++).padStart(3, "0")}`, bucket: "no_budget", itemPrice, statedBudget: null, takeHomePay, existingObligations, otherExpenses });
  }

  // Shuffle (Fisher-Yates)
  for (let i = shoppers.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shoppers[i], shoppers[j]] = [shoppers[j], shoppers[i]];
  }

  return shoppers;
}

// ---------------------------------------------------------------------------
// Baseline vs FITEMI feasibility (deterministic, reuse existing solver)
// ---------------------------------------------------------------------------

/**
 * Resolve target monthly budget for a shopper (same logic as runBatchEval.js).
 * @returns {{ target:number|null, source:string }}
 */
export function resolveTargetForShopper(shopper) {
  if (shopper.statedBudget != null) {
    return { target: shopper.statedBudget, source: "statedBudget" };
  }
  const target = computeAffordabilityCeiling({
    takeHomePay: shopper.takeHomePay,
    existingObligations: shopper.existingObligations,
    otherExpenses: shopper.otherExpenses,
  });
  return { target, source: "affordabilityCeiling" };
}

/**
 * Baseline feasibility: fixed 6/12/24mo only.
 * Checks each lender's offered fixed tenors that lie within that lender's range.
 * @returns {{ feasible:boolean, bestTenor:number|null, bestEmi:number|null, lenderId:string|null, minFeasibleEmi:number|null }}
 */
export function checkBaselineFeasible(itemPrice, target) {
  if (target == null || target <= 0) {
    // still compute minFeasibleEmi for gap analysis
    let minEmi = Infinity;
    for (const lender of lenders) {
      for (const tenor of BASELINE_TENORS) {
        if (tenor < lender.minTenor || tenor > lender.maxTenor) continue;
        const emi = emiForTenor(itemPrice, lender.monthlyRate, tenor);
        if (emi < minEmi) minEmi = emi;
      }
    }
    return { feasible: false, bestTenor: null, bestEmi: null, lenderId: null, minFeasibleEmi: Number.isFinite(minEmi) ? Math.round(minEmi * 100) / 100 : null };
  }

  let best = null;
  let minEmi = Infinity;
  for (const lender of lenders) {
    for (const tenor of BASELINE_TENORS) {
      if (tenor < lender.minTenor || tenor > lender.maxTenor) continue;
      const emi = emiForTenor(itemPrice, lender.monthlyRate, tenor);
      if (emi < minEmi) minEmi = emi;
      const interestOnly = itemPrice * lender.monthlyRate;
      if (target <= interestOnly) continue; // would not amortize
      if (emi <= target) {
        if (!best || emi < best.bestEmi) {
          best = { feasible: true, bestTenor: tenor, bestEmi: Math.round(emi * 100) / 100, lenderId: lender.id };
        }
      }
    }
  }
  if (best) return { ...best, minFeasibleEmi: Math.round(minEmi * 100) / 100 };
  return { feasible: false, bestTenor: null, bestEmi: null, lenderId: null, minFeasibleEmi: Math.round(minEmi * 100) / 100 };
}

/**
 * FITEMI feasibility: reuse existing deterministic solver (affordability-matched).
 */
export function checkFitemiFeasible(itemPrice, target) {
  if (target == null || target <= 0) {
    // compute cheapest EMI for gap analysis
    let minEmi = Infinity;
    for (const l of lenders) {
      const emi = emiForTenor(itemPrice, l.monthlyRate, l.maxTenor);
      if (emi < minEmi) minEmi = emi;
    }
    return { feasible: false, options: [], bestOption: null, minFeasibleEmi: Math.round(minEmi * 100) / 100, raw: { feasible: false, minFeasibleEmi: Math.round(minEmi * 100) / 100 } };
  }
  const result = findFeasiblePlans(itemPrice, target, lenders);
  return {
    feasible: result.feasible,
    options: result.options || [],
    bestOption: result.feasible ? result.options[0] : null,
    minFeasibleEmi: result.feasible ? null : result.minFeasibleEmi,
    raw: result,
  };
}

/**
 * Analyze affordability-gap pattern among declines.
 * Computes gap = cheapest feasible EMI - affordability target for each declined shopper.
 * Produces a merchant-facing pattern string like "37% of declines had EMI > affordability by <₹2k/month".
 *
 * @param {Array} results - per-shopper results from runGrowthSimulation
 * @returns {{ pattern:string, declinesCount:number, total:number, pct:number, threshold:number, breakdown:object, gaps:number[] }}
 */
export function analyzeAffordabilityGapPattern(results) {
  const declines = results.filter((r) => !r.fitemi.feasible && r.target != null && r.target > 0 && r.fitemi.minFeasibleEmi != null);
  // Fallback: if fitemi.minFeasibleEmi missing (e.g., legacy results), compute via lenders
  const totalDeclines = results.filter((r) => !r.fitemi.feasible && r.target != null && r.target > 0).length;
  if (totalDeclines === 0) {
    return {
      pattern: "No declines — all simulated shoppers had a feasible EMI within affordability",
      declinesCount: 0,
      totalDeclines: 0,
      totalShoppers: results.length,
      pct: 0,
      threshold: null,
      breakdown: {},
      gaps: [],
    };
  }
  // If some declines lack minFeasibleEmi, compute it now
  const gaps = [];
  for (const r of results) {
    if (r.fitemi.feasible) continue;
    if (r.target == null || r.target <= 0) continue;
    let minEmi = r.fitemi.minFeasibleEmi;
    if (minEmi == null) {
      // compute cheapest across lenders (max tenor)
      let m = Infinity;
      for (const l of lenders) {
        const emi = emiForTenor(r.itemPrice, l.monthlyRate, l.maxTenor);
        if (emi < m) m = emi;
      }
      minEmi = Math.round(m * 100) / 100;
    }
    const gap = Math.round((minEmi - r.target) * 100) / 100;
    if (gap > 0) gaps.push(gap);
  }
  if (gaps.length === 0) {
    return {
      pattern: "No positive EMI gap detected among declines",
      declinesCount: totalDeclines,
      totalShoppers: results.length,
      pct: 0,
      threshold: null,
      breakdown: {},
      gaps: [],
    };
  }
  gaps.sort((a, b) => a - b);
  const countLt = (th) => gaps.filter((g) => g < th).length;
  const breakdown = {
    lt1k: { count: countLt(1000), pct: Number(((countLt(1000) / gaps.length) * 100).toFixed(1)) },
    lt2k: { count: countLt(2000), pct: Number(((countLt(2000) / gaps.length) * 100).toFixed(1)) },
    lt3k: { count: countLt(3000), pct: Number(((countLt(3000) / gaps.length) * 100).toFixed(1)) },
    lt5k: { count: countLt(5000), pct: Number(((countLt(5000) / gaps.length) * 100).toFixed(1)) },
  };
  // Choose most informative threshold: prefer smallest threshold with meaningful coverage (>=20%), else largest
  let threshold = 2000;
  let chosenKey = "lt2k";
  if (breakdown.lt1k.pct >= 20) {
    threshold = 1000;
    chosenKey = "lt1k";
  } else if (breakdown.lt2k.pct >= 20) {
    threshold = 2000;
    chosenKey = "lt2k";
  } else if (breakdown.lt3k.pct >= 25) {
    threshold = 3000;
    chosenKey = "lt3k";
  } else {
    threshold = 5000;
    chosenKey = "lt5k";
  }
  const pct = breakdown[chosenKey].pct;
  const count = breakdown[chosenKey].count;
  const thresholdLabel = threshold >= 1000 ? `₹${threshold / 1000}k` : `₹${threshold}`;
  const pattern = `${pct}% of declines (${count}/${gaps.length}) had EMI > affordability by <${thresholdLabel}/month — within one affordability step of feasible; a +${thresholdLabel}/month headroom or lower-priced variant would recover these`;
  const medianGap = gaps[Math.floor(gaps.length / 2)];
  return {
    pattern,
    declinesCount: gaps.length,
    totalDeclines: gaps.length,
    totalShoppers: results.length,
    pct,
    threshold,
    thresholdLabel,
    count,
    breakdown,
    gaps,
    medianGap: Math.round(medianGap),
    minGap: Math.round(Math.min(...gaps)),
    maxGap: Math.round(Math.max(...gaps)),
  };
}

// ---------------------------------------------------------------------------
// STAGE 1: Distinct named stages — not one black-box call
// Each stage returns real computed numbers from the same synthetic data
// ---------------------------------------------------------------------------

/**
 * Stage 1a: detectFriction(category, priceRange)
 * Generates N synthetic shoppers for the given category + price range (reusing
 * batch-eval generator) and finds the affordability-gap pattern among declines.
 * @param {object} opts
 * @param {string|null} opts.category
 * @param {object|null} opts.priceRange - { min, max } or { priceMin, priceMax } or priceBand
 * @param {object|null} opts.priceBand - alias for priceRange
 * @param {number|null} opts.priceMin - alias
 * @param {number|null} opts.priceMax - alias
 * @param {number} opts.shopperCount
 * @returns {object} friction result with real computed pattern, breakdown, gaps, plus shoppers/results for next stages
 */
export function detectFriction({ category = null, priceRange = null, priceBand = null, priceMin = null, priceMax = null, shopperCount = 60 } = {}) {
  // Normalize priceRange / priceBand / priceMin/priceMax into a single priceBand object
  let effectiveBand = priceBand || priceRange || null;
  if (priceMin != null || priceMax != null) {
    effectiveBand = { min: priceMin ?? null, max: priceMax ?? null };
    if (effectiveBand.min == null && effectiveBand.max == null) effectiveBand = priceBand || priceRange || null;
  }
  // Allow priceRange as { priceMin, priceMax } form
  if (effectiveBand && (effectiveBand.priceMin != null || effectiveBand.priceMax != null)) {
    effectiveBand = { min: effectiveBand.priceMin ?? effectiveBand.min ?? null, max: effectiveBand.priceMax ?? effectiveBand.max ?? null };
  }

  const N = Math.max(1, Math.min(500, Math.floor(Number(shopperCount) || 60)));
  const { min: priceMinEff, max: priceMaxEff, products: matchedProducts } = deriveEffectivePriceRange({ category, priceBand: effectiveBand });
  const shoppers = generateSimulationShoppers({ priceMin: priceMinEff, priceMax: priceMaxEff, count: N });

  // Run baseline vs FITEMI for each shopper to get per-shopper results (deterministic, no random beyond generation)
  const results = [];
  for (const shopper of shoppers) {
    const { target } = resolveTargetForShopper(shopper);
    if (target == null || target <= 0) {
      results.push({
        shopperId: shopper.id, bucket: shopper.bucket, itemPrice: shopper.itemPrice, target, source: shopper.statedBudget != null ? "statedBudget" : "affordabilityCeiling",
        baseline: { feasible: false, reason: "target <= 0" }, fitemi: { feasible: false, reason: "target <= 0", minFeasibleEmi: null }, recoveredByFitemi: false,
      });
      continue;
    }
    const baseline = checkBaselineFeasible(shopper.itemPrice, target);
    const fitemi = checkFitemiFeasible(shopper.itemPrice, target);
    results.push({
      shopperId: shopper.id, bucket: shopper.bucket, itemPrice: shopper.itemPrice, target,
      baseline: { feasible: baseline.feasible, tenor: baseline.bestTenor, emi: baseline.bestEmi, lenderId: baseline.lenderId, minFeasibleEmi: baseline.minFeasibleEmi },
      fitemi: { feasible: fitemi.feasible, tenor: fitemi.bestOption?.tenorMonths || null, emi: fitemi.bestOption?.emi || null, minFeasibleEmi: fitemi.minFeasibleEmi || fitemi.raw?.minFeasibleEmi || null },
      recoveredByFitemi: !baseline.feasible && fitemi.feasible,
    });
  }

  const affordabilityGap = analyzeAffordabilityGapPattern(results);
  const declines = results.filter(r => !r.fitemi.feasible && r.target > 0);
  const totalShoppers = shoppers.length;

  return {
    stage: "detectFriction",
    category: category || "all",
    priceRange: { min: priceMinEff, max: priceMaxEff },
    priceBand: { min: priceMinEff, max: priceMaxEff },
    requestedPriceBand: normalizePriceBand(effectiveBand),
    matchedProducts: matchedProducts.map(p => ({ id: p.id, name: p.name, category: p.category, price: p.price })),
    matchedProductsCount: matchedProducts.length,
    totalShoppers,
    // Real computed friction pattern
    pattern: affordabilityGap.pattern,
    affordabilityGap,
    declinesCount: declines.length,
    gaps: affordabilityGap.gaps,
    breakdown: affordabilityGap.breakdown,
    medianGap: affordabilityGap.medianGap,
    // Pass through for next stages (same synthetic data, no re-randomization)
    shoppers,
    results,
    effectiveBand: { min: priceMinEff, max: priceMaxEff },
  };
}

/**
 * Stage 1b: identifyOpportunity(friction)
 * Takes friction result and returns the affected customer count and price band.
 * @param {object} friction - result from detectFriction
 * @returns {object} opportunity with real computed affected counts
 */
export function identifyOpportunity(friction) {
  if (!friction || !friction.affordabilityGap) throw new Error("identifyOpportunity requires friction result from detectFriction");
  const ag = friction.affordabilityGap;
  // Affected customers are those within the chosen threshold (near-miss declines)
  const affectedCustomerCount = ag.count ?? 0;
  const affectedPct = ag.pct ?? 0;
  const priceBand = friction.priceBand || friction.priceRange || friction.effectiveBand;
  return {
    stage: "identifyOpportunity",
    category: friction.category,
    priceBand,
    priceRange: priceBand,
    matchedProducts: friction.matchedProducts,
    matchedProductsCount: friction.matchedProductsCount,
    totalShoppers: friction.totalShoppers,
    declinesCount: friction.declinesCount,
    // Real opportunity numbers
    affectedCustomerCount,
    affectedPct,
    threshold: ag.threshold,
    thresholdLabel: ag.thresholdLabel,
    breakdown: ag.breakdown,
    // Human-readable opportunity description
    description: `${affectedCustomerCount} of ${ag.declinesCount} declines (${affectedPct}%) are within <${ag.thresholdLabel || "₹2k"}/month of affordability in ${friction.category} ${priceBand.min.toLocaleString("en-IN")}–${priceBand.max.toLocaleString("en-IN")} — the near-miss segment FITEMI can recover without lowering price.`,
    // Pass through for next stage (same synthetic data, no re-randomization)
    _friction: friction,
    shoppers: friction.shoppers,
    results: friction.results,
  };
}

/**
 * Stage 1c: simulateIntervention(opportunity)
 * Takes opportunity (which contains friction/shoppers/results) and simulates
 * before/after conversion with FITEMI's affordability-matched solver.
 * @param {object} opportunity - result from identifyOpportunity (must include friction's shoppers/results or be friction itself for backward compat)
 * @param {object} opts - optionally pass { friction } if opportunity does not contain shoppers
 * @returns {object} intervention with real before/after numbers
 */
export function simulateIntervention(opportunity, opts = {}) {
  // Allow calling as simulateIntervention(friction) or simulateIntervention(opportunity, { friction })
  // Resolve shoppers/results/priceBand from whichever object contains them
  const friction = opts.friction || opportunity?._friction || opportunity?.friction || opportunity;
  // If opportunity was produced by identifyOpportunity, it may not have shoppers; fall back to friction
  const shoppers = opportunity.shoppers || friction.shoppers || opts.shoppers;
  const results = opportunity.results || friction.results || opts.results;
  const priceBand = opportunity.priceBand || friction.priceBand || friction.priceRange || opportunity.priceRange;

  if (!shoppers || !results) {
    throw new Error("simulateIntervention requires shoppers/results — pass friction from detectFriction or opportunity that carries them");
  }

  let baselineFeasible = 0;
  let fitemiFeasible = 0;
  let baselineGmv = 0;
  let fitemiGmv = 0;
  for (const r of results) {
    if (r.baseline?.feasible) { baselineFeasible++; baselineGmv += r.itemPrice; }
    if (r.fitemi?.feasible) { fitemiFeasible++; fitemiGmv += r.itemPrice; }
  }
  const total = results.length;
  const baselineConversion = total ? Number(((baselineFeasible / total) * 100).toFixed(1)) : 0;
  const fitemiConversion = total ? Number(((fitemiFeasible / total) * 100).toFixed(1)) : 0;
  const recoveredCheckoutCount = fitemiFeasible - baselineFeasible;
  const estimatedGmvRecovered = Math.round(fitemiGmv - baselineGmv);
  const feasibilityLift = Number((fitemiConversion - baselineConversion).toFixed(1));
  const recoveredPct = baselineFeasible ? Number(((recoveredCheckoutCount / baselineFeasible) * 100).toFixed(1)) : (recoveredCheckoutCount ? 100 : 0);

  return {
    stage: "simulateIntervention",
    category: opportunity.category || friction.category,
    priceBand: priceBand || friction.priceBand,
    priceRange: priceBand || friction.priceRange,
    totalShoppers: total,
    before: {
      conversion: baselineConversion,
      feasibleCount: baselineFeasible,
      infeasibleCount: total - baselineFeasible,
      totalGmv: Math.round(baselineGmv),
    },
    after: {
      conversion: fitemiConversion,
      feasibleCount: fitemiFeasible,
      infeasibleCount: total - fitemiFeasible,
      totalGmv: Math.round(fitemiGmv),
    },
    // Required fields for Stage 1 spec
    recoveredCheckoutCount,
    estimatedGmvRecovered,
    gmvRecovered: estimatedGmvRecovered,
    gmvRecoveredFormatted: `₹${estimatedGmvRecovered.toLocaleString("en-IN")}`,
    recoveredCheckoutsPct: recoveredPct,
    feasibilityLift,
    description: `FITEMI recovers ${recoveredCheckoutCount} checkouts (+${recoveredPct}%) and ₹${estimatedGmvRecovered.toLocaleString("en-IN")} GMV vs fixed 6/12/24mo baseline in this synthetic ${total}-shopper simulation.`,
  };
}

// ---------------------------------------------------------------------------
// Main simulation: run N synthetic shoppers, compute delta
// ---------------------------------------------------------------------------

/**
 * Run the AI Growth Loop controlled simulation.
 *
 * @param {object} opts
 * @param {string|null} opts.category - product category (e.g., "laptop", "phone") or null for all
 * @param {object|array|string|null} opts.priceBand - price band filter, e.g., {min:20000,max:60000} or [20000,60000] or "20000-60000"
 * @param {number} opts.shopperCount - N synthetic shoppers (default 60, same as batch-eval)
 * @param {Array|null} opts.shoppers - optionally provide pre-generated shoppers (filtered); if null, generates via same generator
 * @param {Array|null} opts.productsOverride - optionally provide product list (for testing)
 * @returns {object} simulation result with explicit synthetic labeling
 */
export function runGrowthSimulation({ category = null, priceBand = null, shopperCount = 60, shoppers = null, productsOverride = null } = {}) {
  // Validate shopperCount
  const N = Math.max(1, Math.min(500, Math.floor(Number(shopperCount) || 60)));

  // Derive effective price range via existing catalog (no new DB)
  const { min: priceMin, max: priceMax, products: matchedProducts } = deriveEffectivePriceRange({ category, priceBand });
  const effectiveBand = { min: priceMin, max: priceMax };

  // Generate shoppers via reused generator if not provided (same logic as batch-eval generator)
  const simShoppers = shoppers || generateSimulationShoppers({ priceMin, priceMax, count: N });

  // Optionally clamp provided shoppers to price band if they were passed externally
  // (keeps simulation honest to requested band)
  let filteredShoppers = simShoppers;
  if (shoppers && (category || priceBand)) {
    // If shoppers provided externally but a band was requested, we still respect band by filtering
    // (preserves category+priceBand semantics without needing to regenerate)
    const band = normalizePriceBand(priceBand);
    if (band) {
      filteredShoppers = simShoppers.filter((s) => {
        if (band.min != null && s.itemPrice < band.min) return false;
        if (band.max != null && s.itemPrice > band.max) return false;
        return true;
      });
      // If filtering removed many, pad by generating extra to reach N (reuse generator)
      if (filteredShoppers.length < N) {
        const needed = N - filteredShoppers.length;
        const extra = generateSimulationShoppers({ priceMin, priceMax, count: needed });
        filteredShoppers = [...filteredShoppers, ...extra].slice(0, N);
      } else {
        filteredShoppers = filteredShoppers.slice(0, N);
      }
    }
  }

  const results = [];
  let baselineFeasibleCount = 0;
  let fitemiFeasibleCount = 0;
  let baselineGmv = 0;
  let fitemiGmv = 0;
  let baselineTotalEmi = 0;
  let fitemiTotalEmi = 0;
  let fitemiTotalInterest = 0;

  for (const shopper of filteredShoppers) {
    const { target, source } = resolveTargetForShopper(shopper);

    // Zero or negative target: infeasible for both
    if (target == null || target <= 0) {
      results.push({
        shopperId: shopper.id,
        bucket: shopper.bucket,
        itemPrice: shopper.itemPrice,
        target,
        source,
        baseline: { feasible: false, reason: "target <= 0 (no room for EMI)" },
        fitemi: { feasible: false, reason: "target <= 0 (no room for EMI)" },
        recoveredByFitemi: false,
      });
      continue;
    }

    const baseline = checkBaselineFeasible(shopper.itemPrice, target);
    const fitemi = checkFitemiFeasible(shopper.itemPrice, target);

    if (baseline.feasible) {
      baselineFeasibleCount++;
      baselineGmv += shopper.itemPrice;
      baselineTotalEmi += baseline.bestEmi;
    }
    if (fitemi.feasible) {
      fitemiFeasibleCount++;
      fitemiGmv += shopper.itemPrice;
      fitemiTotalEmi += fitemi.bestOption.emi;
      fitemiTotalInterest += fitemi.bestOption.totalInterest;
    }

    const recoveredByFitemi = !baseline.feasible && fitemi.feasible;

    results.push({
      shopperId: shopper.id,
      bucket: shopper.bucket,
      itemPrice: shopper.itemPrice,
      target,
      source,
      baseline: {
        feasible: baseline.feasible,
        tenor: baseline.bestTenor,
        emi: baseline.bestEmi,
        lenderId: baseline.lenderId,
        minFeasibleEmi: baseline.minFeasibleEmi,
      },
      fitemi: {
        feasible: fitemi.feasible,
        tenor: fitemi.bestOption?.tenorMonths || null,
        emi: fitemi.bestOption?.emi || null,
        totalInterest: fitemi.bestOption?.totalInterest || null,
        lenderId: fitemi.bestOption?.lenderId || null,
        minFeasibleEmi: fitemi.minFeasibleEmi || fitemi.raw?.minFeasibleEmi || null,
      },
      recoveredByFitemi,
    });
  }

  // Affordability-gap pattern analysis (near-miss declines)
  const affordabilityGap = analyzeAffordabilityGapPattern(results);

  const deltaFeasible = fitemiFeasibleCount - baselineFeasibleCount;
  const deltaGmv = fitemiGmv - baselineGmv;
  const total = filteredShoppers.length;

  const baselineRate = total ? (baselineFeasibleCount / total) * 100 : 0;
  const fitemiRate = total ? (fitemiFeasibleCount / total) * 100 : 0;
  const liftPct = baselineFeasibleCount > 0 ? (deltaFeasible / baselineFeasibleCount) * 100 : (deltaFeasible > 0 ? 100 : 0);
  const gmvLiftPct = baselineGmv > 0 ? (deltaGmv / baselineGmv) * 100 : (deltaGmv > 0 ? 100 : 0);

  // Count recovered shoppers (the core Growth Loop insight)
  const recoveredShoppers = results.filter((r) => r.recoveredByFitemi);
  const avgFitemiTenor =
    fitemiFeasibleCount > 0
      ? results.filter((r) => r.fitemi.feasible).reduce((sum, r) => sum + r.fitemi.tenor, 0) / fitemiFeasibleCount
      : null;

  return {
    // Explicit synthetic labeling — never present as real history
    simulationLabel: SIMULATION_LABEL,
    simulationMethod: SIMULATION_METHOD,
    disclaimer: SIMULATION_DISCLAIMER,
    isSynthetic: true,
    isRealTransactionHistory: false,
    syntheticDataSource: "server/scripts/generateShoppers.js (same generator as npm run batch-eval)",
    generatedAt: new Date().toISOString(),

    inputs: {
      category: category || "all",
      priceBand: effectiveBand,
      requestedPriceBand: normalizePriceBand(priceBand),
      matchedProductsCount: matchedProducts.length,
      matchedProducts: matchedProducts.map((p) => ({ id: p.id, name: p.name, category: p.category, price: p.price })),
      shopperCount: total,
      requestedShopperCount: N,
    },

    baseline: {
      label: BASELINE_DESCRIPTION,
      tenors: [...BASELINE_TENORS],
      lendersConsidered: lenders.map((l) => ({ id: l.id, minTenor: l.minTenor, maxTenor: l.maxTenor, monthlyRate: l.monthlyRate })),
      feasibleCount: baselineFeasibleCount,
      infeasibleCount: total - baselineFeasibleCount,
      feasibilityRate: Number(baselineRate.toFixed(1)),
      totalGmv: Math.round(baselineGmv),
      avgEmi: baselineFeasibleCount ? Math.round(baselineTotalEmi / baselineFeasibleCount) : null,
    },

    withFitemi: {
      label: FITEMI_DESCRIPTION,
      lendersConsidered: lenders.map((l) => ({ id: l.id, minTenor: l.minTenor, maxTenor: l.maxTenor, monthlyRate: l.monthlyRate })),
      feasibleCount: fitemiFeasibleCount,
      infeasibleCount: total - fitemiFeasibleCount,
      feasibilityRate: Number(fitemiRate.toFixed(1)),
      totalGmv: Math.round(fitemiGmv),
      avgEmi: fitemiFeasibleCount ? Math.round(fitemiTotalEmi / fitemiFeasibleCount) : null,
      avgTotalInterest: fitemiFeasibleCount ? Math.round(fitemiTotalInterest / fitemiFeasibleCount) : null,
      avgTenorMonths: avgFitemiTenor != null ? Number(avgFitemiTenor.toFixed(1)) : null,
    },

    delta: {
      recoveredCheckouts: deltaFeasible,
      recoveredCheckoutsPct: Number(liftPct.toFixed(1)),
      gmvRecovered: Math.round(deltaGmv),
      gmvRecoveredPct: Number(gmvLiftPct.toFixed(1)),
      gmvRecoveredFormatted: `₹${Math.round(deltaGmv).toLocaleString("en-IN")}`,
      feasibilityLift: Number((fitemiRate - baselineRate).toFixed(1)),
      description: `FITEMI recovers ${deltaFeasible} additional feasible checkouts (+${liftPct.toFixed(1)}%) and ₹${Math.round(deltaGmv).toLocaleString("en-IN")} GMV vs fixed 6/12/24mo baseline in this synthetic simulation.`,
    },

    insights: {
      recoveredShoppersCount: recoveredShoppers.length,
      recoveredShoppersSample: recoveredShoppers.slice(0, 5).map((r) => ({
        shopperId: r.shopperId,
        bucket: r.bucket,
        itemPrice: r.itemPrice,
        target: r.target,
        fitemiTenor: r.fitemi.tenor,
        fitemiEmi: r.fitemi.emi,
        fitemiLender: r.fitemi.lenderId,
      })),
      note: "Recovered shoppers are those who fail the fixed-tenor baseline but pass FITEMI's affordability-matched solver. They represent the incremental conversion opportunity in this controlled simulation.",
    },

    affordabilityGap,
    affordabilityGapPattern: affordabilityGap.pattern,

    // Full per-shopper detail for auditability (can be paginated by caller)
    results,
    totalShoppers: total,
  };
}

/**
 * Lightweight summary for merchant console (without full per-shopper results).
 */
export function summarizeGrowthSimulation(simulationResult) {
  if (!simulationResult || !simulationResult.delta) throw new Error("Invalid simulation result");
  return {
    simulationLabel: simulationResult.simulationLabel,
    disclaimer: simulationResult.disclaimer,
    isSynthetic: true,
    inputs: simulationResult.inputs,
    baseline: {
      feasibleCount: simulationResult.baseline.feasibleCount,
      totalGmv: simulationResult.baseline.totalGmv,
      feasibilityRate: simulationResult.baseline.feasibilityRate,
    },
    withFitemi: {
      feasibleCount: simulationResult.withFitemi.feasibleCount,
      totalGmv: simulationResult.withFitemi.totalGmv,
      feasibilityRate: simulationResult.withFitemi.feasibilityRate,
    },
    delta: simulationResult.delta,
    insights: simulationResult.insights,
    generatedAt: simulationResult.generatedAt,
  };
}

export default {
  SIMULATION_LABEL,
  SIMULATION_DISCLAIMER,
  SIMULATION_METHOD,
  BASELINE_DESCRIPTION,
  FITEMI_DESCRIPTION,
  BASELINE_TENORS,
  runGrowthSimulation,
  detectFriction,
  identifyOpportunity,
  simulateIntervention,
  generateSimulationShoppers,
  checkBaselineFeasible,
  checkFitemiFeasible,
  analyzeAffordabilityGapPattern,
  filterProductsByCategoryAndPrice,
  deriveEffectivePriceRange,
  normalizePriceBand,
  resolveTargetForShopper,
  summarizeGrowthSimulation,
};
