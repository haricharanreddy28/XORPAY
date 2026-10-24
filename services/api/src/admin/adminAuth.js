import crypto from "node:crypto";

const jwksCache = new Map();
const ROLE_GROUPS = new Map([
  ["xorpay-super-admin", "super"],
  ["xorpay-ops", "ops"],
  ["xorpay-finance", "finance"],
  ["xorpay-support", "support"],
  ["xorpay-compliance", "compliance"],
]);

function configured(env) {
  const issuer = String(env.ADMIN_COGNITO_ISSUER || "").replace(/\/+$/, "");
  const audience = env.ADMIN_COGNITO_CLIENT_ID;
  if (!issuer || !audience) return null;
  return { issuer, audience };
}

async function loadJwks(issuer, fetchImpl, force = false) {
  const cached = jwksCache.get(issuer);
  if (!force && cached && cached.expiresAt > Date.now()) return cached.keys;
  const response = await fetchImpl(`${issuer}/.well-known/jwks.json`, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error("admin_jwks_unavailable");
  const body = await response.json();
  if (!Array.isArray(body?.keys) || body.keys.length === 0) throw new Error("admin_jwks_invalid");
  jwksCache.set(issuer, { keys: body.keys, expiresAt: Date.now() + 60 * 60 * 1000 });
  return body.keys;
}

function roleFromGroups(groups) {
  if (!Array.isArray(groups)) return null;
  for (const role of ["super", "ops", "finance", "support", "compliance"]) {
    for (const [group, mappedRole] of ROLE_GROUPS) {
      if (mappedRole === role && groups.includes(group)) return role;
    }
  }
  return null;
}

function decodePart(part) {
  return JSON.parse(Buffer.from(part, "base64url").toString("utf8"));
}

/** Verify a Cognito access token, including issuer, app client, use, expiry and RS256 signature. */
export async function verifyAdminAccessToken(token, {
  env = process.env,
  fetchImpl = fetch,
  nowSeconds = Math.floor(Date.now() / 1000),
} = {}) {
  const config = configured(env);
  if (!config || typeof token !== "string" || token.length > 16_384) return null;
  const parts = token.split(".");
  if (parts.length !== 3 || parts.some((part) => !part)) return null;

  try {
    const header = decodePart(parts[0]);
    const claims = decodePart(parts[1]);
    if (header.alg !== "RS256" || typeof header.kid !== "string" ||
        claims.iss !== config.issuer || claims.token_use !== "access" ||
        claims.client_id !== config.audience || typeof claims.sub !== "string" ||
        !Number.isInteger(claims.exp) || claims.exp <= nowSeconds ||
        !Number.isInteger(claims.iat) || claims.iat > nowSeconds + 60) return null;

    let keys = await loadJwks(config.issuer, fetchImpl);
    let jwk = keys.find((key) => key.kid === header.kid && key.kty === "RSA" && key.use === "sig");
    if (!jwk) {
      keys = await loadJwks(config.issuer, fetchImpl, true);
      jwk = keys.find((key) => key.kid === header.kid && key.kty === "RSA" && key.use === "sig");
    }
    if (!jwk) return null;
    const key = crypto.createPublicKey({ key: jwk, format: "jwk" });
    const verified = crypto.verify(
      "RSA-SHA256",
      Buffer.from(`${parts[0]}.${parts[1]}`),
      key,
      Buffer.from(parts[2], "base64url"),
    );
    if (!verified) return null;

    const role = roleFromGroups(claims["cognito:groups"]);
    if (!role) return null;
    return { subject: claims.sub, role, email: typeof claims.email === "string" ? claims.email : null };
  } catch {
    return null;
  }
}

export function clearAdminJwksCacheForTests() {
  jwksCache.clear();
}
