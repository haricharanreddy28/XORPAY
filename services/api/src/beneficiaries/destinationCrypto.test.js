import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

import { decryptDestination, encryptDestination } from "./destinationCrypto.js";

const key = crypto.randomBytes(32).toString("base64");
const env = { BENEFICIARY_ENCRYPTION_KEY: key, BENEFICIARY_ENCRYPTION_KEY_ID: "test-v1" };
const context = { userPhone: "+919876543210", beneficiaryId: "bene_test_1" };

test("AES-GCM encrypts and authenticates beneficiary destinations", () => {
  const destination = { accountNumber: "000123456789", ifsc: "HDFC0001234" };
  const encrypted = encryptDestination(destination, env, context);
  assert.equal(encrypted.keyId, "test-v1");
  assert.notEqual(encrypted.envelope.toString("utf8"), JSON.stringify(destination));
  assert.deepEqual(decryptDestination(encrypted.envelope, encrypted.keyId, env, context), destination);
  assert.throws(() => decryptDestination(encrypted.envelope, encrypted.keyId, env, { ...context, userPhone: "+919999999999" }));

  const tampered = Buffer.from(encrypted.envelope);
  tampered[tampered.length - 1] ^= 1;
  assert.throws(() => decryptDestination(tampered, encrypted.keyId, env, context));
});

test("encrypted data cannot be opened without the matching key id", () => {
  const encrypted = encryptDestination({ vpa: "ramesh@okhdfcbank" }, env, context);
  assert.throws(
    () => decryptDestination(encrypted.envelope, "retired-key", env, context),
    { code: "BENEFICIARY_ENCRYPTION_KEY_UNAVAILABLE" },
  );
});

test("missing key material fails closed", () => {
  assert.throws(
    () => encryptDestination({ vpa: "ramesh@okhdfcbank" }, {}),
    { code: "BENEFICIARY_ENCRYPTION_NOT_CONFIGURED" },
  );
});
