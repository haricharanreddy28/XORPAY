import { test } from "node:test";
import assert from "node:assert/strict";

import { computeMetrics } from "./adminMetrics.js";

const fee = (payee) => ({
  payeeMinor: payee,
  feeMinor: Math.round(payee * 0.02),
  gstMinor: Math.round(payee * 0.02 * 0.18),
  youPayMinor: payee + Math.round(payee * 0.02) + Math.round(payee * 0.02 * 0.18),
});

test("computes GMV, revenue, success rate, active users", () => {
  const txns = [
    { phone: "a", state: "SUCCESS", fee: fee(1_000_000) },
    { phone: "a", state: "PAYOUT_QUEUED", fee: fee(500_000) },
    { phone: "b", state: "PAYMENT_PENDING", fee: fee(200_000) }, // not counted in GMV
    { phone: "b", state: "FAILED", fee: fee(300_000) }, // not paid
  ];
  const m = computeMetrics(txns);
  assert.equal(m.txnCount, 4);
  assert.equal(m.successCount, 1);
  assert.equal(m.activeUsers, 2);
  assert.equal(m.successRate, 0.25);
  // GMV = youPay of the two paid (SUCCESS + PAYOUT_QUEUED)
  assert.equal(m.gmvMinor, fee(1_000_000).youPayMinor + fee(500_000).youPayMinor);
  assert.equal(m.feeRevenueMinor, 20_000 + 10_000);
});

test("empty -> zeros", () => {
  const m = computeMetrics([]);
  assert.equal(m.txnCount, 0);
  assert.equal(m.successRate, 0);
  assert.equal(m.gmvMinor, 0);
});
