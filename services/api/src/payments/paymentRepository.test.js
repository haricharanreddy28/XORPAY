import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

import { connectDatabase, closeDatabase } from "../db/database.js";
import {
  createPayment,
  getPayment,
  getPaymentLedger,
  settleCashfreePayment,
} from "./paymentRepository.js";

const enabled = Boolean(process.env.DATABASE_URL);
const makeId = () => "it_" + crypto.randomUUID().replace(/-/g, "");
const feeFor = (payeeMinor) => ({ payeeMinor, feeMinor: 60, gstMinor: 11, youPayMinor: payeeMinor + 71 });
const limits = { perTxn: 5_000, daily: 5_000, monthly: 5_000 };

test("PostgreSQL serializes pilot cap reservation and atomically settles webhooks", { skip: !enabled }, async () => {
  const pool = await connectDatabase();
  const paymentA = makeId();
  const paymentB = makeId();
  const phone = "test-" + crypto.randomUUID();
  const webhookKey = makeId();
  try {
    const attempts = await Promise.allSettled([
      createPayment({ id: paymentA, phone, beneficiaryId: "bene-a", category: "vendor", fee: feeFor(3_000), limits }),
      createPayment({ id: paymentB, phone, beneficiaryId: "bene-b", category: "rent", fee: feeFor(3_000), limits }),
    ]);
    assert.equal(attempts.filter((item) => item.status === "fulfilled").length, 1);
    const rejected = attempts.find((item) => item.status === "rejected");
    assert.equal(rejected.reason.code, "PILOT_DAILY_LIMIT");
    const acceptedId = attempts[0].status === "fulfilled" ? paymentA : paymentB;

    const first = await settleCashfreePayment({
      orderId: acceptedId,
      eventKey: webhookKey,
      eventType: "PAYMENT_SUCCESS_WEBHOOK",
      payloadSha256: "a".repeat(64),
      isPaid: true,
    });
    assert.equal(first.payment.state, "PAYOUT_QUEUED");
    assert.equal((await getPayment(acceptedId)).state, "PAYOUT_QUEUED");

    const replay = await settleCashfreePayment({
      orderId: acceptedId,
      eventKey: webhookKey,
      eventType: "PAYMENT_SUCCESS_WEBHOOK",
      payloadSha256: "a".repeat(64),
      isPaid: true,
    });
    assert.equal(replay.duplicate, true);
    const ledger = await getPaymentLedger(acceptedId);
    assert.equal(ledger.length, 1);
    assert.equal(ledger[0].lines.reduce((sum, line) => sum + line.debitMinor, 0), 3_071);
    assert.equal(ledger[0].lines.reduce((sum, line) => sum + line.creditMinor, 0), 3_071);
    const jobs = await pool.query("SELECT payment_id FROM xorpay_payout_outbox WHERE payment_id=$1", [acceptedId]);
    assert.equal(jobs.rowCount, 1);
  } finally {
    await pool.query("DELETE FROM xorpay_ledger_entries WHERE payment_id = ANY($1::text[])", [[paymentA, paymentB]]);
    await pool.query("DELETE FROM xorpay_payout_outbox WHERE payment_id = ANY($1::text[])", [[paymentA, paymentB]]);
    await pool.query("DELETE FROM xorpay_webhook_events WHERE payment_id = ANY($1::text[])", [[paymentA, paymentB]]);
    await pool.query("DELETE FROM xorpay_payments WHERE id = ANY($1::text[])", [[paymentA, paymentB]]);
    await closeDatabase();
  }
});
