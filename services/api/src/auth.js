import crypto from "node:crypto";
import { createClient } from "redis";

const isProduction = process.env.NODE_ENV === "production" || process.env.CASHFREE_ENV?.toUpperCase() === "PRODUCTION";
const jwtSecret = process.env.JWT_SECRET || (isProduction ? "" : "xorpay-local-development-only-secret");
if (isProduction && Buffer.byteLength(jwtSecret) < 32) {
  throw new Error("JWT_SECRET must contain at least 32 bytes in production");
}

const ISSUER = "xorpay-api";
const AUDIENCE = "xorpay-mobile";
const ACCESS_TTL_SECONDS = 15 * 60;
const REFRESH_TTL_SECONDS = 30 * 24 * 60 * 60;
const devRefreshSessions = new Map();
let redisClient = null;

const b64url = (value) => Buffer.from(value).toString("base64url");
const digest = (value) => crypto.createHash("sha256").update(value).digest("hex");

function signAccessToken(phone, nowSeconds = Math.floor(Date.now() / 1000)) {
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = b64url(JSON.stringify({
    iss: ISSUER,
    aud: AUDIENCE,
    sub: phone,
    iat: nowSeconds,
    exp: nowSeconds + ACCESS_TTL_SECONDS,
    typ: "access",
  }));
  const input = `${header}.${payload}`;
  const signature = crypto.createHmac("sha256", jwtSecret).update(input).digest("base64url");
  return `${input}.${signature}`;
}

/** Validate a signed, short-lived access JWT and return its phone subject. */
export function phoneFromToken(token, nowSeconds = Math.floor(Date.now() / 1000)) {
  if (typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [headerPart, payloadPart, signaturePart] = parts;

  try {
    const header = JSON.parse(Buffer.from(headerPart, "base64url").toString("utf8"));
    const payload = JSON.parse(Buffer.from(payloadPart, "base64url").toString("utf8"));
    if (header.alg !== "HS256" || header.typ !== "JWT") return null;
    if (payload.iss !== ISSUER || payload.aud !== AUDIENCE || payload.typ !== "access") return null;
    if (typeof payload.sub !== "string" || !payload.sub) return null;
    if (!Number.isInteger(payload.exp) || payload.exp <= nowSeconds) return null;
    if (!Number.isInteger(payload.iat) || payload.iat > nowSeconds + 60) return null;

    const expected = crypto.createHmac("sha256", jwtSecret).update(`${headerPart}.${payloadPart}`).digest();
    const received = Buffer.from(signaturePart, "base64url");
    if (received.length !== expected.length || !crypto.timingSafeEqual(received, expected)) return null;
    return payload.sub;
  } catch {
    return null;
  }
}

async function storeRefreshSession(token, phone) {
  const key = `xorpay:refresh:${digest(token)}`;
  const value = JSON.stringify({ phone, issuedAt: Date.now() });
  if (redisClient) {
    await redisClient.set(key, value, { EX: REFRESH_TTL_SECONDS, NX: true });
    return;
  }
  if (isProduction) throw new Error("Redis refresh-session store is unavailable");
  devRefreshSessions.set(key, { value, expiresAt: Date.now() + REFRESH_TTL_SECONDS * 1000 });
}

async function consumeRefreshSession(token) {
  if (typeof token !== "string" || token.length < 32 || token.length > 256) return null;
  const key = `xorpay:refresh:${digest(token)}`;
  let value;
  if (redisClient) {
    value = await redisClient.getDel(key);
  } else {
    if (isProduction) throw new Error("Redis refresh-session store is unavailable");
    const session = devRefreshSessions.get(key);
    devRefreshSessions.delete(key);
    if (session && session.expiresAt > Date.now()) value = session.value;
  }
  if (!value) return null;
  try {
    const session = JSON.parse(value);
    return typeof session.phone === "string" ? session.phone : null;
  } catch {
    return null;
  }
}

export async function connectAuthStore() {
  if (!process.env.REDIS_URL) {
    if (isProduction) throw new Error("REDIS_URL is required in production");
    return;
  }
  redisClient = createClient({ url: process.env.REDIS_URL });
  redisClient.on("error", (error) => {
    console.error("[auth] Redis connection error", error?.code || "unknown");
  });
  await redisClient.connect();
}

/** Create a 15-minute signed access token and a one-time, rotating refresh token. */
export async function createSession(phone) {
  const refreshToken = crypto.randomBytes(48).toString("base64url");
  await storeRefreshSession(refreshToken, phone);
  return {
    access_token: signAccessToken(phone),
    refresh_token: refreshToken,
    token_type: "Bearer",
    expires_in: ACCESS_TTL_SECONDS,
  };
}

/** Consume a refresh token once, rotate it, and return the replacement session. */
export async function rotateSession(refreshToken) {
  const phone = await consumeRefreshSession(refreshToken);
  return phone ? createSession(phone) : null;
}

export async function revokeSession(refreshToken) {
  if (typeof refreshToken !== "string" || refreshToken.length < 32 || refreshToken.length > 256) return;
  const key = `xorpay:refresh:${digest(refreshToken)}`;
  if (redisClient) await redisClient.del(key);
  else devRefreshSessions.delete(key);
}

/// Express middleware: requires a valid Bearer access token, sets req.phone, else 401.
export function requireAuth(req, res, next) {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  const phone = token && phoneFromToken(token);
  if (!phone) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  req.phone = phone;
  next();
}
