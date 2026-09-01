import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { findFeasiblePlans } from "../src/lib/emiSolver.js";
import { lenders } from "../src/lib/lenders.js";
import { computeAffordabilityCeiling } from "../src/lib/affordability.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SHOPPERS_PATH = path.join(__dirname, "../data/shoppers.json");
const REPORT_PATH = path.join(__dirname, "../../docs/batch-eval-report.md");

function evaluate() {
  if (!fs.existsSync(SHOPPERS_PATH)) {
    console.error(`Shoppers file not found: ${SHOPPERS_PATH}`);
    console.error("Run: node server/scripts/generateShoppers.js");
    process.exit(1);
  }

  const shoppers = JSON.parse(fs.readFileSync(SHOPPERS_PATH, "utf-8"));
  const results = [];
  let feasibleCount = 0;
  let totalTenor = 0;
  let totalInterest = 0;
  const declined = [];

  for (const shopper of shoppers) {
    let target;
    let source;

    if (shopper.statedBudget != null) {
      target = shopper.statedBudget;
      source = "statedBudget";
    } else {
      target = computeAffordabilityCeiling({
        takeHomePay: shopper.takeHomePay,
        existingObligations: shopper.existingObligations,
        otherExpenses: shopper.otherExpenses,
      });
      source = "affordabilityCeiling";
      // If ceiling is 0, no plan possible
      if (target <= 0) {
        declined.push({
          id: shopper.id,
          bucket: shopper.bucket,
          itemPrice: shopper.itemPrice,
          target,
          source,
          reason: "Computed affordability ceiling is 0 or negative — no room for additional EMI (existing obligations consume the 40% threshold).",
        });
        results.push({ shopper, feasible: false, target, source });
        continue;
      }
    }

    // Check interest-only threshold for context
    const maxInterestOnly = Math.max(...lenders.map((l) => shopper.itemPrice * l.monthlyRate));

    const solverResult = findFeasiblePlans(shopper.itemPrice, target, lenders);

    if (solverResult.feasible) {
      feasibleCount++;
      const best = solverResult.options[0];
      totalTenor += best.tenorMonths;
      totalInterest += best.totalInterest;
      results.push({ shopper, feasible: true, target, source, bestOption: best, allOptions: solverResult.options });
    } else {
      let reason;
      if (target <= maxInterestOnly) {
        // Check if below ALL lenders' interest-only
        const minInterestOnly = Math.min(...lenders.map((l) => shopper.itemPrice * l.monthlyRate));
        if (target <= minInterestOnly) {
          reason = `Requested budget (₹${target}) is below the interest-only payment on all lenders (lowest is ₹${Math.round(minInterestOnly)}). Loan would never amortize.`;
        } else {
          reason = `Requested budget (₹${target}) is below interest-only payment on some lenders and no tenor fits within budget on any lender.`;
        }
        if (source === "affordabilityCeiling") {
          reason = `Computed affordability ceiling (₹${target}) is below minimum EMI on all lenders. ` + reason;
        }
      } else {
        reason = `No tenor across any lender produces an EMI within the ${source} of ₹${target} for item price ₹${shopper.itemPrice}.`;
        if (source === "affordabilityCeiling") {
          reason = `Computed affordability ceiling (₹${target}) is below minimum EMI on all lenders for item price ₹${shopper.itemPrice}.`;
        } else {
          reason = `Requested budget (₹${target}) is below minimum EMI on all lenders for item price ₹${shopper.itemPrice}.`;
        }
      }
      declined.push({
        id: shopper.id,
        bucket: shopper.bucket,
        itemPrice: shopper.itemPrice,
        target,
        source,
        reason,
      });
      results.push({ shopper, feasible: false, target, source, reason });
    }
  }

  const total = shoppers.length;
  const declinedCount = total - feasibleCount;
  const avgTenor = feasibleCount > 0 ? (totalTenor / feasibleCount).toFixed(1) : "N/A";
  const avgInterest = feasibleCount > 0 ? Math.round(totalInterest / feasibleCount) : "N/A";

  // Bucket breakdown
  const bucketStats = {};
  for (const r of results) {
    const b = r.shopper.bucket;
    if (!bucketStats[b]) bucketStats[b] = { total: 0, feasible: 0 };
    bucketStats[b].total++;
    if (r.feasible) bucketStats[b].feasible++;
  }

  const timestamp = new Date().toISOString();

  const report = `# Batch Evaluation Report

Generated: ${timestamp}
Shoppers file: \`server/data/shoppers.json\`
Lenders: ${lenders.map((l) => `${l.id} (${l.minTenor}–${l.maxTenor}mo @ ${(l.monthlyRate * 100).toFixed(2)}%/mo)`).join(", ")}

## Summary

| Metric | Value |
|---|---|
| Total shoppers evaluated | ${total} |
| Feasible plans found | ${feasibleCount} |
| No feasible plan (declined) | ${declinedCount} |
| Feasibility rate | ${((feasibleCount / total) * 100).toFixed(1)}% |
| Average tenor (feasible only) | ${avgTenor} months |
| Average total interest (feasible only) | ${avgInterest === "N/A" ? "N/A" : `₹${avgInterest.toLocaleString("en-IN")}`} |

## Breakdown by bucket

| Bucket | Total | Feasible | Declined | Feasibility |
|---|---|---|---|---|
${Object.entries(bucketStats).map(([b, s]) => `| ${b} | ${s.total} | ${s.feasible} | ${s.total - s.feasible} | ${((s.feasible / s.total) * 100).toFixed(1)}% |`).join("\n")}

Bucket definitions:
- **comfortable**: budget clearly above minimum EMI — expects short tenor, low interest.
- **tight**: budget barely above minimum EMI — expects longest tenor to fit.
- **infeasible**: budget below minimum EMI — expects no feasible plan.
- **no_budget**: no stated budget; ceiling computed via affordability (0.4 × takeHomePay − obligations).

## Feasible plans (top option per shopper)

| Shopper | Bucket | Item Price | Budget/Ceiling | Tenor | EMI | Total Interest | Lender |
|---|---|---|---|---|---|---|---|
${results.filter((r) => r.feasible).map((r) => `| ${r.shopper.id} | ${r.shopper.bucket} | ₹${r.shopper.itemPrice.toLocaleString("en-IN")} | ₹${r.target.toLocaleString("en-IN")} (${r.source}) | ${r.bestOption.tenorMonths}mo | ₹${r.bestOption.emi.toLocaleString("en-IN")} | ₹${r.bestOption.totalInterest.toLocaleString("en-IN")} | ${r.bestOption.lenderId} |`).join("\n")}

## Declined — audit trail (no feasible plan)

> This is the most important section. It proves the system is honest, not just optimistic.

| Shopper | Bucket | Item Price | Budget/Ceiling | Reason |
|---|---|---|---|---|
${declined.map((d) => `| ${d.id} | ${d.bucket} | ₹${d.itemPrice.toLocaleString("en-IN")} | ₹${d.target.toLocaleString("en-IN")} (${d.source}) | ${d.reason} |`).join("\n")}

## Notes

- All EMI figures computed deterministically by \`emiSolver.js\`.
- Affordability ceiling uses \`0.4 × takeHomePay − existingObligations\` (configurable heuristic).
- Lender rates are synthetic; no real bank/NBFC calls.
- Every recommendation (feasible or declined) would be appended to \`server/data/audit.log\` when served via the API.
`;

  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(REPORT_PATH, report, "utf-8");
  console.log(`Batch eval complete: ${feasibleCount}/${total} feasible, ${declinedCount} declined`);
  console.log(`Avg tenor: ${avgTenor}mo, avg interest: ₹${avgInterest}`);
  console.log(`Report written to ${REPORT_PATH}`);
  if (declined.length > 0) {
    console.log(`\nDeclined shoppers (audit trail):`);
    for (const d of declined) {
      console.log(`  - ${d.id} (${d.bucket}): ${d.reason}`);
    }
  }
}

evaluate();
