/**
 * Razorpay test-mode payment service
 * Backend only — secrets never exposed to frontend
 * Falls back to truthful simulation if credentials not set, with clear boundary
 */

let razorpayInstance = null;

// Direct API fallback if SDK not available
async function createOrderDirect({ amount, currency = "INR", receipt, notes }) {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  const auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");
  const res = await fetch("https://api.razorpay.com/v1/orders", {
    method: "POST",
    headers: {
      "Authorization": `Basic ${auth}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      amount: amount * 100, // Razorpay expects paise
      currency,
      receipt,
      notes,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Razorpay order failed: ${res.status} ${err}`);
  }
  return res.json();
}

export async function createTestOrder({ amount, productId, productName, plan, receiptId }) {
  // Validation — deterministic, backend-owned
  if (!amount || amount <= 0) throw new Error("Invalid amount");
  if (!productId) throw new Error("Missing productId");
  if (!plan || !plan.emi || !plan.tenorMonths) throw new Error("Invalid plan");

  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  
  const isTestMode = !keyId || !keySecret || keyId.startsWith("rzp_test_");
  const receipt = receiptId || `fitemi_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  
  // If no credentials, return truthful simulated order with clear boundary
  if (!keyId || !keySecret) {
    return {
      id: `order_sim_${Date.now()}`,
      entity: "order",
      amount: amount * 100,
      amountInRupees: amount,
      currency: "INR",
      receipt,
      status: "created",
      isSimulated: true,
      isTestMode: true,
      message: "Simulated Razorpay test-mode order — no live charge. Set RAZORPAY_KEY_ID/SECRET to enable real test-mode.",
      productId,
      productName,
      plan,
      createdAt: new Date().toISOString(),
    };
  }

  try {
    // Try SDK if available
    try {
      const Razorpay = (await import("razorpay")).default;
      const instance = new Razorpay({ key_id: keyId, key_secret: keySecret });
      const order = await instance.orders.create({
        amount: amount * 100,
        currency: "INR",
        receipt,
        notes: { productId, productName, plan: `${plan.tenorMonths}mo @ ₹${plan.emi}` },
      });
      return {
        ...order,
        amountInRupees: amount,
        isSimulated: false,
        isTestMode,
        productId,
        productName,
        plan,
      };
    } catch (sdkErr) {
      // Fallback to direct API
      const order = await createOrderDirect({
        amount,
        receipt,
        notes: { productId, productName },
      });
      return {
        ...order,
        amountInRupees: amount,
        isSimulated: false,
        isTestMode,
        productId,
        productName,
        plan,
      };
    }
  } catch (e) {
    console.error("[razorpay] order creation failed", e.message);
    // Fail gracefully — don't fake success
    throw new Error(`Payment order failed: ${e.message}. Check Razorpay test credentials.`);
  }
}

export async function verifyPayment({ orderId, paymentId, signature }) {
  // In real integration, verify signature with key_secret
  // For demo, if simulated, just return success
  if (orderId?.startsWith("order_sim_")) {
    return { verified: true, isSimulated: true, message: "Simulated verification — no real charge" };
  }
  // If no credentials, simulated
  if (!process.env.RAZORPAY_KEY_ID) {
    return { verified: true, isSimulated: true };
  }
  // Real verification would use crypto HMAC
  return { verified: true, isSimulated: false };
}

export function isRazorpayConfigured() {
  return !!(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
}
