import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

import { connectDatabase, closeDatabase } from "../db/database.js";
import { createStoredBeneficiary, getStoredBeneficiary, listStoredBeneficiaries, removeStoredBeneficiary } from "../beneficiaries/beneficiaryRepository.js";
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

test("PostgreSQL serializes pilot reservations, encrypts beneficiaries, and settles webhooks atomically", { skip: !enabled }, async () => {
  const pool = await connectDatabase();
  const paymentA = makeId();
  const paymentB = makeId();
  const phone = "test-" + crypto.randomUUID();
  const webhookKey = makeId();
  const priorEncryptionKey = process.env.BENEFICIARY_ENCRYPTION_KEY;
  const priorEncryptionKeyId = process.env.BENEFICIARY_ENCRYPTION_KEY_ID;
  process.env.BENEFICIARY_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
  process.env.BENEFICIARY_ENCRYPTION_KEY_ID = "ci-test-v1";
  let beneficiaryId = null;
  try {
    const beneficiary = await createStoredBeneficiary(phone, {
      type: "bank",
      nickname: "Supplier",
      maskedAccount: "•• 6789",
      accountNumber: "000123456789",
      ifsc: "HDFC0001234",
      registeredName: "TEST SUPPLIER",
      verified: true,
    });
    beneficiaryId = beneficiary.id;
    const attempts = await Promise.allSettled([
      createPayment({ id: paymentA, phone, beneficiaryId, category: "vendor", fee: feeFor(3_000), limits }),
      createPayment({ id: paymentB, phone, beneficiaryId, category: "rent", fee: feeFor(3_000), limits }),
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

    assert.equal(beneficiary.registeredName, "TEST SUPPLIER");
    assert.equal("accountNumber" in beneficiary, false);

    const rawDestination = await pool.query("SELECT encrypted_destination FROM xorpay_beneficiaries WHERE id=$1", [beneficiaryId]);
    assert.equal(rawDestination.rows[0].encrypted_destination.includes(Buffer.from("000123456789")), false);
    const stored = await getStoredBeneficiary(phone, beneficiaryId);
    assert.equal(stored.accountNumber, "000123456789");
    assert.equal(stored.ifsc, "HDFC0001234");
    assert.equal(await getStoredBeneficiary("another-user", beneficiaryId), null);
    const listed = (await listStoredBeneficiaries(phone))[0];
    assert.equal(listed.maskedAccount, "•• 6789");
    assert.equal("accountNumber" in listed, false);
    assert.equal(await removeStoredBeneficiary("another-user", beneficiaryId).then((result) => result.removed), false);
    assert.equal((await removeStoredBeneficiary(phone, beneficiaryId)).reason, "payment_in_progress");
  } finally {
    await pool.query("DELETE FROM xorpay_ledger_entries WHERE payment_id = ANY($1::text[])", [[paymentA, paymentB]]);
    await pool.query("DELETE FROM xorpay_payout_outbox WHERE payment_id = ANY($1::text[])", [[paymentA, paymentB]]);
    await pool.query("DELETE FROM xorpay_webhook_events WHERE payment_id = ANY($1::text[])", [[paymentA, paymentB]]);
    await pool.query("DELETE FROM xorpay_payments WHERE id = ANY($1::text[])", [[paymentA, paymentB]]);
    if (beneficiaryId) await removeStoredBeneficiary(phone, beneficiaryId);
    if (priorEncryptionKey === undefined) delete process.env.BENEFICIARY_ENCRYPTION_KEY;
    else process.env.BENEFICIARY_ENCRYPTION_KEY = priorEncryptionKey;
    if (priorEncryptionKeyId === undefined) delete process.env.BENEFICIARY_ENCRYPTION_KEY_ID;
    else process.env.BENEFICIARY_ENCRYPTION_KEY_ID = priorEncryptionKeyId;
    await closeDatabase();
  }
});
