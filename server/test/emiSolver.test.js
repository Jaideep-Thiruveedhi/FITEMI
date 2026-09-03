import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { emiForTenor, findFeasiblePlans } from "../src/lib/emiSolver.js";
import { lenders } from "../src/lib/lenders.js";

describe("emiForTenor", () => {
  it("computes EMI for standard case (matches known formula)", () => {
    // P=65000, r=1.25% (0.0125), n=12 => EMI ~ 5778.11 (approx, verify formula)
    const emi = emiForTenor(65000, 0.0125, 12);
    // Compute manually: factor = 1.0125^12
    const factor = Math.pow(1.0125, 12);
    const expected = 65000 * 0.0125 * factor / (factor - 1);
    assert.ok(Math.abs(emi - expected) < 1e-9);
    // Also sanity: EMI * n > P and EMI > P * r (interest)
    assert.ok(emi * 12 > 65000);
  });

  it("handles zero interest edge case: EMI = P / n", () => {
    assert.strictEqual(emiForTenor(24000, 0, 12), 2000);
    assert.strictEqual(emiForTenor(10000, 0, 3), 10000 / 3);
    assert.strictEqual(emiForTenor(50000, 0, 24), 50000 / 24);
  });

  it("rounding behavior: solver rounds EMI to 2dp", () => {
    // Choose values that produce >2dp to verify rounding
    const principal = 65000;
    const target = 5000; // comfortably feasible
    const result = findFeasiblePlans(principal, target, lenders);
    assert.ok(result.feasible);
    for (const opt of result.options) {
      const str = opt.emi.toString();
      const decimals = str.includes(".") ? str.split(".")[1].length : 0;
      assert.ok(decimals <= 2, `emi ${opt.emi} should have <=2 decimals`);
      // totalPaid should be close to emi*tenor (within rounding tolerance) and interest = total - principal
      assert.ok(Math.abs(opt.totalPaid - opt.emi * opt.tenorMonths) < 1, `totalPaid ${opt.totalPaid} vs emi*tenor ${opt.emi * opt.tenorMonths}`);
      assert.strictEqual(opt.totalInterest, Math.round((opt.totalPaid - principal) * 100) / 100);
    }
  });
});

describe("findFeasiblePlans - minimum tenor boundary", () => {
  it("selects smallest tenor that fits (fastest payoff = least interest)", () => {
    // For lenderA (1.25%, 3-24mo), with high budget, smallest fitting n should be chosen
    // P=12000, target=5000 => even 3mo EMI ~ 4086 fits, so should pick 3
    const result = findFeasiblePlans(12000, 5000, lenders);
    assert.ok(result.feasible);
    const a = result.options.find(o => o.lenderId === "lenderA");
    assert.ok(a, "lenderA should be feasible");
    assert.strictEqual(a.tenorMonths, 3);
    // Verify EMI calculation matches
    const expectedEmi = Math.round(emiForTenor(12000, 0.0125, 3) * 100) / 100;
    assert.strictEqual(a.emi, expectedEmi);
  });

  it("respects lender minTenor boundary: budget just below smallest-n EMI forces next n", () => {
    // Compute EMI for n=3 and n=6 for lenderA, set target between them
    const emi3 = emiForTenor(24000, 0.0125, 3);
    const emi6 = emiForTenor(24000, 0.0125, 6);
    // emi3 > emi6 (longer tenor lower EMI). Pick target = (emi3+emi6)/2 but less than emi3
    const target = Math.floor((emi3 + emi6) / 2);
    assert.ok(emi3 > target && target >= emi6, `emi3=${emi3} target=${target} emi6=${emi6}`);
    const result = findFeasiblePlans(24000, target, lenders);
    assert.ok(result.feasible);
    const a = result.options.find(o => o.lenderId === "lenderA");
    // lenderA smallest fitting should be >3
    assert.ok(a.tenorMonths > 3);
    assert.ok(a.emi <= target);
  });

  it("respects lender maxTenor boundary: if even maxTenor EMI > target, lender is skipped", () => {
    // P=89900 (MacBook), target=1200 very low, all lenders' maxTenor EMI >1200
    const result = findFeasiblePlans(89900, 1200, lenders);
    assert.ok(!result.feasible);
    // Should provide minFeasibleEmi at maxTenor across lenders
    assert.ok(result.minFeasibleEmi > 1200);
    // Verify minFeasibleEmi is the smallest among maxTenor EMIs
    const minExpected = Math.min(
      emiForTenor(89900, 0.0125, 24),
      emiForTenor(89900, 0.0108, 18),
      emiForTenor(89900, 0.015, 12)
    );
    assert.strictEqual(result.minFeasibleEmi, Math.round(minExpected * 100) / 100);
  });
});

describe("findFeasiblePlans - no feasible plan path", () => {
  it("returns feasible:false with minFeasibleEmi when budget below lowest possible EMI", () => {
    const result = findFeasiblePlans(24000, 500, lenders);
    assert.strictEqual(result.feasible, false);
    assert.ok(result.reason.includes("No lender"));
    assert.ok(typeof result.minFeasibleEmi === "number");
    assert.ok(result.minFeasibleEmi > 500);
    assert.ok(result.minFeasibleTenor != null);
    assert.ok(result.minFeasibleLender != null);
  });

  it("handles case where budget <= interest-only (loan never amortizes)", () => {
    // interestOnly for lenderC on 24000 = 24000*0.015=360, for lenderA=300
    // budget 300 should skip lenderA (<= interestOnly) and lenderC edge
    const result = findFeasiblePlans(24000, 300, lenders);
    assert.strictEqual(result.feasible, false);
    assert.ok(result.minFeasibleEmi > 300);
  });

  it("zero-interest lender still finds feasible plan at P/n", () => {
    const zeroLender = [{ id: "zero", minTenor: 3, maxTenor: 12, monthlyRate: 0 }];
    const result = findFeasiblePlans(12000, 1000, zeroLender);
    assert.ok(result.feasible);
    // 12000/12=1000 fits exactly at n=12, but 12000/11=1090 >1000, so smallest fitting is 12
    assert.strictEqual(result.options[0].tenorMonths, 12);
    assert.strictEqual(result.options[0].emi, 1000);
  });

  it("ranks feasible options by lowest totalInterest", () => {
    const result = findFeasiblePlans(65000, 5000, lenders);
    assert.ok(result.feasible);
    assert.ok(result.options.length >= 2);
    for (let i = 1; i < result.options.length; i++) {
      assert.ok(result.options[i - 1].totalInterest <= result.options[i].totalInterest);
    }
    assert.strictEqual(result.options[0].explanationFacts.reason, "lowest_total_interest");
    assert.strictEqual(result.options[0].explanationFacts.rank, 1);
  });
});
