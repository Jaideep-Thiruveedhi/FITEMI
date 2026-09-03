import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import checkoutRouter from "../src/routes/checkout.js";
import agentRouter from "../src/routes/agent.js";
import { findFeasiblePlans } from "../src/lib/emiSolver.js";
import { lenders } from "../src/lib/lenders.js";
import { getProductById } from "../src/lib/catalog.js";
import { _clearStore } from "../src/lib/idempotency.js";

describe("idempotency — POST /api/checkout/create-order and POST /api/agent/draft-order", () => {
  let app;
  let server;
  let baseUrl;

  before(async () => {
    _clearStore();
    app = express();
    app.use(express.json());
    app.use("/api/checkout", checkoutRouter);
    app.use("/api/agent", agentRouter);
    await new Promise((resolve) => {
      server = app.listen(0, () => {
        const addr = server.address();
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  });

  after(async () => {
    _clearStore();
    if (server) await new Promise((r) => server.close(r));
  });

  it("duplicate request with same Idempotency-Key returns same order ID (checkout)", async () => {
    _clearStore();
    const product = getProductById("p2"); // ThinkPad X1 Carbon 65000
    assert.ok(product, "product p2 should exist");
    const target = 5000;
    const result = findFeasiblePlans(product.price, target, lenders);
    assert.ok(result.feasible, "should have feasible plan for test");
    const plan = result.options[0];
    assert.ok(plan, "plan should exist");

    const payload = {
      productId: product.id,
      plan: {
        tenorMonths: plan.tenorMonths,
        emi: plan.emi,
        totalInterest: plan.totalInterest,
        totalPaid: plan.totalPaid,
        lenderId: plan.lenderId,
      },
      amount: product.price,
      buyer: { targetMonthlyPayment: target },
      userApproval: true,
    };

    const key = `test-idemp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    const res1 = await fetch(`${baseUrl}/api/checkout/create-order`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": key,
      },
      body: JSON.stringify(payload),
    });
    const body1 = await res1.json();
    assert.equal(res1.status, 200, "first request should succeed");
    assert.ok(body1.orderId, "first response should have orderId");
    assert.ok(body1.razorpayOrder, "should have razorpayOrder");
    const firstOrderId = body1.orderId;
    const firstRazorpayId = body1.razorpayOrder.id;

    const res2 = await fetch(`${baseUrl}/api/checkout/create-order`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": key,
      },
      body: JSON.stringify(payload),
    });
    const body2 = await res2.json();
    assert.equal(res2.status, 200, "second request should succeed");
    assert.equal(body2.orderId, firstOrderId, "duplicate request should return same orderId");
    assert.equal(body2.razorpayOrder.id, firstRazorpayId, "duplicate should return same razorpayOrder id");
    // Ensure not creating duplicate merchant order — the in-memory orders should still have only one with that id
    // (indirectly verified by same orderId; a third request with different key should create new id)
    const res3 = await fetch(`${baseUrl}/api/checkout/create-order`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": `${key}-different`,
      },
      body: JSON.stringify(payload),
    });
    const body3 = await res3.json();
    assert.equal(res3.status, 200);
    assert.notEqual(body3.orderId, firstOrderId, "different Idempotency-Key should create new order");
  });
});
