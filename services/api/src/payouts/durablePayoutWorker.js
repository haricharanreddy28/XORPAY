import crypto from "node:crypto";
import { makePayoutProvider } from "./payoutProvider.js";
import { makeRefundProvider } from "./cashfreeRefundProvider.js";
import {
  beginAutomaticRefund,
  claimPayoutJobs,
  completeAutomaticRefund,
  completePayoutSuccess,
  deadLetterPayoutJob,
  getPayoutJob,
  markPayoutProcessing,
  releasePayoutJob,
  updateRefundStatus,
} from "../payments/paymentRepository.js";

const REFUND_PENDING = new Set(["PENDING", "PENDING_APPROVAL", "ONHOLD"]);
const REFUND_FAILURE = new Set(["FAILED", "CANCELLED", "REJECTED"]);

function stableRefundId(paymentId) {
  return "rfnd" + crypto.createHash("sha256").update(paymentId).digest("hex").slice(0, 32);
}

function retryDelay(attempt) {
  return Math.min(3600, 5 * (2 ** Math.min(10, Math.max(0, attempt - 1))));
}

export class DurablePayoutWorker {
  constructor({ payoutProvider = makePayoutProvider(), refundProvider = makeRefundProvider(), batchSize = 10, leaseSeconds = 90 }) {
    this.payoutProvider = payoutProvider;
    this.refundProvider = refundProvider;
    this.batchSize = batchSize;
    this.leaseSeconds = leaseSeconds;
    this.running = false;
    this.timer = null;
  }

  async processJob(job) {
    const id = job.payment_id;
    const current = await getPayoutJob(id);
    if (!current) return deadLetterPayoutJob(id, "payment_missing");
    let { payment, beneficiary } = current;

    if (payment.state === "REFUND_INITIATED") {
      await this.processRefund(payment, job);
      return;
    }
    const newlyQueued = payment.state === "PAYOUT_QUEUED";
    if (newlyQueued) {
      if (!(await markPayoutProcessing(id))) return;
      payment = { ...payment, state: "PAYOUT_PROCESSING" };
    }
    if (payment.state !== "PAYOUT_PROCESSING") return deadLetterPayoutJob(id, "unexpected_payment_state");

    const reference = `xorpay_${id}`;
    let result = newlyQueued ? { status: "NOT_FOUND" } : await this.payoutProvider.getPayoutStatus(reference);
    if (result.status === "NOT_FOUND") {
      result = await this.payoutProvider.initiatePayout({
        amountMinor: payment.fee.payeeMinor,
        reference,
        beneficiary,
      });
    }
    if (result.status === "SUCCESS") {
      await completePayoutSuccess(id, { utr: result.utr, providerReference: result.providerReference });
      return;
    }
    if (result.status === "FAILED" && result.permanent) {
      const refundId = stableRefundId(id);
      const changed = await beginAutomaticRefund(id, refundId, result.failureReason || "payout_failed");
      if (changed || payment.refundId === refundId) {
        await this.processRefund({ ...payment, state: "REFUND_INITIATED", refundId }, job);
      }
      return;
    }
    await releasePayoutJob(id, { delaySeconds: retryDelay(job.attempt_count), errorCode: result.failureReason || "payout_pending" });
  }

  async processRefund(payment, job) {
    const refundId = payment.refundId || stableRefundId(payment.id);
    if (!this.refundProvider) {
      await releasePayoutJob(payment.id, { delaySeconds: 60, errorCode: "refund_provider_not_configured" });
      return;
    }
    let result = await this.refundProvider.getRefund(payment.id, refundId);
    if (result.status === "NOT_FOUND") {
      result = await this.refundProvider.createRefund({
        orderId: payment.id,
        refundId,
        amountMinor: payment.fee.youPayMinor,
      });
    }
    if (result.status === "SUCCESS") {
      await completeAutomaticRefund(payment.id, { refundArn: result.refundArn });
      return;
    }
    if (REFUND_FAILURE.has(result.status)) {
      await updateRefundStatus(payment.id, result.status);
      await deadLetterPayoutJob(payment.id, result.failureCode || "refund_requires_manual_review");
      return;
    }
    await updateRefundStatus(payment.id, REFUND_PENDING.has(result.status) ? result.status : "PENDING", result.refundArn);
    await releasePayoutJob(payment.id, { delaySeconds: retryDelay(job.attempt_count), errorCode: result.failureCode || "refund_pending" });
  }

  async runOnce() {
    if (this.running) return;
    this.running = true;
    try {
      const jobs = await claimPayoutJobs({ limit: this.batchSize, leaseSeconds: this.leaseSeconds });
      for (const job of jobs) {
        try {
          await this.processJob(job);
        } catch (error) {
          console.error("[payout-worker] job failed", job.payment_id, error?.code || "unknown");
          try { await releasePayoutJob(job.payment_id, { delaySeconds: retryDelay(job.attempt_count), errorCode: "worker_error" }); } catch {}
        }
      }
    } finally {
      this.running = false;
    }
  }

  start(intervalMs = 2_000) {
    if (this.timer) return;
    void this.runOnce();
    this.timer = setInterval(() => void this.runOnce(), intervalMs);
    this.timer.unref?.();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}

export function startDurablePayoutWorker(options) {
  const worker = new DurablePayoutWorker(options);
  worker.start();
  return worker;
}
