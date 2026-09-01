import express from "express";
import { createTestOrder, verifyPayment, isRazorpayConfigured } from "../lib/razorpay.js";
import { validateCheckout } from "../lib/agent.js";
import { createOrder, updateOrderStatus, getOrderById } from "../lib/merchant.js";

const router = express.Router();

// POST /api/checkout/create-order — bounded checkout, requires approval
router.post("/create-order", async (req, res) => {
  const { productId, plan, amount, buyer, userApproval } = req.body;
  if (!userApproval) return res.status(403).json({ error: "User approval required — bounded gate" });
  if (!productId || !plan || !amount) return res.status(400).json({ error: "productId, plan, amount required" });

  try {
    // Guardrail: validate checkout deterministically
    validateCheckout({ productId, plan, amount, userApproval });

    // Create merchant order first (awaiting_approval -> paid after Razorpay)
    const order = createOrder({
      productId,
      plan,
      buyer: buyer || {},
      amount,
      status: "awaiting_approval",
    });

    // Create Razorpay test order
    const razorpayOrder = await createTestOrder({
      amount,
      productId,
      productName: order.productName,
      plan,
      receiptId: order.id,
    });

    // Update order with Razorpay id and mark as paid (or awaiting if real Razorpay needs further confirmation)
    // For demo, if simulated, we can mark as paid after approval
    if (razorpayOrder.isSimulated) {
      updateOrderStatus(order.id, "paid", { razorpayOrderId: razorpayOrder.id, paidAt: new Date().toISOString() });
    } else {
      updateOrderStatus(order.id, "awaiting_payment", { razorpayOrderId: razorpayOrder.id });
    }

    res.json({
      success: true,
      orderId: order.id,
      merchantOrder: order,
      razorpayOrder,
      isTestMode: true,
      isSimulated: razorpayOrder.isSimulated || false,
      message: razorpayOrder.isSimulated
        ? "Test-mode simulated order — no real charge. Configure RAZORPAY_KEY_ID/SECRET for live test-mode."
        : "Razorpay test-mode order created. Use test card 4111 1111 1111 1111 to complete.",
    });
  } catch (e) {
    console.error("[checkout/create-order]", e);
    res.status(400).json({ error: e.message });
  }
});

// POST /api/checkout/verify — verify payment
router.post("/verify", async (req, res) => {
  const { orderId, razorpayOrderId, paymentId, signature } = req.body;
  try {
    const result = await verifyPayment({ orderId: razorpayOrderId, paymentId, signature });
    if (orderId) {
      const order = getOrderById(orderId);
      if (order && result.verified) {
        updateOrderStatus(orderId, "paid", { verifiedAt: new Date().toISOString() });
      }
    }
    res.json(result);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// POST /api/checkout/cancel
router.post("/cancel", (req, res) => {
  const { orderId } = req.body;
  if (!orderId) return res.status(400).json({ error: "orderId required" });
  try {
    const order = updateOrderStatus(orderId, "cancelled");
    res.json({ success: true, order });
  } catch (e) {
    res.status(404).json({ error: e.message });
  }
});

// GET /api/checkout/status/:orderId
router.get("/status/:orderId", (req, res) => {
  const order = getOrderById(req.params.orderId);
  if (!order) return res.status(404).json({ error: "Order not found" });
  res.json({ order, isTestMode: true, razorpayConfigured: isRazorpayConfigured() });
});

export default router;
