import { TxnState as T, canTransition, transition } from "../payments/stateMachine.js";

// Processes a queued payout for one transaction (spec §5):
//   PAYOUT_QUEUED -> PAYOUT_PROCESSING -> SUCCESS
// On a permanent failure (or exhausted retries) it auto-refunds to source:
//   -> FAILED -> REFUND_INITIATED -> REFUNDED
//
// Dependencies are injected so this is unit-testable without the live store.
export class PayoutProcessor {
  constructor({ provider, ledger, getTransaction, getBeneficiary, maxAttempts = 3 }) {
    this.provider = provider;
    this.ledger = ledger;
    this.getTransaction = getTransaction;
    this.getBeneficiary = getBeneficiary;
    this.maxAttempts = maxAttempts;
  }

  _destination(txn) {
    if (!this.getBeneficiary || !txn.beneficiaryId) return null;
    return this.getBeneficiary(txn.phone, txn.beneficiaryId);
  }

  /** Run the payout once. Returns the final state. Safe to re-call: it only
   *  acts on a transaction that's still PAYOUT_QUEUED. */
  async processOne(txnId) {
    const txn = this.getTransaction(txnId);
    if (!txn) return null;
    if (!canTransition(txn.state, T.PAYOUT_PROCESSING)) return txn.state; // not queued

    txn.state = T.PAYOUT_PROCESSING;

    for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
      let r;
      try {
        r = await this.provider.initiatePayout({
          amountMinor: txn.fee.payeeMinor,
          reference: txn.id,
          beneficiary: this._destination(txn),
        });
      } catch (_) {
        r = { status: "FAILED", permanent: false }; // transient network error
      }

      if (r.status === "SUCCESS") {
        this.ledger.postPayout(txn.id, txn.fee.payeeMinor);
        txn.utr = r.utr ?? null;
        txn.state = T.SUCCESS;
        return T.SUCCESS;
      }
      if (r.status === "FAILED" && r.permanent) {
        txn.failureReason = r.failureReason ?? "payout_rejected";
        break; // don't retry a permanent failure
      }
      // PENDING or transient FAILED -> retry (last attempt falls through)
      if (attempt === this.maxAttempts) {
        txn.failureReason = r.failureReason ?? "payout_unconfirmed";
      }
    }

    return this._autoRefund(txn);
  }

  /** Fail the payout and refund the user to source (reverses the payment). */
  _autoRefund(txn) {
    txn.state = transition(txn.state, T.FAILED);
    txn.state = transition(txn.state, T.REFUND_INITIATED);
    this.ledger.postRefund(txn.id, txn.fee);
    txn.state = transition(txn.state, T.REFUNDED);
    return T.REFUNDED;
  }
}
