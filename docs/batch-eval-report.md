# Batch Evaluation Report

Generated: 2026-09-01T21:02:42.224Z
Shoppers file: `server/data/shoppers.json`
Lenders: lenderA (3–24mo @ 1.25%/mo), lenderB (6–18mo @ 1.08%/mo), lenderC (3–12mo @ 1.50%/mo)

## Summary

| Metric | Value |
|---|---|
| Total shoppers evaluated | 60 |
| Feasible plans found | 38 |
| No feasible plan (declined) | 22 |
| Feasibility rate | 63.3% |
| Average tenor (feasible only) | 13.2 months |
| Average total interest (feasible only) | ₹3,518 |

## Breakdown by bucket

| Bucket | Total | Feasible | Declined | Feasibility |
|---|---|---|---|---|
| infeasible | 15 | 0 | 15 | 0.0% |
| tight | 15 | 15 | 0 | 100.0% |
| comfortable | 15 | 15 | 0 | 100.0% |
| no_budget | 15 | 8 | 7 | 53.3% |

Bucket definitions:
- **comfortable**: budget clearly above minimum EMI — expects short tenor, low interest.
- **tight**: budget barely above minimum EMI — expects longest tenor to fit.
- **infeasible**: budget below minimum EMI — expects no feasible plan.
- **no_budget**: no stated budget; ceiling computed via affordability (0.4 × takeHomePay − obligations).

## Feasible plans (top option per shopper)

| Shopper | Bucket | Item Price | Budget/Ceiling | Tenor | EMI | Total Interest | Lender |
|---|---|---|---|---|---|---|---|
| shopper_024 | tight | ₹49,831 | ₹2,857 (statedBudget) | 20mo | ₹2,831.42 | ₹6,797.34 | lenderA |
| shopper_015 | comfortable | ₹77,792 | ₹9,237 (statedBudget) | 9mo | ₹9,116.99 | ₹4,260.93 | lenderB |
| shopper_028 | tight | ₹39,626 | ₹2,348 (statedBudget) | 20mo | ₹2,251.56 | ₹5,405.3 | lenderA |
| shopper_008 | comfortable | ₹66,102 | ₹8,593 (statedBudget) | 9mo | ₹7,746.96 | ₹3,620.63 | lenderB |
| shopper_047 | no_budget | ₹61,119 | ₹21,050 (affordabilityCeiling) | 3mo | ₹20,884.43 | ₹1,534.3 | lenderA |
| shopper_017 | tight | ₹16,847 | ₹957 (statedBudget) | 21mo | ₹917.11 | ₹2,412.27 | lenderA |
| shopper_013 | comfortable | ₹27,257 | ₹2,546 (statedBudget) | 12mo | ₹2,434.01 | ₹1,951.11 | lenderB |
| shopper_025 | tight | ₹41,678 | ₹2,265 (statedBudget) | 22mo | ₹2,178.61 | ₹6,251.38 | lenderA |
| shopper_018 | tight | ₹52,708 | ₹2,889 (statedBudget) | 21mo | ₹2,869.29 | ₹7,547.11 | lenderA |
| shopper_005 | comfortable | ₹62,037 | ₹7,353 (statedBudget) | 9mo | ₹7,270.55 | ₹3,397.97 | lenderB |
| shopper_010 | comfortable | ₹43,091 | ₹5,159 (statedBudget) | 9mo | ₹5,050.14 | ₹2,360.24 | lenderB |
| shopper_023 | tight | ₹39,364 | ₹1,985 (statedBudget) | 23mo | ₹1,979.88 | ₹6,173.18 | lenderA |
| shopper_026 | tight | ₹52,260 | ₹2,767 (statedBudget) | 22mo | ₹2,731.75 | ₹7,838.6 | lenderA |
| shopper_003 | comfortable | ₹37,067 | ₹4,752 (statedBudget) | 9mo | ₹4,344.14 | ₹2,030.28 | lenderB |
| shopper_012 | comfortable | ₹25,173 | ₹2,189 (statedBudget) | 13mo | ₹2,085.92 | ₹1,943.95 | lenderB |
| shopper_002 | comfortable | ₹55,899 | ₹4,476 (statedBudget) | 14mo | ₹4,323.73 | ₹4,633.16 | lenderB |
| shopper_052 | no_budget | ₹25,294 | ₹20,948 (affordabilityCeiling) | 3mo | ₹8,642.99 | ₹634.97 | lenderA |
| shopper_014 | comfortable | ₹47,839 | ₹6,128 (statedBudget) | 9mo | ₹5,606.59 | ₹2,620.3 | lenderB |
| shopper_048 | no_budget | ₹30,654 | ₹11,059 (affordabilityCeiling) | 3mo | ₹10,474.51 | ₹769.52 | lenderA |
| shopper_009 | comfortable | ₹37,473 | ₹3,111 (statedBudget) | 13mo | ₹3,105.14 | ₹2,893.8 | lenderB |
| shopper_049 | no_budget | ₹24,836 | ₹9,690 (affordabilityCeiling) | 3mo | ₹8,486.49 | ₹623.47 | lenderA |
| shopper_004 | comfortable | ₹34,340 | ₹4,573 (statedBudget) | 8mo | ₹4,503.73 | ₹1,689.84 | lenderB |
| shopper_029 | tight | ₹18,887 | ₹985 (statedBudget) | 23mo | ₹949.95 | ₹2,961.92 | lenderA |
| shopper_007 | comfortable | ₹15,498 | ₹1,955 (statedBudget) | 9mo | ₹1,816.32 | ₹848.88 | lenderB |
| shopper_050 | no_budget | ₹41,134 | ₹11,637 (affordabilityCeiling) | 4mo | ₹10,606.86 | ₹1,293.42 | lenderA |
| shopper_022 | tight | ₹32,677 | ₹1,647 (statedBudget) | 23mo | ₹1,643.54 | ₹5,124.51 | lenderA |
| shopper_001 | comfortable | ₹38,991 | ₹3,623 (statedBudget) | 12mo | ₹3,481.84 | ₹2,791.06 | lenderB |
| shopper_011 | comfortable | ₹73,786 | ₹8,249 (statedBudget) | 10mo | ₹7,823.95 | ₹4,453.5 | lenderB |
| shopper_006 | comfortable | ₹34,969 | ₹2,995 (statedBudget) | 13mo | ₹2,897.65 | ₹2,700.43 | lenderB |
| shopper_027 | tight | ₹31,863 | ₹1,814 (statedBudget) | 20mo | ₹1,810.47 | ₹4,346.36 | lenderA |
| shopper_016 | tight | ₹54,201 | ₹3,271 (statedBudget) | 19mo | ₹3,222.55 | ₹7,027.38 | lenderA |
| shopper_046 | no_budget | ₹53,143 | ₹24,960 (affordabilityCeiling) | 3mo | ₹18,159.03 | ₹1,334.08 | lenderA |
| shopper_020 | tight | ₹54,247 | ₹2,946 (statedBudget) | 22mo | ₹2,835.62 | ₹8,136.63 | lenderA |
| shopper_021 | tight | ₹52,137 | ₹2,757 (statedBudget) | 22mo | ₹2,725.32 | ₹7,820.15 | lenderA |
| shopper_030 | tight | ₹21,890 | ₹1,266 (statedBudget) | 20mo | ₹1,243.8 | ₹2,985.97 | lenderA |
| shopper_053 | no_budget | ₹20,042 | ₹19,735 (affordabilityCeiling) | 3mo | ₹6,848.37 | ₹503.12 | lenderA |
| shopper_051 | no_budget | ₹27,999 | ₹19,836 (affordabilityCeiling) | 3mo | ₹9,567.29 | ₹702.87 | lenderA |
| shopper_019 | tight | ₹21,849 | ₹1,189 (statedBudget) | 22mo | ₹1,142.1 | ₹3,277.18 | lenderA |

## Declined — audit trail (no feasible plan)

> This is the most important section. It proves the system is honest, not just optimistic.

| Shopper | Bucket | Item Price | Budget/Ceiling | Reason |
|---|---|---|---|---|
| shopper_044 | infeasible | ₹87,198 | ₹3,048 (statedBudget) | Requested budget (₹3048) is below minimum EMI on all lenders for item price ₹87198. |
| shopper_045 | infeasible | ₹31,895 | ₹1,273 (statedBudget) | Requested budget (₹1273) is below minimum EMI on all lenders for item price ₹31895. |
| shopper_040 | infeasible | ₹39,574 | ₹799 (statedBudget) | Requested budget (₹799) is below minimum EMI on all lenders for item price ₹39574. |
| shopper_038 | infeasible | ₹55,386 | ₹1,604 (statedBudget) | Requested budget (₹1604) is below minimum EMI on all lenders for item price ₹55386. |
| shopper_036 | infeasible | ₹47,031 | ₹1,241 (statedBudget) | Requested budget (₹1241) is below minimum EMI on all lenders for item price ₹47031. |
| shopper_039 | infeasible | ₹89,489 | ₹2,326 (statedBudget) | Requested budget (₹2326) is below minimum EMI on all lenders for item price ₹89489. |
| shopper_034 | infeasible | ₹32,628 | ₹1,254 (statedBudget) | Requested budget (₹1254) is below minimum EMI on all lenders for item price ₹32628. |
| shopper_035 | infeasible | ₹79,287 | ₹1,876 (statedBudget) | Requested budget (₹1876) is below minimum EMI on all lenders for item price ₹79287. |
| shopper_043 | infeasible | ₹40,494 | ₹1,074 (statedBudget) | Requested budget (₹1074) is below minimum EMI on all lenders for item price ₹40494. |
| shopper_058 | no_budget | ₹21,528 | ₹0 (affordabilityCeiling) | Computed affordability ceiling is 0 or negative — no room for additional EMI (existing obligations consume the 40% threshold). |
| shopper_042 | infeasible | ₹54,331 | ₹1,259 (statedBudget) | Requested budget (₹1259) is below minimum EMI on all lenders for item price ₹54331. |
| shopper_059 | no_budget | ₹46,955 | ₹0 (affordabilityCeiling) | Computed affordability ceiling is 0 or negative — no room for additional EMI (existing obligations consume the 40% threshold). |
| shopper_037 | infeasible | ₹78,708 | ₹3,123 (statedBudget) | Requested budget (₹3123) is below minimum EMI on all lenders for item price ₹78708. |
| shopper_054 | no_budget | ₹53,583 | ₹0 (affordabilityCeiling) | Computed affordability ceiling is 0 or negative — no room for additional EMI (existing obligations consume the 40% threshold). |
| shopper_032 | infeasible | ₹56,541 | ₹1,529 (statedBudget) | Requested budget (₹1529) is below minimum EMI on all lenders for item price ₹56541. |
| shopper_057 | no_budget | ₹15,674 | ₹0 (affordabilityCeiling) | Computed affordability ceiling is 0 or negative — no room for additional EMI (existing obligations consume the 40% threshold). |
| shopper_055 | no_budget | ₹39,937 | ₹0 (affordabilityCeiling) | Computed affordability ceiling is 0 or negative — no room for additional EMI (existing obligations consume the 40% threshold). |
| shopper_031 | infeasible | ₹67,040 | ₹1,325 (statedBudget) | Requested budget (₹1325) is below minimum EMI on all lenders for item price ₹67040. |
| shopper_056 | no_budget | ₹53,231 | ₹0 (affordabilityCeiling) | Computed affordability ceiling is 0 or negative — no room for additional EMI (existing obligations consume the 40% threshold). |
| shopper_033 | infeasible | ₹39,503 | ₹1,524 (statedBudget) | Requested budget (₹1524) is below minimum EMI on all lenders for item price ₹39503. |
| shopper_041 | infeasible | ₹68,296 | ₹2,571 (statedBudget) | Requested budget (₹2571) is below minimum EMI on all lenders for item price ₹68296. |
| shopper_060 | no_budget | ₹33,942 | ₹0 (affordabilityCeiling) | Computed affordability ceiling is 0 or negative — no room for additional EMI (existing obligations consume the 40% threshold). |

## Notes

- All EMI figures computed deterministically by `emiSolver.js`.
- Affordability ceiling uses `0.4 × takeHomePay − existingObligations` (configurable heuristic).
- Lender rates are synthetic; no real bank/NBFC calls.
- Every recommendation (feasible or declined) would be appended to `server/data/audit.log` when served via the API.
