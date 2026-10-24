import { getDatabase, databaseConfigured } from "../db/database.js";
import { getKyc as getMemoryKyc, updateKyc as updateMemoryKyc, allKyc as allMemoryKyc } from "../store.js";
import { encryptKycValue, maskGstin, maskPan, sha256KycSession } from "./kycCrypto.js";

const BOOLEANS = {
  panVerified: "pan_verified",
  aadhaarVerified: "aadhaar_verified",
  selfieVerified: "selfie_verified",
  gstVerified: "gst_verified",
};

function safeProfile(row) {
  if (!row) return null;
  return {
    phone: row.user_phone,
    panVerified: row.pan_verified,
    aadhaarVerified: row.aadhaar_verified,
    selfieVerified: row.selfie_verified,
    gstVerified: row.gst_verified,
    pan: row.pan_masked,
    gstin: row.gstin_masked,
    legalName: row.legal_name,
    reviewStatus: row.review_status,
    reviewReason: row.review_reason,
  };
}

function emptyProfile(phone) {
  return {
    phone,
    panVerified: false,
    aadhaarVerified: false,
    selfieVerified: false,
    gstVerified: false,
    pan: null,
    gstin: null,
    legalName: null,
    reviewStatus: "pending",
    reviewReason: null,
  };
}

function safeMemoryProfile(phone, profile = getMemoryKyc(phone)) {
  return {
    ...emptyProfile(phone),
    panVerified: Boolean(profile.panVerified),
    aadhaarVerified: Boolean(profile.aadhaarVerified),
    selfieVerified: Boolean(profile.selfieVerified),
    gstVerified: Boolean(profile.gstVerified),
    pan: maskPan(profile.pan),
    gstin: maskGstin(profile.gstin),
    legalName: profile.legalName ?? null,
    reviewStatus: profile.reviewStatus ?? "pending",
    reviewReason: profile.reviewReason ?? null,
  };
}

export async function getKycProfile(phone) {
  if (!databaseConfigured()) return safeMemoryProfile(phone);
  const result = await getDatabase().query(
    "SELECT user_phone,pan_verified,aadhaar_verified,selfie_verified,gst_verified,pan_masked,gstin_masked,legal_name,review_status,review_reason " +
    "FROM xorpay_kyc_profiles WHERE user_phone=$1",
    [phone],
  );
  return result.rowCount ? safeProfile(result.rows[0]) : emptyProfile(phone);
}

export async function updateKycProfile(phone, patch) {
  if (!databaseConfigured()) return updateMemoryKyc(phone, patch);
  const fields = new Map();
  for (const [property, column] of Object.entries(BOOLEANS)) {
    if (Object.hasOwn(patch, property)) fields.set(column, Boolean(patch[property]));
  }
  if (Object.hasOwn(patch, "pan")) {
    const value = typeof patch.pan === "string" ? patch.pan.trim().toUpperCase() : "";
    const encrypted = value ? encryptKycValue(value, phone, "pan") : null;
    fields.set("pan_ciphertext", encrypted?.ciphertext ?? null);
    fields.set("pan_key_id", encrypted?.keyId ?? null);
    fields.set("pan_masked", maskPan(value));
  }
  if (Object.hasOwn(patch, "gstin")) {
    const value = typeof patch.gstin === "string" ? patch.gstin.trim().toUpperCase() : "";
    const encrypted = value ? encryptKycValue(value, phone, "gstin") : null;
    fields.set("gstin_ciphertext", encrypted?.ciphertext ?? null);
    fields.set("gstin_key_id", encrypted?.keyId ?? null);
    fields.set("gstin_masked", maskGstin(value));
  }
  if (Object.hasOwn(patch, "legalName")) fields.set("legal_name", patch.legalName ?? null);
  if (Object.hasOwn(patch, "reviewStatus")) fields.set("review_status", patch.reviewStatus);
  if (Object.hasOwn(patch, "reviewReason")) fields.set("review_reason", patch.reviewReason ?? null);
  if (fields.size === 0) return getKycProfile(phone);

  const columns = ["user_phone", ...fields.keys()];
  const values = [phone, ...fields.values()];
  const placeholders = values.map((_, index) => `$${index + 1}`);
  const updates = [...fields.keys()].map((column) => `${column}=EXCLUDED.${column}`);
  updates.push("updated_at=now()");
  const result = await getDatabase().query(
    `INSERT INTO xorpay_kyc_profiles (${columns.join(",")}) VALUES (${placeholders.join(",")}) ` +
    `ON CONFLICT (user_phone) DO UPDATE SET ${updates.join(",")} ` +
    "RETURNING user_phone,pan_verified,aadhaar_verified,selfie_verified,gst_verified,pan_masked,gstin_masked,legal_name,review_status,review_reason",
    values,
  );
  return safeProfile(result.rows[0]);
}

export async function listKycProfiles() {
  if (!databaseConfigured()) return allMemoryKyc().map((profile) => safeMemoryProfile(profile.phone, profile));
  const result = await getDatabase().query(
    "SELECT user_phone,pan_verified,aadhaar_verified,selfie_verified,gst_verified,pan_masked,gstin_masked,legal_name,review_status,review_reason " +
    "FROM xorpay_kyc_profiles ORDER BY updated_at DESC LIMIT 500",
  );
  return result.rows.map(safeProfile);
}

export async function createKycSession(phone, purpose, providerSessionId) {
  if (!providerSessionId || !["aadhaar", "selfie"].includes(purpose)) throw new TypeError("invalid KYC session");
  const sessionHash = sha256KycSession(phone, purpose, String(providerSessionId));
  if (!databaseConfigured()) {
    memorySessions.set(`${phone}:${purpose}:${sessionHash}`, "PENDING");
    return;
  }
  await getDatabase().query(
    "INSERT INTO xorpay_kyc_sessions(user_phone,purpose,session_sha256,status,expires_at) " +
    "VALUES ($1,$2,$3,'PENDING',now()+interval '1 hour') ON CONFLICT (user_phone,purpose,session_sha256) DO UPDATE " +
    "SET status='PENDING',expires_at=now()+interval '1 hour',updated_at=now()",
    [phone, purpose, sessionHash],
  );
}

const memorySessions = new Map();

export async function claimKycSession(phone, purpose, providerSessionId) {
  const sessionHash = sha256KycSession(phone, purpose, String(providerSessionId || ""));
  const key = `${phone}:${purpose}:${sessionHash}`;
  if (!databaseConfigured()) {
    if (memorySessions.get(key) !== "PENDING") return false;
    memorySessions.set(key, "PROCESSING");
    return true;
  }
  const result = await getDatabase().query(
    "UPDATE xorpay_kyc_sessions SET status='PROCESSING',updated_at=now() " +
    "WHERE user_phone=$1 AND purpose=$2 AND session_sha256=$3 AND status='PENDING' AND expires_at>now() RETURNING id",
    [phone, purpose, sessionHash],
  );
  return result.rowCount === 1;
}

export async function finishKycSession(phone, purpose, providerSessionId, { retry = false } = {}) {
  const sessionHash = sha256KycSession(phone, purpose, String(providerSessionId || ""));
  const key = `${phone}:${purpose}:${sessionHash}`;
  const status = retry ? "PENDING" : "COMPLETED";
  if (!databaseConfigured()) {
    if (memorySessions.get(key) === "PROCESSING") memorySessions.set(key, status);
    return;
  }
  await getDatabase().query(
    "UPDATE xorpay_kyc_sessions SET status=$4,updated_at=now() " +
    "WHERE user_phone=$1 AND purpose=$2 AND session_sha256=$3 AND status='PROCESSING'",
    [phone, purpose, sessionHash, status],
  );
}

export async function updateKycReview(phone, patch) {
  if (!databaseConfigured()) {
    const current = getMemoryKyc(phone);
    if (!current.panVerified && !current.aadhaarVerified && !current.selfieVerified && !current.gstVerified) return null;
    return updateMemoryKyc(phone, {
      reviewStatus: patch.reviewStatus,
      reviewReason: patch.reviewReason ?? null,
    });
  }
  const result = await getDatabase().query(
    "UPDATE xorpay_kyc_profiles SET review_status=$2,review_reason=$3,updated_at=now() WHERE user_phone=$1 " +
    "RETURNING user_phone,pan_verified,aadhaar_verified,selfie_verified,gst_verified,pan_masked,gstin_masked,legal_name,review_status,review_reason",
    [phone, patch.reviewStatus, patch.reviewReason ?? null],
  );
  return result.rowCount ? safeProfile(result.rows[0]) : null;
}
