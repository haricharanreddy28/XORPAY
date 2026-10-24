import crypto from "node:crypto";
import { getDatabase } from "../db/database.js";

const COLUMNS = "id,user_phone,beneficiary_id,category,currency,payee_minor,fee_minor,gst_minor,total_minor,state,cashfree_session_id,utr,failure_code,payout_provider_reference,created_at,updated_at";

function mapPayment(row) {
  if (!row) return null;
  return {
    id: row.id,
    phone: row.user_phone,
    beneficiaryId: row.beneficiary_id,
    category: row.category,
    currency: row.currency,
    fee: { payeeMinor: Number(row.payee_minor), feeMinor: Number(row.fee_minor), gstMinor: Number(row.gst_minor), youPayMinor: Number(row.total_minor) },
    state: row.state,
    paymentSessionId: row.cashfree_session_id,
    utr: row.utr,
    failureReason: row.failure_code,
    providerReference: row.payout_provider_reference,
    createdAt: row.created_at.getTime(),
    updatedAt: row.updated_at.getTime(),
  };
}

export async function createPayment({ id, phone, beneficiaryId, category, currency = "INR", fee }) {
  const amounts = [fee?.payeeMinor, fee?.feeMinor, fee?.gstMinor, fee?.youPayMinor];
  if (!amounts.every(Number.isSafeInteger) || fee.payeeMinor <= 0 || fee.feeMinor < 0 || fee.gstMinor < 0 || fee.youPayMinor !== fee.payeeMinor + fee.feeMinor + fee.gstMinor) {
    throw new TypeError("payment amounts must be safe integer minor units and balanced");
  }
  const result = await getDatabase().query(
    "INSERT INTO xorpay_payments (id,user_phone,beneficiary_id,category,currency,payee_minor,fee_minor,gst_minor,total_minor,state) " +
    "VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'PAYMENT_PENDING') ON CONFLICT (id) DO NOTHING RETURNING " + COLUMNS,
    [id, phone, beneficiaryId, category, currency, fee.payeeMinor, fee.feeMinor, fee.gstMinor, fee.youPayMinor],
  );
  if (result.rowCount) return mapPayment(result.rows[0]);
  const existing = await getPayment(id);
  if (!existing || existing.phone !== phone || existing.fee.payeeMinor !== fee.payeeMinor) throw new Error("payment_id_conflict");
  return existing;
}

export async function setPaymentSession(id, sessionId) {
  const result = await getDatabase().query("UPDATE xorpay_payments SET cashfree_session_id=$2,updated_at=now() WHERE id=$1 AND state='PAYMENT_PENDING' RETURNING id", [id, sessionId]);
  return result.rowCount === 1;
}

export async function failPaymentBeforeCollection(id, code) {
  await getDatabase().query("UPDATE xorpay_payments SET state='FAILED',failure_code=$2,updated_at=now() WHERE id=$1 AND state='PAYMENT_PENDING'", [id, String(code || "provider_error").slice(0, 120)]);
}

export async function getPayment(id) {
  const result = await getDatabase().query("SELECT " + COLUMNS + " FROM xorpay_payments WHERE id=$1", [id]);
  return mapPayment(result.rows[0]);
}

export async function listPayments(phone) {
  const result = await getDatabase().query("SELECT " + COLUMNS + " FROM xorpay_payments WHERE user_phone=$1 ORDER BY created_at DESC LIMIT 500", [phone]);
  return result.rows.map(mapPayment);
}

function ledgerLines(fee) {
  if (fee.youPayMinor !== fee.payeeMinor + fee.feeMinor + fee.gstMinor) throw new Error("unbalanced_payment_ledger");
  return [["collections",fee.youPayMinor,0],["escrow",0,fee.payeeMinor],["fee_revenue",0,fee.feeMinor],["gst_payable",0,fee.gstMinor]];
}

async function insertLedgerLines(client, paymentId, kind, lines) {
  for (let i = 0; i < lines.length; i++) {
    const [account,debit,credit] = lines[i];
    await client.query("INSERT INTO xorpay_ledger_entries(payment_id,entry_kind,line_number,account,debit_minor,credit_minor) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (payment_id,entry_kind,line_number) DO NOTHING", [paymentId,kind,i+1,account,debit,credit]);
  }
}

/** Atomically records a signed webhook, balanced collection ledger and payout job. */
export async function settleCashfreePayment({ orderId, eventKey, eventType, payloadSha256, isPaid }) {
  const client = await getDatabase().connect();
  try {
    await client.query("BEGIN");
    const event = await client.query("INSERT INTO xorpay_webhook_events(provider,event_key,event_type,payment_id,payload_sha256) VALUES ('cashfree',$1,$2,$3,$4) ON CONFLICT (provider,event_key) DO NOTHING RETURNING event_key", [eventKey,String(eventType || "unknown").slice(0,120),orderId,payloadSha256]);
    if (!event.rowCount) { await client.query("COMMIT"); return { duplicate: true, payment: null }; }

    const locked = await client.query("SELECT " + COLUMNS + " FROM xorpay_payments WHERE id=$1 FOR UPDATE", [orderId]);
    const payment = mapPayment(locked.rows[0]);
    if (!payment) {
      await client.query("UPDATE xorpay_webhook_events SET processed_at=now(),processing_error='unknown_order' WHERE provider='cashfree' AND event_key=$1", [eventKey]);
      await client.query("COMMIT");
      return { duplicate: false, unknownOrder: true, payment: null };
    }
    if (isPaid && payment.state === "PAYMENT_PENDING") {
      await insertLedgerLines(client, orderId, "payment", ledgerLines(payment.fee));
      await client.query("UPDATE xorpay_payments SET state='PAYOUT_QUEUED',updated_at=now() WHERE id=$1 AND state='PAYMENT_PENDING'", [orderId]);
      await client.query("INSERT INTO xorpay_payout_outbox(payment_id) VALUES ($1) ON CONFLICT (payment_id) DO NOTHING", [orderId]);
      payment.state = "PAYOUT_QUEUED";
    }
    await client.query("UPDATE xorpay_webhook_events SET processed_at=now() WHERE provider='cashfree' AND event_key=$1", [eventKey]);
    await client.query("COMMIT");
    return { duplicate: false, payment };
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch {}
    throw error;
  } finally { client.release(); }
}

/** Leases payout rows with SKIP LOCKED so API instances cannot claim one job twice. */
export async function claimPayoutJobs({ limit = 10, leaseSeconds = 60 } = {}) {
  const safeLimit = Math.min(100, Math.max(1, Math.floor(limit)));
  const safeLease = Math.min(300, Math.max(5, Math.floor(leaseSeconds)));
  const result = await getDatabase().query(
    "WITH ready AS (SELECT payment_id FROM xorpay_payout_outbox WHERE available_at <= now() AND (state='READY' OR (state='LEASED' AND lease_until < now())) ORDER BY available_at,created_at FOR UPDATE SKIP LOCKED LIMIT $1) " +
    "UPDATE xorpay_payout_outbox o SET state='LEASED',attempt_count=o.attempt_count+1,lease_until=now()+($2 * interval '1 second'),updated_at=now() FROM ready WHERE o.payment_id=ready.payment_id RETURNING o.payment_id,o.attempt_count",
    [safeLimit,safeLease],
  );
  return result.rows;
}

export function sha256Hex(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}
