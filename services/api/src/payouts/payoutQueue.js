// In-process payout queue for dev. It schedules the PayoutProcessor to run a
// queued transaction shortly after it's enqueued. In production this is a
// durable queue (BullMQ/Redis) with retries + a dead-letter queue — the
// processor logic stays the same; only the scheduling changes.

import { ledger, getTransaction, getBeneficiary } from "../store.js";
import { makePayoutProvider } from "./payoutProvider.js";
import { PayoutProcessor } from "./payoutProcessor.js";

export const processor = new PayoutProcessor({
  provider: makePayoutProvider(),
  ledger,
  getTransaction,
  getBeneficiary,
});

/** Schedule a queued transaction's payout. */
export function enqueuePayout(txnId) {
  setTimeout(() => {
    processor
      .processOne(txnId)
      .then((state) => console.log(`[payout] ${txnId} -> ${state}`))
      .catch((e) => console.error("[payout] error", e));
  }, 300);
}
