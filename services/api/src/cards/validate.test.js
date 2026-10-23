import { test } from "node:test";
import assert from "node:assert/strict";

import { looksLikePan, containsPan, validateCardRef } from "./validate.js";

test("looksLikePan catches real PAN lengths", () => {
  assert.equal(looksLikePan("4111111111111111"), true); // 16
  assert.equal(looksLikePan("4111 1111 1111 1111"), true); // spaced
  assert.equal(looksLikePan("378282246310005"), true); // 15 (amex)
  assert.equal(looksLikePan("1234"), false); // last4
  assert.equal(looksLikePan("tok_abc123"), false);
  assert.equal(looksLikePan(null), false);
});

test("containsPan scans all fields", () => {
  assert.equal(containsPan({ token: "tok_x", note: "4111111111111111" }), true);
  assert.equal(containsPan({ token: "tok_x", last4: "1111" }), false);
});

test("validateCardRef accepts a clean token reference", () => {
  const r = validateCardRef({
    token: "tok_abc",
    last4: "4242",
    network: "visa",
    expiryMonth: 11,
    expiryYear: 2030,
  });
  assert.equal(r.ok, true);
});

test("validateCardRef rejects a PAN in any field", () => {
  const r = validateCardRef({
    token: "4111111111111111",
    last4: "1111",
    expiryMonth: 11,
    expiryYear: 2030,
  });
  assert.equal(r.ok, false);
  assert.equal(r.error, "pan_not_allowed");
});

test("validateCardRef validates last4 and expiry", () => {
  assert.equal(validateCardRef({ token: "t", last4: "12" }).error, "bad_last4");
  assert.equal(
    validateCardRef({ token: "t", last4: "1234", expiryMonth: 13, expiryYear: 2030 }).error,
    "bad_expiry_month",
  );
  assert.equal(
    validateCardRef({ token: "t", last4: "1234", expiryMonth: 5, expiryYear: 1999 }).error,
    "bad_expiry_year",
  );
});
