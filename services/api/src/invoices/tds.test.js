import { test } from "node:test";
import assert from "node:assert/strict";

import { computeTds, summarizeInvoices } from "./tds.js";

test("computeTds at 2%", () => {
  const r = computeTds(1_000_000); // ₹10,000
  assert.equal(r.tdsMinor, 20_000); // ₹200
  assert.equal(r.netMinor, 980_000);
});

test("computeTds custom rate (10%)", () => {
  const r = computeTds(500_000, 10);
  assert.equal(r.tdsMinor, 50_000);
  assert.equal(r.netMinor, 450_000);
});

test("summarize without TDS = gross", () => {
  const invs = [{ amountMinor: 100_000 }, { amountMinor: 250_000 }];
  const s = summarizeInvoices(invs);
  assert.equal(s.count, 2);
  assert.equal(s.grossMinor, 350_000);
  assert.equal(s.tdsMinor, 0);
  assert.equal(s.netMinor, 350_000);
});

test("summarize with TDS deducts per-invoice", () => {
  const invs = [{ amountMinor: 100_000 }, { amountMinor: 250_000 }];
  const s = summarizeInvoices(invs, { withTds: true, ratePct: 2 });
  assert.equal(s.tdsMinor, 2_000 + 5_000);
  assert.equal(s.netMinor, 350_000 - 7_000);
});
