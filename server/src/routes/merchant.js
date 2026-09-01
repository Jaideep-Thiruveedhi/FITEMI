import express from "express";
import { getOrders, getOrderById, getRevenueInsights } from "../lib/merchant.js";
import { merchants } from "../lib/catalog.js";

const router = express.Router();

// GET /api/merchant/orders — list orders
router.get("/orders", (req, res) => {
  const { merchantId, limit } = req.query;
  const orders = getOrders({ merchantId, limit: limit ? parseInt(limit, 10) : 20 });
  res.json({ count: orders.length, orders });
});

// GET /api/merchant/orders/:id
router.get("/orders/:id", (req, res) => {
  const order = getOrderById(req.params.id);
  if (!order) return res.status(404).json({ error: "Order not found" });
  res.json({ order });
});

// GET /api/merchant/insights — revenue intelligence
router.get("/insights", (req, res) => {
  const insights = getRevenueInsights();
  res.json(insights);
});

// GET /api/merchant/merchants — list merchants
router.get("/merchants", (req, res) => {
  res.json({ merchants });
});

export default router;
