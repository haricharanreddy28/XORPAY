import crypto from "node:crypto";

const VERSION = 1;
const IV_BYTES = 12;
const TAG_BYTES = 16;

function configuredKeys(env) {
  const activeId = env.BENEFICIARY_ACTIVE_ENCRYPTION_KEY_ID || env.BENEFICIARY_ENCRYPTION_KEY_ID || "v1";
  let encodedKeys;
  if (env.BENEFICIARY_ENCRYPTION_KEYS) {
    try {
      encodedKeys = JSON.parse(env.BENEFICIARY_ENCRYPTION_KEYS);
    } catch {
      throw new Error("BENEFICIARY_ENCRYPTION_KEYS must be a JSON object");
    }
  } else if (env.BENEFICIARY_ENCRYPTION_KEY) {
    encodedKeys = { [activeId]: env.BENEFICIARY_ENCRYPTION_KEY };
  } else {
    const error = new Error("beneficiary_encryption_not_configured");
    error.code = "BENEFICIARY_ENCRYPTION_NOT_CONFIGURED";
    throw error;
  }

  const keys = new Map();
  for (const [id, encoded] of Object.entries(encodedKeys || {})) {
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(id) || typeof encoded !== "string") {
      throw new Error("invalid beneficiary encryption key configuration");
    }
    const key = Buffer.from(encoded, "base64");
    if (key.length !== 32 || key.toString("base64").replace(/=+$/, "") !== encoded.replace(/=+$/, "")) {
      throw new Error("beneficiary encryption keys must be base64-encoded 32-byte keys");
    }
    keys.set(id, key);
  }
  if (!keys.has(activeId)) throw new Error("active beneficiary encryption key id is missing from keyring");
  return { activeId, keys };
}

function aadFor(context = {}) {
  if (typeof context.userPhone !== "string" || !context.userPhone ||
      typeof context.beneficiaryId !== "string" || !context.beneficiaryId) {
    throw new TypeError("beneficiary owner and id are required encryption context");
  }
  return Buffer.from(`xorpay:beneficiary-destination:v1:${context.userPhone}:${context.beneficiaryId}`);
}

/** AES-256-GCM envelope: version | 12-byte nonce | 16-byte tag | ciphertext. */
export function encryptDestination(destination, env = process.env, context) {
  if (!destination || typeof destination !== "object") throw new TypeError("destination object is required");
  const { activeId, keys } = configuredKeys(env);
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv("aes-256-gcm", keys.get(activeId), iv);
  cipher.setAAD(aadFor(context));
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(destination), "utf8"),
    cipher.final(),
  ]);
  const envelope = Buffer.concat([Buffer.from([VERSION]), iv, cipher.getAuthTag(), ciphertext]);
  return { keyId: activeId, envelope };
}

export function decryptDestination(envelope, keyId, env = process.env, context) {
  const { keys } = configuredKeys(env);
  const key = keys.get(keyId);
  if (!key) {
    const error = new Error("beneficiary_encryption_key_unavailable");
    error.code = "BENEFICIARY_ENCRYPTION_KEY_UNAVAILABLE";
    throw error;
  }
  const data = Buffer.from(envelope || []);
  if (data.length < 1 + IV_BYTES + TAG_BYTES + 1 || data[0] !== VERSION) {
    throw new Error("invalid beneficiary ciphertext envelope");
  }
  const iv = data.subarray(1, 1 + IV_BYTES);
  const tag = data.subarray(1 + IV_BYTES, 1 + IV_BYTES + TAG_BYTES);
  const ciphertext = data.subarray(1 + IV_BYTES + TAG_BYTES);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAAD(aadFor(context));
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  const value = JSON.parse(plaintext.toString("utf8"));
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid beneficiary destination payload");
  return value;
}
