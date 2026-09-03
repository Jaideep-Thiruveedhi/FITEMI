/**
 * evalCheck.js — regression guard for batch evaluation.
 * Runs the same synthetic-shopper evaluation as runBatchEval.js and
 * exits non-zero if feasible rate < 50% or avg tenor > 24 months.
 *
 * Usage: npm run eval:check
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { findFeasiblePlans } from "../src/lib/emiSolver.js";
import { lenders } from "../src/lib/lenders.js";
import { computeAffordabilityCeiling } from "../src/lib/affordability.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SHOPPERS_PATH = path.join(__dirname, "../data/shoppers.json");

function runEval() {
  if (!fs.existsSync(SHOPPERS_PATH)) {
    console.error(`[eval:check] Shoppers file not found: ${SHOPPERS_PATH}`);
    console.error("[eval:check] Run: npm run generate-shoppers --workspace=server");
    process.exit(1);
  }

  const shoppers = JSON.parse(fs.readFileSync(SHOPPERS_PATH, "utf-8"));
  let feasibleCount = 0;
  let totalTenor = 0;

  for (const shopper of shoppers) {
    let target;
    if (shopper.statedBudget != null) {
      target = shopper.statedBudget;
    } else {
      target = computeAffordabilityCeiling({
        takeHomePay: shopper.takeHomePay,
        existingObligations: shopper.existingObligations,
        otherExpenses: shopper.otherExpenses,
      });
      if (target <= 0) continue;
    }
    const result = findFeasiblePlans(shopper.itemPrice, target, lenders);
    if (result.feasible) {
      feasibleCount++;
      totalTenor += result.options[0].tenorMonths;
    }
  }

  const total = shoppers.length;
  const feasibleRate = (feasibleCount / total) * 100;
  const avgTenor = feasibleCount > 0 ? totalTenor / feasibleCount : 0;

  console.log(`[eval:check] ${feasibleCount}/${total} feasible (${feasibleRate.toFixed(1)}%), avg tenor ${avgTenor.toFixed(1)}mo`);

  let failed = false;
  if (feasibleRate < 50) {
    console.error(`[eval:check] FAIL: feasible rate ${feasibleRate.toFixed(1)}% < 50% threshold`);
    failed = true;
  } else {
    console.log(`[eval:check] PASS: feasible rate ${feasibleRate.toFixed(1)}% >= 50%`);
  }

  if (avgTenor > 24) {
    console.error(`[eval:check] FAIL: avg tenor ${avgTenor.toFixed(1)}mo > 24mo threshold`);
    failed = true;
  } else {
    console.log(`[eval:check] PASS: avg tenor ${avgTenor.toFixed(1)}mo <= 24mo`);
  }

  if (failed) {
    console.error("[eval:check] Regression guard FAILED");
    process.exit(1);
  } else {
    console.log("[eval:check] Regression guard PASSED");

    // Also run full batch eval to update report (optional, not required for pass)
    try {
      const reportPath = path.join(__dirname, "../../docs/batch-eval-report.md");
      if (fs.existsSync(reportPath)) {
        console.log(`[eval:check] Report exists at ${reportPath} (run npm run batch-eval to refresh)`);
      }
    } catch {}
    process.exit(0);
  }
}

runEval();
