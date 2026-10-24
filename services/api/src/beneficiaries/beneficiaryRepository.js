import crypto from "node:crypto";
import { getDatabase } from "../db/database.js";
import { decryptDestination, encryptDestination } from "./destinationCrypto.js";

const SAFE_COLUMNS = "id,user_phone,type,nickname,masked_account,ifsc,registered_name,verified,verified_at,created_at,updated_at";

function mapSafe(row) {
  if (!row) return null;
  return {
    id: row.id,
    type: row.type,
    nickname: row.nickname,
    maskedAccount: row.masked_account,
    ifsc: row.ifsc,
    registeredName: row.registered_name,
    verified: row.verified,
    verifiedAt: row.verified_at?.getTime() ?? null,
    createdAt: row.created_at.getTime(),
    updatedAt: row.updated_at.getTime(),
  };
}

async function mapWithDestination(row) {
  if (!row) return null;
  const safe = mapSafe(row);
  const destination = decryptDestination(row.encrypted_destination, row.encryption_key_id, process.env, { userPhone: row.user_phone, beneficiaryId: row.id });
  return { ...safe, accountNumber: destination.accountNumber ?? null, vpa: destination.vpa ?? null };
}

export async function listStoredBeneficiaries(phone) {
  const result = await getDatabase().query(
    "SELECT " + SAFE_COLUMNS + " FROM xorpay_beneficiaries WHERE user_phone=$1 ORDER BY created_at DESC",
    [phone],
  );
  return result.rows.map(mapSafe);
}

export async function getStoredBeneficiary(phone, id) {
  const result = await getDatabase().query(
    "SELECT " + SAFE_COLUMNS + ",encrypted_destination,encryption_key_id FROM xorpay_beneficiaries WHERE user_phone=$1 AND id=$2",
    [phone, id],
  );
  return mapWithDestination(result.rows[0]);
}

export async function createStoredBeneficiary(phone, input) {
  const id = "bene_" + crypto.randomUUID().replace(/-/g, "").slice(0, 20);
  const destination = input.type === "bank"
    ? { accountNumber: String(input.accountNumber), ifsc: String(input.ifsc).toUpperCase() }
    : { vpa: String(input.vpa) };
  const encrypted = encryptDestination(destination, process.env, { userPhone: phone, beneficiaryId: id });
  const result = await getDatabase().query(
    "INSERT INTO xorpay_beneficiaries (id,user_phone,type,nickname,masked_account,encrypted_destination,encryption_key_id,ifsc,registered_name,verified,verified_at) " +
    "VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,CASE WHEN $10 THEN now() ELSE NULL END) RETURNING " + SAFE_COLUMNS,
    [id, phone, input.type, input.nickname ?? null, input.maskedAccount, encrypted.envelope, encrypted.keyId, input.ifsc ?? null, input.registeredName ?? null, Boolean(input.verified)],
  );
  return mapSafe(result.rows[0]);
}

export async function updateStoredBeneficiaryVerification(phone, id, patch) {
  const result = await getDatabase().query(
    "UPDATE xorpay_beneficiaries SET verified=$3,registered_name=$4,verified_at=CASE WHEN $3 THEN now() ELSE NULL END,updated_at=now() " +
    "WHERE user_phone=$1 AND id=$2 RETURNING " + SAFE_COLUMNS,
    [phone, id, Boolean(patch.verified), patch.registeredName ?? null],
  );
  return mapSafe(result.rows[0]);
}

export async function removeStoredBeneficiary(phone, id) {
  const client = await getDatabase().connect();
  try {
    await client.query("BEGIN");
    const locked = await client.query(
      "SELECT id FROM xorpay_beneficiaries WHERE user_phone=$1 AND id=$2 FOR UPDATE",
      [phone, id],
    );
    if (!locked.rowCount) {
      await client.query("COMMIT");
      return { removed: false, reason: "not_found" };
    }
    const active = await client.query(
      "SELECT 1 FROM xorpay_payments WHERE user_phone=$1 AND beneficiary_id=$2 " +
      "AND state IN ('PAYMENT_PENDING','PAID','PAYOUT_QUEUED','PAYOUT_PROCESSING') LIMIT 1",
      [phone, id],
    );
    if (active.rowCount) {
      await client.query("COMMIT");
      return { removed: false, reason: "payment_in_progress" };
    }
    await client.query("DELETE FROM xorpay_beneficiaries WHERE user_phone=$1 AND id=$2", [phone, id]);
    await client.query("COMMIT");
    return { removed: true, reason: null };
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch {}
    throw error;
  } finally {
    client.release();
  }
}
