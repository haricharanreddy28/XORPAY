import { test } from "node:test";
import assert from "node:assert/strict";

import { buildReport } from "./reports.js";

const fee = (p) => ({
  payeeMinor: p,
  feeMinor: Math.round(p * 0.02),
  gstMinor: Math.round(p * 0.02 * 0.18),
  youPayMinor: p + Math.round(p * 0.02) + Math.round(p * 0.02 * 0.18),
});

test("settlement counts only SUCCESS; gst/fee count all paid", () => {
  const txns = [
    { state: "SUCCESS", createdAt: 100, fee: fee(1_000_000) },
    { state: "PAYOUT_QUEUED", createdAt: 100, fee: fee(500_000) },
    { state: "FAILED", createdAt: 100, fee: fee(300_000) },
  ];
  const r = buildReport(txns);
  assert.equal(r.settledCount, 1);
  assert.equal(r.settlementMinor, 1_000_000); // only the SUCCESS payee amount
  assert.equal(r.feeRevenueMinor, 20_000 + 10_000); // both paid
  assert.equal(r.gstOnFeesMinor, 3_600 + 1_800);
});

test("date window filters", () => {
  const txns = [
    { state: "SUCCESS", createdAt: 50, fee: fee(1_000_000) },
    { state: "SUCCESS", createdAt: 500, fee: fee(1_000_000) },
  ];
  const r = buildReport(txns, { fromMs: 100, toMs: 1000 });
  assert.equal(r.settledCount, 1);
});
