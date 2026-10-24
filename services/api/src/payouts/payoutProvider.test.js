import { test } from "node:test";
import assert from "node:assert/strict";

import { CashfreePayoutProvider, makePayoutProvider } from "./payoutProvider.js";

const verifiedBank = {
  type: "bank",
  verified: true,
  registeredName: "Ramesh Traders",
  accountNumber: "123456789012",
  ifsc: "ABCD0123456",
};

function jsonResponse(body, ok = true) {
  return { ok, json: async () => body };
}

test("Cashfree v2 initiates with documented auth, fields, and stable transfer ID", async () => {
  let request;
  const provider = new CashfreePayoutProvider({
    clientId: "client",
    clientSecret: "secret",
    baseUrl: "https://sandbox.cashfree.com/payout/",
    fetchImpl: async (url, options) => {
      request = { url: String(url), options };
      return jsonResponse({ status: "RECEIVED", cf_transfer_id: "cf-123" });
    },
  });

  const result = await provider.initiatePayout({ amountMinor: 12_345, reference: "ord_abc123", beneficiary: verifiedBank });
  assert.equal(result.status, "PENDING");
  assert.equal(result.providerReference, "cf-123");
  assert.equal(request.url, "https://sandbox.cashfree.com/payout/transfers");
  assert.equal(request.options.method, "POST");
  assert.equal(request.options.headers["x-client-id"], "client");
  assert.equal(request.options.headers["x-client-secret"], "secret");
  assert.equal(request.options.headers["x-api-version"], "2024-01-01");
  const payload = JSON.parse(request.options.body);
  assert.equal(payload.transfer_id, "ord_abc123");
  assert.equal(payload.transfer_amount, 123.45);
  assert.equal(payload.transfer_mode, "imps");
  assert.equal(payload.beneficiary_details.beneficiary_name, "Ramesh Traders");
  assert.deepEqual(payload.beneficiary_details.beneficiary_instrument_details, {
    bank_account_number: "123456789012",
    bank_ifsc: "ABCD0123456",
  });
});

test("payout status lookup uses transfer_id and maps final UTR", async () => {
  let requestUrl;
  const provider = new CashfreePayoutProvider({
    clientId: "client",
    clientSecret: "secret",
    baseUrl: "https://api.cashfree.com/payout",
    fetchImpl: async (url) => {
      requestUrl = new URL(String(url));
      return jsonResponse({ status: "SUCCESS", transfer_utr: "UTR123" });
    },
  });
  assert.deepEqual(await provider.getPayoutStatus("ord_abc123"), {
    status: "SUCCESS",
    utr: "UTR123",
    providerReference: null,
  });
  assert.equal(requestUrl.pathname, "/payout/transfers");
  assert.equal(requestUrl.searchParams.get("transfer_id"), "ord_abc123");
});

test("uncertain network outcome stays pending; it is never converted to failure", async () => {
  const provider = new CashfreePayoutProvider({
    clientId: "client",
    clientSecret: "secret",
    baseUrl: "https://sandbox.cashfree.com/payout",
    fetchImpl: async () => { throw new Error("timeout"); },
  });
  assert.equal((await provider.initiatePayout({
    amountMinor: 1_000,
    reference: "ord_timeout",
    beneficiary: verifiedBank,
  })).status, "PENDING");
});

test("production refuses stub payouts and missing Cashfree credentials", () => {
  assert.throws(() => makePayoutProvider({ NODE_ENV: "production", PAYOUT_PROVIDER: "stub" }), /forbidden/);
  assert.throws(() => makePayoutProvider({ NODE_ENV: "production", PAYOUT_PROVIDER: "cashfree" }), /credentials/);
});
