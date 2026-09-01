import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { emiForTenor } from "../src/lib/emiSolver.js";
import { lenders } from "../src/lib/lenders.js";
import { computeAffordabilityCeiling } from "../src/lib/affordability.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const OUT_PATH = path.join(__dirname, "../data/shoppers.json");

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Estimate min EMI across lenders for a price (longest tenor cheapest EMI)
function minEmiForPrice(price) {
  let min = Infinity;
  for (const l of lenders) {
    const emi = emiForTenor(price, l.monthlyRate, l.maxTenor);
    if (emi < min) min = emi;
  }
  return min;
}

// Generate 60 shoppers across 4 buckets (~15 each)
function generateShoppers() {
  const shoppers = [];
  let id = 1;

  // Bucket A: budget comfortably sufficient (15)
  for (let i = 0; i < 15; i++) {
    const itemPrice = randInt(15000, 80000);
    const minEmi = minEmiForPrice(itemPrice);
    // Budget is 1.5x to 3x min EMI — clearly feasible and short tenor
    const statedBudget = Math.round(minEmi * (1.5 + Math.random() * 1.5));
    const takeHomePay = randInt(35000, 90000);
    const existingObligations = randInt(5000, 20000);
    const otherExpenses = randInt(8000, 25000);
    shoppers.push({ id: `shopper_${String(id++).padStart(3, "0")}`, bucket: "comfortable", itemPrice, statedBudget, takeHomePay, existingObligations, otherExpenses });
  }

  // Bucket B: budget tight but feasible (15)
  for (let i = 0; i < 15; i++) {
    const itemPrice = randInt(15000, 60000);
    const minEmi = minEmiForPrice(itemPrice);
    // Budget is 1.0x to 1.3x min EMI — barely fits, needs longest tenor
    const statedBudget = Math.round(minEmi * (1.02 + Math.random() * 0.28));
    const takeHomePay = randInt(25000, 60000);
    const existingObligations = randInt(5000, 18000);
    const otherExpenses = randInt(6000, 20000);
    shoppers.push({ id: `shopper_${String(id++).padStart(3, "0")}`, bucket: "tight", itemPrice, statedBudget, takeHomePay, existingObligations, otherExpenses });
  }

  // Bucket C: no feasible plan at any lender (15)
  for (let i = 0; i < 15; i++) {
    const itemPrice = randInt(30000, 100000);
    const minEmi = minEmiForPrice(itemPrice);
    // Budget below min EMI — impossible
    const statedBudget = Math.round(minEmi * (0.4 + Math.random() * 0.5));
    // Ensure at least 100
    const budget = Math.max(500, statedBudget);
    const takeHomePay = randInt(15000, 40000);
    const existingObligations = randInt(8000, 22000);
    const otherExpenses = randInt(5000, 15000);
    shoppers.push({ id: `shopper_${String(id++).padStart(3, "0")}`, bucket: "infeasible", itemPrice, statedBudget: budget, takeHomePay, existingObligations, otherExpenses });
  }

  // Bucket D: no stated budget — needs affordability path (15)
  for (let i = 0; i < 15; i++) {
    const itemPrice = randInt(15000, 70000);
    // Mix of feasible and infeasible via affordability ceiling
    // Half with decent ceiling, half with low ceiling
    let takeHomePay, existingObligations;
    if (i < 8) {
      takeHomePay = randInt(40000, 80000);
      existingObligations = randInt(4000, 12000);
    } else {
      takeHomePay = randInt(18000, 30000);
      existingObligations = randInt(10000, 18000);
    }
    const otherExpenses = randInt(6000, 20000);
    shoppers.push({ id: `shopper_${String(id++).padStart(3, "0")}`, bucket: "no_budget", itemPrice, statedBudget: null, takeHomePay, existingObligations, otherExpenses });
  }

  // Shuffle
  for (let i = shoppers.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shoppers[i], shoppers[j]] = [shoppers[j], shoppers[i]];
  }

  // Re-assign IDs after shuffle? Keep original IDs

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify(shoppers, null, 2), "utf-8");
  console.log(`Generated ${shoppers.length} shoppers -> ${OUT_PATH}`);
  const counts = {};
  for (const s of shoppers) counts[s.bucket] = (counts[s.bucket] || 0) + 1;
  console.log("Bucket counts:", counts);
}

generateShoppers();
