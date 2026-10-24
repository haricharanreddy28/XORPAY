import crypto from "node:crypto";
import { test } from "node:test";
import assert from "node:assert/strict";
import { decryptKycValue, encryptKycValue, maskGstin, maskPan } from "./kycCrypto.js";

const env = { KYC_ENCRYPTION_KEY_ID: "test-v1", KYC_ENCRYPTION_KEY: crypto.randomBytes(32).toString("base64") };

test("KYC values use authenticated encryption bound to the user and field", () => {
  const encrypted = encryptKycValue("ABCDE1234F", "+919876543210", "pan", env);
  assert.notEqual(encrypted.ciphertext.toString("utf8"), "ABCDE1234F");
  assert.equal(decryptKycValue(encrypted.ciphertext, encrypted.keyId, "+919876543210", "pan", env), "ABCDE1234F");
  assert.throws(() => decryptKycValue(encrypted.ciphertext, encrypted.keyId, "+919999999999", "pan", env));
  assert.throws(() => decryptKycValue(encrypted.ciphertext, encrypted.keyId, "+919876543210", "gstin", env));
});

test("KYC response identifiers are masked", () => {
  assert.equal(maskPan("ABCDE1234F"), "AB***34F");
  assert.equal(maskGstin("27ABCDE1234F1Z5"), "27**********1Z5");
  assert.equal(maskPan("invalid"), null);
});
