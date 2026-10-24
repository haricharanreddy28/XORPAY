import crypto from "node:crypto";
import { test } from "node:test";
import assert from "node:assert/strict";
import { clearAdminJwksCacheForTests, verifyAdminAccessToken } from "./adminAuth.js";

function makeToken(privateKey, claims, kid = "test-key") {
  const b64 = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const first = b64({ alg: "RS256", typ: "JWT", kid });
  const second = b64(claims);
  const input = `${first}.${second}`;
  const signature = crypto.sign("RSA-SHA256", Buffer.from(input), privateKey).toString("base64url");
  return `${input}.${signature}`;
}

test("Cognito access token is signature, issuer, audience, expiry, and role checked", async () => {
  clearAdminJwksCacheForTests();
  const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
  const jwk = publicKey.export({ format: "jwk" });
  jwk.kid = "test-key";
  jwk.use = "sig";
  jwk.kty = "RSA";
  const env = {
    ADMIN_COGNITO_ISSUER: "https://cognito-idp.ap-south-1.amazonaws.com/ap-south-1_pool",
    ADMIN_COGNITO_CLIENT_ID: "client-123",
  };
  const fetchImpl = async () => ({ ok: true, json: async () => ({ keys: [jwk] }) });
  const nowSeconds = 1_800_000_000;
  const claims = {
    iss: env.ADMIN_COGNITO_ISSUER,
    sub: "admin-subject",
    client_id: env.ADMIN_COGNITO_CLIENT_ID,
    token_use: "access",
    iat: nowSeconds - 10,
    exp: nowSeconds + 600,
    "cognito:groups": ["xorpay-finance"],
    email: "finance@example.test",
  };
  const token = makeToken(privateKey, claims);
  assert.deepEqual(
    await verifyAdminAccessToken(token, { env, fetchImpl, nowSeconds }),
    { subject: "admin-subject", role: "finance", email: "finance@example.test" },
  );
  assert.equal(await verifyAdminAccessToken(token, { env: { ...env, ADMIN_COGNITO_CLIENT_ID: "wrong" }, fetchImpl, nowSeconds }), null);
  assert.equal(await verifyAdminAccessToken(makeToken(privateKey, { ...claims, exp: nowSeconds - 1 }), { env, fetchImpl, nowSeconds }), null);
  assert.equal(await verifyAdminAccessToken(makeToken(privateKey, { ...claims, "cognito:groups": ["untrusted"] }), { env, fetchImpl, nowSeconds }), null);
  assert.equal(await verifyAdminAccessToken(makeToken(crypto.generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey, claims), { env, fetchImpl, nowSeconds }), null);
});
