import { test } from "node:test";
import assert from "node:assert/strict";

import {
  isValidIfsc,
  isValidVpa,
  isValidAccount,
  maskAccount,
  validateBeneficiary,
} from "./validate.js";

test("IFSC validation", () => {
  assert.equal(isValidIfsc("HDFC0001234"), true);
  assert.equal(isValidIfsc("hdfc0001234"), true); // case-insensitive
  assert.equal(isValidIfsc("HDFC1001234"), false); // 5th char must be 0
  assert.equal(isValidIfsc("HDF0001234"), false); // too short
});

test("VPA validation", () => {
  assert.equal(isValidVpa("ramesh@okhdfcbank"), true);
  assert.equal(isValidVpa("9999999999@ybl"), true);
  assert.equal(isValidVpa("nope"), false);
  assert.equal(isValidVpa("@psp"), false);
});

test("account number + masking", () => {
  assert.equal(isValidAccount("000123456789"), true);
  assert.equal(isValidAccount("123"), false);
  assert.equal(maskAccount("000123456789"), "•• 6789");
  assert.equal(maskAccount("12"), "12");
});

test("validateBeneficiary routes by type", () => {
  assert.deepEqual(
    validateBeneficiary({ type: "bank", accountNumber: "000123456789", ifsc: "HDFC0001234" }),
    { ok: true, type: "bank" },
  );
  assert.deepEqual(
    validateBeneficiary({ type: "upi", vpa: "ramesh@okhdfcbank" }),
    { ok: true, type: "upi" },
  );
  assert.equal(validateBeneficiary({ type: "bank", accountNumber: "1" }).error, "bad_account");
  assert.equal(validateBeneficiary({ type: "upi", vpa: "x" }).error, "bad_vpa");
  assert.equal(validateBeneficiary({ type: "card" }).error, "bad_type");
});
