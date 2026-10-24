import crypto from "node:crypto";

const IV_BYTES = 12;
const TAG_BYTES = 16;
const VERSION = 1;

function keyring(env) {
  const activeId = env.KYC_ACTIVE_ENCRYPTION_KEY_ID || env.KYC_ENCRYPTION_KEY_ID || "v1";
  let values;
  if (env.KYC_ENCRYPTION_KEYS) {
    try { values = JSON.parse(env.KYC_ENCRYPTION_KEYS); }
    catch { throw new Error("KYC_ENCRYPTION_KEYS must be a JSON object"); }
  } else if (env.KYC_ENCRYPTION_KEY) {
    values = { [activeId]: env.KYC_ENCRYPTION_KEY };
  } else {
    const error = new Error("KYC_ENCRYPTION_KEY is required");
    error.code = "KYC_ENCRYPTION_NOT_CONFIGURED";
    throw error;
  }

  const keys = new Map();
  for (const [id, encoded] of Object.entries(values || {})) {
    const key = Buffer.from(String(encoded), "base64");
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(id) || key.length !== 32 ||
        key.toString("base64").replace(/=+$/, "") !== String(encoded).replace(/=+$/, "")) {
      throw new Error("KYC encryption keys must be base64-encoded 32-byte keys");
    }
    keys.set(id, key);
  }
  if (!keys.has(activeId)) throw new Error("active KYC encryption key is missing from keyring");
  return { activeId, keys };
}

function aad(phone, field) {
  if (typeof phone !== "string" || !phone || !["pan", "gstin", "email", "push_token"].includes(field)) {
    throw new TypeError("KYC owner and field are required");
  }
  return Buffer.from(`xorpay:kyc:v1:${phone}:${field}`);
}

export function encryptKycValue(value, phone, field, env = process.env) {
  const { activeId, keys } = keyring(env);
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv("aes-256-gcm", keys.get(activeId), iv);
  cipher.setAAD(aad(phone, field));
  const ciphertext = Buffer.concat([cipher.update(String(value), "utf8"), cipher.final()]);
  return {
    keyId: activeId,
    ciphertext: Buffer.concat([Buffer.from([VERSION]), iv, cipher.getAuthTag(), ciphertext]),
  };
}

export function decryptKycValue(envelope, keyId, phone, field, env = process.env) {
  const { keys } = keyring(env);
  const key = keys.get(keyId);
  if (!key) {
    const error = new Error("KYC encryption key unavailable");
    error.code = "KYC_ENCRYPTION_KEY_UNAVAILABLE";
    throw error;
  }
  const data = Buffer.from(envelope || []);
  if (data.length < 1 + IV_BYTES + TAG_BYTES + 1 || data[0] !== VERSION) {
    throw new Error("invalid KYC ciphertext envelope");
  }
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, data.subarray(1, 1 + IV_BYTES));
  decipher.setAAD(aad(phone, field));
  decipher.setAuthTag(data.subarray(1 + IV_BYTES, 1 + IV_BYTES + TAG_BYTES));
  return Buffer.concat([decipher.update(data.subarray(1 + IV_BYTES + TAG_BYTES)), decipher.final()]).toString("utf8");
}

export function maskPan(value) {
  const pan = String(value || "").toUpperCase();
  return /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan) ? `${pan.slice(0, 2)}***${pan.slice(-3)}` : null;
}

export function maskGstin(value) {
  const gstin = String(value || "").toUpperCase();
  if (gstin.length !== 15) return null;
  return `${gstin.slice(0, 2)}***********${gstin.slice(-2)}`;
}

export function sha256KycSession(phone, purpose, providerSessionId) {
  return crypto.createHash("sha256")
    .update(`xorpay:kyc-session:v1:${phone}:${purpose}:${providerSessionId}`)
    .digest("hex");
}
