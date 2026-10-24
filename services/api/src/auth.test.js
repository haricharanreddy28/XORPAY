import { test } from "node:test";
import assert from "node:assert/strict";

import {
  createSession,
  phoneFromToken,
  revokeSession,
  rotateSession,
} from "./auth.js";

test("JWT access tokens expire and refresh tokens rotate once and revoke", async () => {
  const phone = "+919999000001";
  const session = await createSession(phone);

  assert.equal(phoneFromToken(session.access_token), phone);
  assert.equal(session.token_type, "Bearer");
  assert.equal(session.expires_in, 900);

  const parts = session.access_token.split(".");
  const tampered = `${parts[0]}.${parts[1]}x.${parts[2]}`;
  assert.equal(phoneFromToken(tampered), null);
  assert.equal(phoneFromToken(session.access_token, Math.floor(Date.now() / 1000) + 901), null);

  const rotated = await rotateSession(session.refresh_token);
  assert.ok(rotated);
  assert.equal(phoneFromToken(rotated.access_token), phone);
  assert.equal(await rotateSession(session.refresh_token), null);

  await revokeSession(rotated.refresh_token);
  assert.equal(await rotateSession(rotated.refresh_token), null);
});
