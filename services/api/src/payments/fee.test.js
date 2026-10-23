import { test } from "node:test";
import assert from "node:assert/strict";

import { computeFee } from "./fee.js";

test("₹10,000 payee -> ₹200 fee + ₹36 GST -> ₹10,236", () => {
  const f = computeFee(1_000_000); // paise
  assert.equal(f.feeMinor, 20_000);
  assert.equal(f.gstMinor, 3_600);
  assert.equal(f.chargeMinor, 23_600);
  assert.equal(f.youPayMinor, 1_023_600);
});

test("rounds to paise", () => {
  const f = computeFee(99_900); // ₹999
  assert.equal(f.feeMinor, 1_998); // 2%
  assert.equal(f.gstMinor, 360); // round(1998*0.18=359.64)
  assert.equal(f.youPayMinor, 99_900 + 1_998 + 360);
});

test("custom rates", () => {
  const f = computeFee(500_000, { feeRatePct: 1.5, gstOnFeePct: 18 });
  assert.equal(f.feeMinor, 7_500);
  assert.equal(f.gstMinor, 1_350);
});
