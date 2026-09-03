import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";
import express from "express";
import agentRouter from "../src/routes/agent.js";
import { verifyAgentSignature, buildCanonicalString, computeHmacHex } from "../src/lib/agentAuth.js";

const TEST_SECRET = "test-demo-secret-12345";
const AGENT_ID = "test-agent";

function makeReq({ method = "POST", path = "/api/agent/parse", body = {}, agentId = AGENT_ID, timestamp = Date.now().toString(), signature = null, secret = TEST_SECRET } = {}) {
  const headers = {
    "x-agent-id": agentId,
    "x-agent-timestamp": timestamp,
  };
  if (signature) headers["x-agent-signature"] = signature;
  const req = {
    method,
    originalUrl: path,
    url: path,
    path,
    headers,
    body,
  };
  // If signature not provided but secret provided, compute it
  if (!signature && secret) {
    const canonical = `${method}\n${path}\n${agentId}\n${body ? JSON.stringify(body) : ""}\n${timestamp}`;
    const hmac = crypto.createHmac("sha256", secret).update(canonical, "utf8").digest("hex");
    headers["x-agent-signature"] = hmac;
    req.headers["x-agent-signature"] = hmac;
  }
  return req;
}

describe("agentAuth — HMAC request signing", () => {
  const originalSecret = process.env.AGENT_SHARED_SECRET;

  before(() => {
    process.env.AGENT_SHARED_SECRET = TEST_SECRET;
  });

  after(() => {
    if (originalSecret === undefined) delete process.env.AGENT_SHARED_SECRET;
    else process.env.AGENT_SHARED_SECRET = originalSecret;
  });

  it("valid signature passes", () => {
    const body = { text: "hello" };
    const timestamp = Date.now().toString();
    const req = makeReq({ body, timestamp, secret: TEST_SECRET });
    const result = verifyAgentSignature(req);
    assert.equal(result.valid, true, `should be valid, got error: ${result.error}`);
  });

  it("tampered body fails", () => {
    const body = { text: "hello" };
    const timestamp = Date.now().toString();
    const req = makeReq({ body, timestamp, secret: TEST_SECRET });
    // Tamper body after signing
    req.body = { text: "tampered" };
    const result = verifyAgentSignature(req);
    assert.equal(result.valid, false);
    assert.match(result.error, /Invalid signature/i);
  });

  it("wrong secret fails", () => {
    const body = { text: "hello" };
    const timestamp = Date.now().toString();
    const req = makeReq({ body, timestamp, secret: "wrong-secret" });
    // Now verify with correct secret (TEST_SECRET) — should fail because signature was computed with wrong secret
    const result = verifyAgentSignature(req);
    assert.equal(result.valid, false);
    assert.match(result.error, /Invalid signature/i);
  });

  it("expired timestamp fails (more than 5 minutes old)", () => {
    const body = { text: "hello" };
    const expired = (Date.now() - 6 * 60 * 1000).toString(); // 6 minutes ago
    const req = makeReq({ body, timestamp: expired, secret: TEST_SECRET });
    const result = verifyAgentSignature(req);
    assert.equal(result.valid, false);
    assert.match(result.error, /too old/i);
  });

  it("future timestamp fails", () => {
    const body = { text: "hello" };
    const future = (Date.now() + 60 * 1000).toString(); // 1 minute in future (beyond 30s skew)
    const req = makeReq({ body, timestamp: future, secret: TEST_SECRET });
    const result = verifyAgentSignature(req);
    assert.equal(result.valid, false);
    assert.match(result.error, /in the future/i);
  });

  it("replayed exact request outside time window fails", async () => {
    const body = { text: "hello replay" };
    const timestamp = Date.now().toString();
    const req1 = makeReq({ body, timestamp, secret: TEST_SECRET });
    const result1 = verifyAgentSignature(req1);
    assert.equal(result1.valid, true, "first request should be valid");

    // Simulate replay 6 minutes later with same timestamp and signature (no new timestamp)
    // The same req object replayed would have same timestamp, which will now be expired
    // We simulate by waiting? Instead we create a new req with same old timestamp
    const replayReq = makeReq({ body, timestamp, secret: TEST_SECRET });
    // Manually set timestamp to be old (simulate that 6 minutes have passed by using an old timestamp)
    // Actually we need to test that the same exact request (same timestamp/signature) when verified 6 minutes later would fail
    // We can do this by creating a req with timestamp 6 minutes old but same signature as if it were computed at that old time
    const oldTimestamp = (Date.now() - 6 * 60 * 1000).toString();
    const canonicalOld = `POST\n/api/agent/parse\n${AGENT_ID}\n${JSON.stringify(body)}\n${oldTimestamp}`;
    const hmacOld = crypto.createHmac("sha256", TEST_SECRET).update(canonicalOld, "utf8").digest("hex");
    const replayOldReq = {
      method: "POST",
      originalUrl: "/api/agent/parse",
      url: "/api/agent/parse",
      path: "/api/agent/parse",
      headers: {
        "x-agent-id": AGENT_ID,
        "x-agent-timestamp": oldTimestamp,
        "x-agent-signature": hmacOld,
      },
      body,
    };
    const resultReplay = verifyAgentSignature(replayOldReq);
    assert.equal(resultReplay.valid, false);
    assert.match(resultReplay.error, /too old/i);
  });

  it("missing X-Agent-Id fails even with valid signature", () => {
    const body = { text: "hello" };
    const timestamp = Date.now().toString();
    const req = makeReq({ body, timestamp, secret: TEST_SECRET });
    delete req.headers["x-agent-id"];
    const result = verifyAgentSignature(req);
    assert.equal(result.valid, false);
    assert.match(result.error, /X-Agent-Id/i);
  });

  it("uses timingSafeEqual (constant-time) — tampered signature with same length fails", () => {
    const body = { text: "hello" };
    const timestamp = Date.now().toString();
    const req = makeReq({ body, timestamp, secret: TEST_SECRET });
    // Flip last char of hex signature
    const origSig = req.headers["x-agent-signature"];
    const tampered = origSig.slice(0, -1) + (origSig.slice(-1) === "a" ? "b" : "a");
    req.headers["x-agent-signature"] = tampered;
    const result = verifyAgentSignature(req);
    assert.equal(result.valid, false);
  });
});

describe("agentAuth — HTTP integration with X-Agent-Id middleware", () => {
  let app, server, baseUrl;
  const originalSecret = process.env.AGENT_SHARED_SECRET;

  before(async () => {
    process.env.AGENT_SHARED_SECRET = TEST_SECRET;
    // Need to re-import router after setting env? The router reads env at request time via isSignatureVerificationEnabled(), so no need to re-import
    const testApp = express();
    testApp.use(express.json());
    // Re-create router fresh to pick up new env — import fresh
    // We already imported agentRouter which will read env at request time, so we can reuse
    testApp.use("/api/agent", agentRouter);
    await new Promise((resolve) => {
      server = testApp.listen(0, () => {
        const addr = server.address();
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  });

  after(async () => {
    if (originalSecret === undefined) delete process.env.AGENT_SHARED_SECRET;
    else process.env.AGENT_SHARED_SECRET = originalSecret;
    if (server) await new Promise(r => server.close(r));
  });

  it("HTTP: valid signed request passes", async () => {
    const body = { text: "hello http" };
    const timestamp = Date.now().toString();
    const canonical = `POST\n/api/agent/parse\n${AGENT_ID}\n${JSON.stringify(body)}\n${timestamp}`;
    const sig = crypto.createHmac("sha256", TEST_SECRET).update(canonical, "utf8").digest("hex");
    const res = await fetch(`${baseUrl}/api/agent/parse`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Agent-Id": AGENT_ID,
        "X-Agent-Timestamp": timestamp,
        "X-Agent-Signature": sig,
      },
      body: JSON.stringify(body),
    });
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.ok(json.intent);
  });

  it("HTTP: tampered body with same signature is rejected 401", async () => {
    const body = { text: "hello http" };
    const timestamp = Date.now().toString();
    const canonical = `POST\n/api/agent/parse\n${AGENT_ID}\n${JSON.stringify(body)}\n${timestamp}`;
    const sig = crypto.createHmac("sha256", TEST_SECRET).update(canonical, "utf8").digest("hex");
    // Send tampered body but same signature/timestamp
    const tamperedBody = { text: "tampered http" };
    const res = await fetch(`${baseUrl}/api/agent/parse`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Agent-Id": AGENT_ID,
        "X-Agent-Timestamp": timestamp,
        "X-Agent-Signature": sig,
      },
      body: JSON.stringify(tamperedBody),
    });
    assert.equal(res.status, 401);
    const json = await res.json();
    assert.match(json.error, /Invalid signature/i);
  });
});
