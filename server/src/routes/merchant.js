import express from "express";
import { getOrders, getOrderById, getRevenueInsights } from "../lib/merchant.js";
import { merchants } from "../lib/catalog.js";
import { runGrowthSimulation } from "../lib/growthAnalysis.js";

const router = express.Router();

// GET /api/merchant/orders — list orders
router.get("/orders", (req, res) => {
  const { merchantId, limit } = req.query;
  const orders = getOrders({ merchantId, limit: limit ? parseInt(limit, 10) : 20 });
  res.json({ count: orders.length, orders });
});

// GET /api/merchant/orders/:id
router.get("/orders/:id", (req, res) => {
  const order = getOrderById(req.params.id);
  if (!order) return res.status(404).json({ error: "Order not found" });
  res.json({ order });
});

// GET /api/merchant/insights — revenue intelligence
router.get("/insights", (req, res) => {
  const insights = getRevenueInsights();
  res.json(insights);
});

// GET /api/merchant/merchants — list merchants
router.get("/merchants", (req, res) => {
  res.json({ merchants });
});

// POST /api/merchant/growth-analysis — AI Growth Loop controlled simulation
// Body: { category?, priceMin?, priceMax?, priceBand?, shopperCount? }
// Reuses batch-eval synthetic shopper generator (no new DB, additive only)
router.post("/growth-analysis", (req, res) => {
  try {
    const { category, priceMin, priceMax, priceBand: rawPriceBand, shopperCount } = req.body || {};

    // Normalize price band from either {priceMin,priceMax} or {priceBand}
    let priceBand = null;
    if (priceMin != null || priceMax != null) {
      if (priceMin != null && (typeof priceMin !== "number" || Number.isNaN(priceMin) || priceMin <= 0)) {
        return res.status(400).json({ error: "priceMin must be a positive number" });
      }
      if (priceMax != null && (typeof priceMax !== "number" || Number.isNaN(priceMax) || priceMax <= 0)) {
        return res.status(400).json({ error: "priceMax must be a positive number" });
      }
      if (priceMin != null && priceMax != null && priceMin > priceMax) {
        return res.status(400).json({ error: "priceMin cannot be greater than priceMax" });
      }
      priceBand = { min: priceMin ?? null, max: priceMax ?? null };
      if (priceBand.min == null && priceBand.max == null) priceBand = null;
    } else if (rawPriceBand != null) {
      priceBand = rawPriceBand;
    }

    if (category != null && typeof category !== "string") {
      return res.status(400).json({ error: "category must be a string" });
    }

    const simulation = runGrowthSimulation({
      category: category || null,
      priceBand,
      shopperCount: shopperCount != null ? Number(shopperCount) : 60,
    });

    // Build merchant-facing before/after comparison (explicit synthetic labeling)
    const response = {
      // Explicit synthetic labeling — never real transaction history
      simulationLabel: simulation.simulationLabel,
      disclaimer: simulation.disclaimer,
      isSynthetic: simulation.isSynthetic,
      isRealTransactionHistory: simulation.isRealTransactionHistory,
      syntheticDataSource: simulation.syntheticDataSource,
      simulationMethod: simulation.simulationMethod,
      generatedAt: simulation.generatedAt,

      inputs: simulation.inputs,

      // Before/after comparison (required fields)
      baselineConversion: simulation.baseline.feasibilityRate,
      baselineConversionFormatted: `${simulation.baseline.feasibilityRate}%`,
      baseline: {
        conversion: simulation.baseline.feasibilityRate,
        conversionRate: simulation.baseline.feasibilityRate,
        feasibleCount: simulation.baseline.feasibleCount,
        infeasibleCount: simulation.baseline.infeasibleCount,
        totalGmv: simulation.baseline.totalGmv,
        avgEmi: simulation.baseline.avgEmi,
        tenors: simulation.baseline.tenors,
        label: simulation.baseline.label,
      },

      fitemiConversion: simulation.withFitemi.feasibilityRate,
      fitemiConversionFormatted: `${simulation.withFitemi.feasibilityRate}%`,
      withFitemi: {
        conversion: simulation.withFitemi.feasibilityRate,
        conversionRate: simulation.withFitemi.feasibilityRate,
        feasibleCount: simulation.withFitemi.feasibleCount,
        infeasibleCount: simulation.withFitemi.infeasibleCount,
        totalGmv: simulation.withFitemi.totalGmv,
        avgEmi: simulation.withFitemi.avgEmi,
        avgTotalInterest: simulation.withFitemi.avgTotalInterest,
        avgTenorMonths: simulation.withFitemi.avgTenorMonths,
        label: simulation.withFitemi.label,
      },

      recoveredCheckoutCount: simulation.delta.recoveredCheckouts,
      recoveredCheckouts: simulation.delta.recoveredCheckouts,
      recoveredGmvEstimate: simulation.delta.gmvRecovered,
      recoveredGmv: simulation.delta.gmvRecovered,
      recoveredGmvFormatted: simulation.delta.gmvRecoveredFormatted,
      delta: simulation.delta,

      // Affordability-gap pattern (e.g. "37% of declines had EMI > affordability by <₹2k/month")
      affordabilityGapPattern: simulation.affordabilityGapPattern,
      affordabilityGap: simulation.affordabilityGap,

      // Full simulation for drill-down (merchant console can paginate results)
      insights: simulation.insights,
      totalShoppers: simulation.totalShoppers,
      results: simulation.results,
      resultsSample: simulation.results.slice(0, 10),
    };

    return res.json(response);
  } catch (err) {
    console.error("[merchant/growth-analysis] error:", err);
    return res.status(500).json({ error: "Failed to run growth analysis", details: err.message });
  }
});

export default router;
