import { test } from "node:test";
import assert from "node:assert/strict";

import { computeCoins } from "./coins.js";

test("base: 1 coin per ₹100", () => {
  // ₹10,000 = 100 x ₹100 -> 100 coins (vendor mult 1)
  assert.equal(computeCoins({ payeeMinor: 1_000_000, category: "vendor" }), 100);
});

test("rent multiplier doubles", () => {
  assert.equal(computeCoins({ payeeMinor: 1_000_000, category: "rent" }), 200);
});

test("first-transaction bonus added", () => {
  assert.equal(
    computeCoins({ payeeMinor: 1_000_000, category: "vendor", isFirstTxn: true }),
    150,
  );
});

test("RuPay network bonus added", () => {
  assert.equal(
    computeCoins({ payeeMinor: 1_000_000, category: "vendor", cardNetwork: "rupay" }),
    105,
  );
});

test("sub-₹100 earns nothing from base", () => {
  assert.equal(computeCoins({ payeeMinor: 5_000, category: "vendor" }), 0);
});

test("zero / invalid amount -> 0", () => {
  assert.equal(computeCoins({ payeeMinor: 0 }), 0);
  assert.equal(computeCoins({ payeeMinor: -1 }), 0);
});
