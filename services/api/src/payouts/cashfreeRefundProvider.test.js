import { test } from "node:test";
import assert from "node:assert/strict";
import { CashfreeRefundProvider } from "./cashfreeRefundProvider.js";

function response(status, body) {
  return { status, ok: status >= 200 && status < 300, json: async () => body };
}

test("Cashfree refund create is stable and maps pending without claiming completion", async () => {
  const requests = [];
  const provider = new CashfreeRefundProvider({
    clientId: "id",
    clientSecret: "secret",
    baseUrl: "https://sandbox.cashfree.com/pg/",
    fetchImpl: async (url, options) => {
      requests.push({ url: String(url), options });
      return response(200, { refund_status: "PENDING", refund_arn: "arn-1" });
    },
  });
  const result = await provider.createRefund({ orderId: "ord_123", refundId: "rfnd123", amountMinor: 500_000 });
  assert.equal(result.status, "PENDING");
  assert.equal(result.refundArn, "arn-1");
  assert.equal(requests[0].url, "https://sandbox.cashfree.com/pg/orders/ord_123/refunds");
  const firstKey = requests[0].options.headers["x-idempotency-key"];
  await provider.createRefund({ orderId: "ord_123", refundId: "rfnd123", amountMinor: 500_000 });
  assert.equal(requests[1].options.headers["x-idempotency-key"], firstKey);
  assert.equal(JSON.parse(requests[0].options.body).refund_amount, 5000);
});

test("Cashfree refund lookup distinguishes missing from pending and success", async () => {
  const statuses = [404, 200, 200];
  const bodies = [{}, { refund_status: "PENDING_APPROVAL" }, { refund_status: "SUCCESS", refund_arn: "arn-ok" }];
  const provider = new CashfreeRefundProvider({
    clientId: "id",
    clientSecret: "secret",
    baseUrl: "https://sandbox.cashfree.com/pg",
    fetchImpl: async () => response(statuses.shift(), bodies.shift()),
  });
  assert.equal((await provider.getRefund("ord", "rfnd")).status, "NOT_FOUND");
  assert.equal((await provider.getRefund("ord", "rfnd")).status, "PENDING");
  assert.deepEqual(await provider.getRefund("ord", "rfnd"), { status: "SUCCESS", refundArn: "arn-ok" });
});
