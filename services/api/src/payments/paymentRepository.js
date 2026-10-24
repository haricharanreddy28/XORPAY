import crypto from "node:crypto";
import { getDatabase } from "../db/database.js";

const COLUMNS = "id,user_phone,beneficiary_id,category,currency,payee_minor,fee_minor,gst_minor,total_minor,state,cashfree_session_id,utr,failure_code,payout_provider_reference,refund_id,refund_arn,refund_status,created_at,updated_at";

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
    refundId: row.refund_id,
    refundArn: row.refund_arn,
    refundStatus: row.refund_status,
    createdAt: row.created_at.getTime(),
    updatedAt: row.updated_at.getTime(),
  };
}

export async function createPayment({ id, phone, beneficiaryId, category, currency = "INR", fee, limits }) {
  const amounts = [fee?.payeeMinor, fee?.feeMinor, fee?.gstMinor, fee?.youPayMinor];
  if (!amounts.every(Number.isSafeInteger) || fee.payeeMinor <= 0 || fee.feeMinor < 0 || fee.gstMinor < 0 || fee.youPayMinor !== fee.payeeMinor + fee.feeMinor + fee.gstMinor) {
    throw new TypeError("payment amounts must be safe integer minor units and balanced");
  }
  if (!limits || ![limits.perTxn, limits.daily, limits.monthly].every(Number.isSafeInteger)) {
    throw new TypeError("effective payment limits are required");
  }
  if (fee.payeeMinor > limits.perTxn) {
    const error = new Error("pilot_per_transaction_limit");
    error.code = "PILOT_PER_TRANSACTION_LIMIT";
    throw error;
  }

  const client = await getDatabase().connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [phone]);
    if (["vendor", "rent"].includes(String(category).toLowerCase())) {
      const beneficiary = await client.query(
        "SELECT id FROM xorpay_beneficiaries WHERE user_phone=$1 AND id=$2 AND verified=true FOR UPDATE",
        [phone, beneficiaryId],
      );
      if (!beneficiary.rowCount) {
        const error = new Error("verified_beneficiary_required");
        error.code = "BENEFICIARY_NOT_VERIFIED";
        throw error;
      }
    }
    if (["vendor", "rent"].includes(String(category).toLowerCase())) {
      const beneficiary = await client.query(
        "SELECT id FROM xorpay_beneficiaries WHERE user_phone=$1 AND id=$2 AND verified=true FOR UPDATE",
        [phone, beneficiaryId],
      );
      if (!beneficiary.rowCount) {
        const error = new Error("verified_beneficiary_required");
        error.code = "BENEFICIARY_NOT_VERIFIED";
        throw error;
      }
    }
    const spend = await client.query(
      "SELECT COALESCE(SUM(payee_minor) FILTER (WHERE created_at >= date_trunc('day',now() AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'Asia/Kolkata'),0) AS today, " +
      "COALESCE(SUM(payee_minor) FILTER (WHERE created_at >= date_trunc('month',now() AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'Asia/Kolkata'),0) AS month " +
      "FROM xorpay_payments WHERE user_phone=$1 AND state IN ('PAYMENT_PENDING','PAID','PAYOUT_QUEUED','PAYOUT_PROCESSING','SUCCESS')",
      [phone],
    );
    if (Number(spend.rows[0].today) + fee.payeeMinor > limits.daily) {
      const error = new Error("pilot_daily_limit");
      error.code = "PILOT_DAILY_LIMIT";
      throw error;
    }
    if (Number(spend.rows[0].month) + fee.payeeMinor > limits.monthly) {
      const error = new Error("pilot_monthly_limit");
      error.code = "PILOT_MONTHLY_LIMIT";
      throw error;
    }

    const result = await client.query(
      "INSERT INTO xorpay_payments (id,user_phone,beneficiary_id,category,currency,payee_minor,fee_minor,gst_minor,total_minor,state) " +
      "VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'PAYMENT_PENDING') ON CONFLICT (id) DO NOTHING RETURNING " + COLUMNS,
      [id, phone, beneficiaryId, category, currency, fee.payeeMinor, fee.feeMinor, fee.gstMinor, fee.youPayMinor],
    );
    if (result.rowCount) {
      await client.query("COMMIT");
      return mapPayment(result.rows[0]);
    }
    const existingResult = await client.query("SELECT " + COLUMNS + " FROM xorpay_payments WHERE id=$1", [id]);
    const existing = mapPayment(existingResult.rows[0]);
    if (!existing || existing.phone !== phone || existing.fee.payeeMinor !== fee.payeeMinor) throw new Error("payment_id_conflict");
    await client.query("COMMIT");
    return existing;
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch {}
    throw error;
  } finally {
    client.release();
  }
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
    if (debit === 0 && credit === 0) continue;
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


export async function getPayoutJob(paymentId) {
  const payment = await getPayment(paymentId);
  if (!payment) return null;
  const { getStoredBeneficiary } = await import("../beneficiaries/beneficiaryRepository.js");
  const beneficiary = payment.beneficiaryId
    ? await getStoredBeneficiary(payment.phone, payment.beneficiaryId)
    : null;
  return { payment, beneficiary };
}

export async function markPayoutProcessing(paymentId) {
  const result = await getDatabase().query(
    "UPDATE xorpay_payments SET state='PAYOUT_PROCESSING',updated_at=now() WHERE id=$1 AND state='PAYOUT_QUEUED' RETURNING id",
    [paymentId],
  );
  return result.rowCount === 1;
}

export async function completePayoutSuccess(paymentId, { utr = null, providerReference = null } = {}) {
  const client = await getDatabase().connect();
  try {
    await client.query("BEGIN");
    const result = await client.query("SELECT payee_minor,state FROM xorpay_payments WHERE id=$1 FOR UPDATE", [paymentId]);
    if (!result.rowCount || result.rows[0].state !== "PAYOUT_PROCESSING") {
      await client.query("COMMIT");
      return false;
    }
    const amount = Number(result.rows[0].payee_minor);
    await insertLedgerLines(client, paymentId, "payout", [["escrow", amount, 0], ["payouts", 0, amount]]);
    await client.query(
      "UPDATE xorpay_payments SET state='SUCCESS',utr=$2,payout_provider_reference=COALESCE($3,payout_provider_reference),updated_at=now() WHERE id=$1",
      [paymentId, utr, providerReference],
    );
    await client.query("UPDATE xorpay_payout_outbox SET state='DONE',lease_until=NULL,last_error_code=NULL,updated_at=now() WHERE payment_id=$1", [paymentId]);
    await client.query("COMMIT");
    return true;
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch {}
    throw error;
  } finally { client.release(); }
}

export async function beginAutomaticRefund(paymentId, refundId, failureCode) {
  const result = await getDatabase().query(
    "UPDATE xorpay_payments SET state='REFUND_INITIATED',refund_id=$2,refund_status='PENDING',failure_code=$3,updated_at=now() " +
    "WHERE id=$1 AND state='PAYOUT_PROCESSING' RETURNING id",
    [paymentId, refundId, String(failureCode || "payout_failed").slice(0, 120)],
  );
  return result.rowCount === 1;
}

export async function updateRefundStatus(paymentId, status, refundArn = null) {
  await getDatabase().query(
    "UPDATE xorpay_payments SET refund_status=$2,refund_arn=COALESCE($3,refund_arn),updated_at=now() WHERE id=$1 AND state='REFUND_INITIATED'",
    [paymentId, String(status || "PENDING").slice(0, 40), refundArn],
  );
}

export async function completeAutomaticRefund(paymentId, { refundArn = null } = {}) {
  const client = await getDatabase().connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(
      "SELECT payee_minor,fee_minor,gst_minor,total_minor,state FROM xorpay_payments WHERE id=$1 FOR UPDATE",
      [paymentId],
    );
    if (!result.rowCount || result.rows[0].state !== "REFUND_INITIATED") {
      await client.query("COMMIT");
      return false;
    }
    const row = result.rows[0];
    await insertLedgerLines(client, paymentId, "refund", [
      ["escrow", Number(row.payee_minor), 0],
      ["fee_revenue", Number(row.fee_minor), 0],
      ["gst_payable", Number(row.gst_minor), 0],
      ["collections", 0, Number(row.total_minor)],
    ]);
    await client.query(
      "UPDATE xorpay_payments SET state='REFUNDED',refund_status='SUCCESS',refund_arn=COALESCE($2,refund_arn),updated_at=now() WHERE id=$1",
      [paymentId, refundArn],
    );
    await client.query("UPDATE xorpay_payout_outbox SET state='DONE',lease_until=NULL,last_error_code=NULL,updated_at=now() WHERE payment_id=$1", [paymentId]);
    await client.query("COMMIT");
    return true;
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch {}
    throw error;
  } finally { client.release(); }
}

export async function releasePayoutJob(paymentId, { delaySeconds = 30, errorCode = null } = {}) {
  const delay = Math.min(86_400, Math.max(1, Math.floor(delaySeconds)));
  await getDatabase().query(
    "UPDATE xorpay_payout_outbox SET state='READY',available_at=now()+($2 * interval '1 second'),lease_until=NULL,last_error_code=$3,updated_at=now() WHERE payment_id=$1 AND state='LEASED'",
    [paymentId, delay, errorCode ? String(errorCode).slice(0, 120) : null],
  );
}

export async function deadLetterPayoutJob(paymentId, errorCode) {
  await getDatabase().query(
    "UPDATE xorpay_payout_outbox SET state='DEAD',lease_until=NULL,last_error_code=$2,updated_at=now() WHERE payment_id=$1 AND state='LEASED'",
    [paymentId, String(errorCode || "manual_review_required").slice(0, 120)],
  );
}

export function sha256Hex(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}


export async function getPaymentLedger(paymentId) {
  const result = await getDatabase().query(
    "SELECT entry_kind,account,debit_minor,credit_minor,created_at FROM xorpay_ledger_entries WHERE payment_id=$1 ORDER BY id",
    [paymentId],
  );
  const groups = new Map();
  for (const row of result.rows) {
    let entry = groups.get(row.entry_kind);
    if (!entry) {
      entry = { txnId: paymentId, kind: row.entry_kind, lines: [], at: row.created_at.getTime() };
      groups.set(row.entry_kind, entry);
    }
    entry.lines.push({ account: row.account, debitMinor: Number(row.debit_minor), creditMinor: Number(row.credit_minor) });
  }
  return [...groups.values()];
}

export async function getPaymentSpend(phone) {
  const result = await getDatabase().query(
    "SELECT " +
    "COALESCE(SUM(payee_minor) FILTER (WHERE created_at >= date_trunc('day', now() AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'Asia/Kolkata'),0) AS today, " +
    "COALESCE(SUM(payee_minor) FILTER (WHERE created_at >= date_trunc('month', now() AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'Asia/Kolkata'),0) AS month " +
    "FROM xorpay_payments WHERE user_phone=$1 AND state IN ('PAYMENT_PENDING','PAID','PAYOUT_QUEUED','PAYOUT_PROCESSING','SUCCESS')",
    [phone],
  );
  return { spentTodayMinor: Number(result.rows[0].today), spentMonthMinor: Number(result.rows[0].month) };
}
