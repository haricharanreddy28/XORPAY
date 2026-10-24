import crypto from "node:crypto";
import { test } from "node:test";
import assert from "node:assert/strict";
import { connectDatabase, closeDatabase } from "../db/database.js";
import {
  claimKycSession,
  createKycSession,
  finishKycSession,
  getKycProfile,
  updateKycProfile,
  updateKycReview,
} from "./kycRepository.js";

const enabled = Boolean(process.env.DATABASE_URL);

test("PostgreSQL stores KYC flags and encrypted identifiers and binds sessions to owners", { skip: !enabled }, async () => {
  const pool = await connectDatabase();
  const phone = "+91" + String(crypto.randomInt(6000000000, 9999999999));
  const pan = "ABCDE1234F";
  const gstin = "27ABCDE1234F1Z5";
  const session = "provider_" + crypto.randomUUID();
  const previousKey = process.env.KYC_ENCRYPTION_KEY;
  const previousId = process.env.KYC_ENCRYPTION_KEY_ID;
  process.env.KYC_ENCRYPTION_KEY = Buffer.alloc(32, 19).toString("base64");
  process.env.KYC_ENCRYPTION_KEY_ID = "test-ci";
  try {
    await updateKycProfile(phone, { panVerified: true, pan, gstVerified: true, gstin, legalName: "TEST BUSINESS" });
    const profile = await getKycProfile(phone);
    assert.equal(profile.panVerified, true);
    assert.equal(profile.gstVerified, true);
    assert.equal(profile.pan, "AB***34F");
    assert.equal(profile.gstin, "27***********Z5");
    assert.equal("panCiphertext" in profile, false);

    const raw = await pool.query(
      "SELECT pan_ciphertext,gstin_ciphertext FROM xorpay_kyc_profiles WHERE user_phone=$1",
      [phone],
    );
    assert.equal(raw.rows[0].pan_ciphertext.includes(Buffer.from(pan)), false);
    assert.equal(raw.rows[0].gstin_ciphertext.includes(Buffer.from(gstin)), false);

    await createKycSession(phone, "aadhaar", session);
    assert.equal(await claimKycSession("+919999999999", "aadhaar", session), false);
    assert.equal(await claimKycSession(phone, "aadhaar", session), true);
    assert.equal(await claimKycSession(phone, "aadhaar", session), false);
    await finishKycSession(phone, "aadhaar", session, { retry: true });
    assert.equal(await claimKycSession(phone, "aadhaar", session), true);
    await finishKycSession(phone, "aadhaar", session);
    assert.equal(await claimKycSession(phone, "aadhaar", session), false);

    assert.equal((await updateKycReview(phone, { reviewStatus: "approved", reviewReason: "verified" })).reviewStatus, "approved");
    assert.equal(await updateKycReview("+919111111111", { reviewStatus: "approved" }), null);
  } finally {
    await pool.query("DELETE FROM xorpay_kyc_sessions WHERE user_phone=$1", [phone]);
    await pool.query("DELETE FROM xorpay_kyc_profiles WHERE user_phone=$1", [phone]);
    if (previousKey === undefined) delete process.env.KYC_ENCRYPTION_KEY;
    else process.env.KYC_ENCRYPTION_KEY = previousKey;
    if (previousId === undefined) delete process.env.KYC_ENCRYPTION_KEY_ID;
    else process.env.KYC_ENCRYPTION_KEY_ID = previousId;
    await closeDatabase();
  }
});
