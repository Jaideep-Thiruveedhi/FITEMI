/**
 * EMI = P × r × (1+r)^n / ((1+r)^n − 1)
 */
export function emiForTenor(principal, monthlyRate, n) {
  const factor = Math.pow(1 + monthlyRate, n);
  return principal * monthlyRate * factor / (factor - 1);
}

/**
 * Find feasible EMI plans across all lenders.
 * For each lender, finds the smallest tenor n whose EMI <= target.
 * Smallest n = fastest payoff = least total interest.
 *
 * @param {number} principal - item price
 * @param {number} targetMonthlyPayment - max EMI buyer can pay
 * @param {Array} lenders - array of { id, minTenor, maxTenor, monthlyRate }
 * @returns {{ feasible: boolean, options?: Array, reason?: string }}
 */
export function findFeasiblePlans(principal, targetMonthlyPayment, lenders) {
  const candidates = [];

  for (const lender of lenders) {
    // If target doesn't even cover monthly interest, loan never amortizes for this lender
    const interestOnly = principal * lender.monthlyRate;
    if (targetMonthlyPayment <= interestOnly) {
      continue;
    }

    let foundTenor = null;
    let foundEmi = null;

    for (let n = lender.minTenor; n <= lender.maxTenor; n++) {
      const emi = emiForTenor(principal, lender.monthlyRate, n);
      if (emi <= targetMonthlyPayment) {
        foundTenor = n;
        foundEmi = emi;
        break; // smallest n that fits — prefer fastest payoff
      }
    }

    if (foundTenor !== null) {
      const totalPaid = foundEmi * foundTenor;
      const totalInterest = totalPaid - principal;
      candidates.push({
        lenderId: lender.id,
        tenorMonths: foundTenor,
        emi: Math.round(foundEmi * 100) / 100,
        totalInterest: Math.round(totalInterest * 100) / 100,
        totalPaid: Math.round(totalPaid * 100) / 100,
      });
    }
  }

  if (candidates.length === 0) {
    // Compute the absolute lowest EMI achievable across all lenders (at max tenor) for helpful "no feasible" UI
    let minEmi = Infinity;
    let minTenor = null;
    let minLender = null;
    for (const lender of lenders) {
      const emi = emiForTenor(principal, lender.monthlyRate, lender.maxTenor);
      if (emi < minEmi) {
        minEmi = emi;
        minTenor = lender.maxTenor;
        minLender = lender.id;
      }
    }
    return {
      feasible: false,
      reason: "No lender can offer a plan within your monthly budget. Even the longest available tenor exceeds what you can pay.",
      minFeasibleEmi: Math.round(minEmi * 100) / 100,
      minFeasibleTenor: minTenor,
      minFeasibleLender: minLender,
    };
  }

  // Rank by total interest ascending (cheapest first)
  candidates.sort((a, b) => a.totalInterest - b.totalInterest);

  // Enrich each candidate with deterministic explanation facts (never LLM-generated)
  const ranked = candidates.slice(0, 3).map((opt, idx, arr) => {
    const monthlyHeadroom = Math.round((targetMonthlyPayment - opt.emi) * 100) / 100;
    let reason;
    let reasonLabel;
    if (idx === 0) {
      reason = "lowest_total_interest";
      reasonLabel = `Lowest total interest among plans that fit your ₹${targetMonthlyPayment.toLocaleString("en-IN")} budget — fastest payoff that stays within budget.`;
    } else if (opt.emi === Math.min(...arr.map((o) => o.emi))) {
      reason = "lowest_monthly_payment";
      reasonLabel = `Lowest monthly payment — more headroom (₹${monthlyHeadroom.toLocaleString("en-IN")}/mo spare), but higher total interest than the fastest option.`;
    } else if (monthlyHeadroom > 500) {
      reason = "best_budget_headroom";
      reasonLabel = `Comfortable headroom of ₹${monthlyHeadroom.toLocaleString("en-IN")}/mo left in your budget, at the cost of higher total interest.`;
    } else {
      reason = "alternative_tenure";
      reasonLabel = `Alternative tenure with higher total interest than the best option — trade shorter payoff for lower monthly amount.`;
    }
    // Shortest tenure distinction (if multiple have same interest ordering, shortest is best)
    if (idx === 0) {
      // best_overall also implies shortest tenure among cheapest — but we keep lowest_total_interest as primary
    }
    return {
      ...opt,
      explanationFacts: {
        monthlyPayment: opt.emi,
        targetBudget: targetMonthlyPayment,
        monthlyHeadroom,
        totalInterest: opt.totalInterest,
        totalPaid: opt.totalPaid,
        tenor: opt.tenorMonths,
        rank: idx + 1,
        reason,
        reasonLabel,
      },
    };
  });

  return { feasible: true, options: ranked };
}
