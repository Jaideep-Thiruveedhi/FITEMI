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
    return { feasible: false, reason: "No lender can offer a plan within your monthly budget. Even the longest available tenor exceeds what you can pay." };
  }

  // Rank by total interest ascending (cheapest first)
  candidates.sort((a, b) => a.totalInterest - b.totalInterest);

  // Return up to 3 best options
  return { feasible: true, options: candidates.slice(0, 3) };
}
