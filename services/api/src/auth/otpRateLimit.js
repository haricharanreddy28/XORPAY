import crypto from "node:crypto";
import { databaseConfigured, getDatabase } from "../db/database.js";

const RESEND_MS = 30_000;
const WINDOW_MS = 60 * 60_000;
const MAX_PER_HOUR = 5;
const memory = new Map();

function keyHash(ip, phone) {
  return crypto.createHash("sha256").update(`xorpay:otp-rate:v1:${ip}:${phone}`).digest("hex");
}

/** Reserves an OTP send slot atomically. Production requires PostgreSQL durability. */
export async function reserveOtpSend(ip, phone, now = Date.now()) {
  if (!databaseConfigured()) {
    if (process.env.NODE_ENV === "production" || process.env.CASHFREE_ENV?.toUpperCase() === "PRODUCTION") {
      throw new Error("Durable OTP rate limiting requires PostgreSQL");
    }
    const key = keyHash(ip, phone);
    const record = memory.get(key) || { times: [], lastAt: 0 };
    record.times = record.times.filter((time) => now - time < WINDOW_MS);
    if (record.lastAt && now - record.lastAt < RESEND_MS) return false;
    if (record.times.length >= MAX_PER_HOUR) return false;
    record.times.push(now);
    record.lastAt = now;
    memory.set(key, record);
    return true;
  }
  const result = await getDatabase().query(
    `INSERT INTO xorpay_otp_rate_limits(key_hash,window_started_at,last_sent_at,send_count)
     VALUES($1,to_timestamp($2 / 1000.0),to_timestamp($2 / 1000.0),1)
     ON CONFLICT(key_hash) DO UPDATE SET
       window_started_at=CASE
         WHEN xorpay_otp_rate_limits.window_started_at <= to_timestamp($2 / 1000.0)-interval '1 hour'
         THEN to_timestamp($2 / 1000.0) ELSE xorpay_otp_rate_limits.window_started_at END,
       send_count=CASE
         WHEN xorpay_otp_rate_limits.window_started_at <= to_timestamp($2 / 1000.0)-interval '1 hour'
         THEN 1 ELSE xorpay_otp_rate_limits.send_count+1 END,
       last_sent_at=to_timestamp($2 / 1000.0)
     WHERE xorpay_otp_rate_limits.last_sent_at <= to_timestamp($2 / 1000.0)-interval '30 seconds'
       AND (xorpay_otp_rate_limits.window_started_at <= to_timestamp($2 / 1000.0)-interval '1 hour'
            OR xorpay_otp_rate_limits.send_count < 5)
     RETURNING key_hash`,
    [keyHash(ip, phone), now],
  );
  return result.rowCount === 1;
}
