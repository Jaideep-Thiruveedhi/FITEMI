// Merchant orders and revenue intelligence — in-memory for demo (would be DB in prod)
import { getProductById, getMerchantById } from "./catalog.js";

const orders = []; // { id, productId, productName, merchantId, merchantName, amount, plan, status, buyer, createdAt, razorpayOrderId }

export function createOrder({ productId, plan, buyer, amount, razorpayOrderId, status = "awaiting_approval" }) {
  const product = getProductById(productId);
  if (!product) throw new Error("Product not found");
  const merchant = getMerchantById(product.merchantId);
  const order = {
    id: `ord_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    productId,
    productName: product.name,
    merchantId: product.merchantId,
    merchantName: merchant.name,
    amount,
    plan: {
      tenorMonths: plan.tenorMonths,
      emi: plan.emi,
      totalInterest: plan.totalInterest,
      totalPaid: plan.totalPaid,
      lenderId: plan.lenderId,
    },
    buyer: {
      // Sanitized — no secrets
      hasMonthlyBudget: !!buyer.targetMonthlyPayment,
      affordabilityCeiling: buyer.affordabilityCeiling || null,
    },
    status, // awaiting_approval | paid | failed | cancelled
    razorpayOrderId: razorpayOrderId || null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  orders.push(order);
  return order;
}

export function updateOrderStatus(orderId, status, extra = {}) {
  const order = orders.find(o => o.id === orderId);
  if (!order) throw new Error("Order not found");
  order.status = status;
  order.updatedAt = new Date().toISOString();
  Object.assign(order, extra);
  return order;
}

export function getOrders({ merchantId, limit = 20 } = {}) {
  let filtered = [...orders].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  if (merchantId) filtered = filtered.filter(o => o.merchantId === merchantId);
  return filtered.slice(0, limit);
}

export function getOrderById(id) {
  return orders.find(o => o.id === id);
}

// Revenue intelligence — synthetic insights clearly labeled
export function getRevenueInsights() {
  const total = orders.length;
  const paid = orders.filter(o => o.status === "paid").length;
  const awaiting = orders.filter(o => o.status === "awaiting_approval").length;
  const failed = orders.filter(o => o.status === "failed" || o.status === "cancelled").length;

  // Synthetic insights from batch evaluation — clearly labeled as demo
  return {
    real: {
      totalOrders: total,
      paidOrders: paid,
      awaitingApproval: awaiting,
      failedOrCancelled: failed,
      conversionRate: total ? ((paid / total) * 100).toFixed(1) + "%" : "0%",
    },
    syntheticInsights: [
      {
        insight: "3 shoppers abandoned because the cheapest monthly plan (₹1,163/mo) exceeded their budget.",
        source: "synthetic • from 60-shopper batch evaluation (infeasible bucket)",
        action: "Consider lower-priced variants or longer-tenor lender",
      },
      {
        insight: "Offering the 12-month plan increases affordable matches from 42% → 68% for budgets ₹2,500–₹5,000.",
        source: "synthetic • batch eval across lenders A/B/C",
        action: "Enable lenderA 3–24mo for broader tenor coverage",
      },
      {
        insight: "Customers with budgets above ₹4,000/mo have 27% higher plan-fit rate and choose faster payoff (lower interest).",
        source: "synthetic • comfortable vs tight bucket comparison",
        action: "Highlight total-interest savings for higher-budget buyers",
      },
    ],
    disclaimer: "Synthetic insights are from demo synthetic shoppers, not real business performance.",
  };
}
