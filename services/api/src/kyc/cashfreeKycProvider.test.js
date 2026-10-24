import test from "node:test";
import assert from "node:assert/strict";
import { CashfreeKycProvider, makeCashfreeKycProvider } from "./cashfreeKycProvider.js";

const provider = () => new CashfreeKycProvider({
  clientId: "test-client",
  clientSecret: "test-secret",
  baseUrl: "https://sandbox.cashfree.com",
});

test("Cashfree adapter uses documented PAN and GSTIN endpoints and maps results", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    return {
      ok: true,
      json: async () => calls.length === 1
        ? { valid: true, registered_name: "XORPAY", name_match_result: "DIRECT_MATCH" }
        : { valid: "true", legal_name_of_business: "XORPAY", gst_in_status: "Active" },
    };
  };
  const client = provider();
  assert.deepEqual(await client.verifyPan("ABCDE1234F", "XORPAY"), {
    verified: true, registeredName: "XORPAY", nameMatch: true,
  });
  assert.deepEqual(await client.verifyGstin("27ABCDE1234F1Z5"), {
    verified: true, legalName: "XORPAY", status: "Active",
  });
  assert.equal(calls[0].url, "https://sandbox.cashfree.com/verification/pan");
  assert.deepEqual(JSON.parse(calls[0].options.body), { pan: "ABCDE1234F", name: "XORPAY" });
  assert.equal(calls[0].options.headers["x-client-id"], "test-client");
  assert.equal(calls[1].url, "https://sandbox.cashfree.com/verification/gstin");
});

test("Aadhaar flow creates a Cashfree DigiLocker link and only accepts consented document", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    return {
      ok: true,
      json: async () => calls.length === 1
        ? { url: "https://verification-test.cashfree.com/dgl/test", status: "PENDING" }
        : calls.length === 2
          ? { status: "AUTHENTICATED", document_consent: ["AADHAAR"] }
          : { status: "SUCCESS", uid: "XXXXXXXX1234" },
    };
  };
  const client = provider();
  const start = await client.initAadhaar("xorpay://kyc/aadhaar");
  assert.match(start.requestId, /^xorpay_[a-f0-9]{32}$/);
  assert.equal(calls[0].url, "https://sandbox.cashfree.com/verification/digilocker");
  assert.deepEqual(JSON.parse(calls[0].options.body).document_requested, ["AADHAAR"]);
  assert.deepEqual(await client.completeAadhaar(start.requestId), {
    verified: true, maskedUid: "XXXXXXXX1234",
  });
  assert.match(calls[1].url, /verification_id=xorpay_/);
  assert.match(calls[2].url, /document\/AADHAAR\?verification_id=/);
});

test("selfie liveness posts the captured image to Cashfree and maps its result", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  let captured;
  globalThis.fetch = async (url, options) => {
    captured = { url: String(url), options };
    return { ok: true, json: async () => ({ status: "SUCCESS", liveness: true, liveness_score: 0.98 }) };
  };
  const client = provider();
  const { sessionId } = await client.createSelfieSession();
  const image = Buffer.from("image-bytes");
  assert.deepEqual(await client.completeSelfie(sessionId, image, "image/jpeg"), {
    verified: true, matchScore: 98,
  });
  assert.equal(captured.url, "https://sandbox.cashfree.com/verification/face-liveness");
  assert.equal(captured.options.headers["x-api-version"], "2024-12-01");
  assert.ok(captured.options.body instanceof FormData);
  assert.equal(captured.options.body.get("verification_id"), sessionId);
});

test("production factory requires activated Cashfree Secure ID credentials", () => {
  assert.throws(
    () => makeCashfreeKycProvider({ CASHFREE_SECURE_ID_ENV: "PRODUCTION" }),
    /credentials are required/,
  );
  assert.throws(
    () => new CashfreeKycProvider({
      clientId: "x", clientSecret: "y", baseUrl: "https://attacker.example",
    }),
    /not allowed/,
  );
});
