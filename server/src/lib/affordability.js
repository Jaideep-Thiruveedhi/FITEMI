/**
 * Configurable affordability ceiling.
 * Rule of thumb: total EMI burden should not exceed 40% of take-home pay.
 * This is a tunable heuristic, not a verified regulatory figure.
 */
export const AFFORDABILITY_RATIO = 0.4;

/**
 * Compute safe target monthly payment ceiling.
 * @param {{ takeHomePay: number, existingObligations: number, otherExpenses?: number }} params
 * @returns {number} safe monthly payment ceiling, floored at 0
 */
export function computeAffordabilityCeiling({ takeHomePay, existingObligations, otherExpenses = 0 }) {
  const ceiling = AFFORDABILITY_RATIO * takeHomePay - existingObligations;
  return Math.max(0, Math.floor(ceiling));
}

/**
 * Validate affordability inputs.
 * @returns {{ valid: boolean, error?: string }}
 */
export function validateAffordabilityInputs({ takeHomePay, existingObligations, otherExpenses }) {
  if (takeHomePay == null || existingObligations == null) {
    return { valid: false, error: "takeHomePay and existingObligations are required." };
  }
  if (typeof takeHomePay !== "number" || typeof existingObligations !== "number") {
    return { valid: false, error: "takeHomePay and existingObligations must be numbers." };
  }
  if (takeHomePay <= 0) return { valid: false, error: "takeHomePay must be greater than 0." };
  if (existingObligations < 0) return { valid: false, error: "existingObligations cannot be negative." };
  if (otherExpenses != null && (typeof otherExpenses !== "number" || otherExpenses < 0)) {
    return { valid: false, error: "otherExpenses must be a non-negative number." };
  }
  if (existingObligations > takeHomePay) {
    return { valid: false, error: "Existing obligations exceed take-home pay — no room for additional EMI." };
  }
  return { valid: true };
}
