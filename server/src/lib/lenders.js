// Synthetic lender profiles — no real bank/NBFC calls.
// monthlyRate is monthly interest rate (e.g. 0.0125 = 1.25%/month ≈ 15% APR)
export const lenders = [
  { id: "lenderA", name: "QuickPay Finance", minTenor: 3, maxTenor: 24, monthlyRate: 0.0125 },
  { id: "lenderB", name: "SteadyEMI Credit", minTenor: 6, maxTenor: 18, monthlyRate: 0.0108 },
  { id: "lenderC", name: "FlexiLoan NBFC", minTenor: 3, maxTenor: 12, monthlyRate: 0.0150 },
];

export default lenders;
