import { TxnState as T, transition } from "../payments/stateMachine.js";

// A payout request can have an ambiguous outcome after a network timeout.
// In that case we keep the transaction in PAYOUT_PROCESSING and query the
// provider by its stable transfer reference. Refund only after final failure.
export class PayoutProcessor {
  constructor({ provider, ledger, getTransaction, getBeneficiary }) {
    this.provider = provider;
    this.ledger = ledger;
    this.getTransaction = getTransaction;
    this.getBeneficiary = getBeneficiary;
  }

  _destination(txn) {
    if (!this.getBeneficiary || !txn.beneficiaryId) return null;
    return this.getBeneficiary(txn.phone, txn.beneficiaryId);
  }

  async processOne(txnId) {
    const txn = this.getTransaction(txnId);
    if (!txn) return null;
    if (txn.state !== T.PAYOUT_QUEUED) return txn.state;
    txn.state = transition(txn.state, T.PAYOUT_PROCESSING);

    let result;
    try {
      result = await this.provider.initiatePayout({
        amountMinor: txn.fee.payeeMinor,
        reference: txn.id,
        beneficiary: this._destination(txn),
      });
    } catch {
      // The provider may have accepted the transfer before the connection failed.
      txn.payoutReconciliationRequired = true;
      return txn.state;
    }
    return this._applyProviderResult(txn, result);
  }

  /** Reconcile a submitted payout. Safe to call repeatedly from a durable job. */
  async reconcileOne(txnId) {
    const txn = this.getTransaction(txnId);
    if (!txn || txn.state !== T.PAYOUT_PROCESSING) return txn?.state ?? null;
    let result;
    try {
      result = await this.provider.getPayoutStatus(txn.id);
    } catch {
      txn.payoutReconciliationRequired = true;
      return txn.state;
    }
    return this._applyProviderResult(txn, result);
  }

  _applyProviderResult(txn, result = {}) {
    const status = String(result.status || "PENDING").toUpperCase();
    if (status === "SUCCESS") {
      this.ledger.postPayout(txn.id, txn.fee.payeeMinor);
      txn.utr = result.utr ?? null;
      txn.providerReference = result.providerReference ?? txn.providerReference ?? null;
      txn.state = transition(txn.state, T.SUCCESS);
      txn.payoutReconciliationRequired = false;
      return txn.state;
    }
    if (status === "FAILED" && result.permanent === true) {
      txn.failureReason = result.failureReason ?? "payout_rejected";
      txn.state = transition(txn.state, T.FAILED);
      return this._autoRefund(txn);
    }
    // Pending, transient failure, and any unrecognised provider status stay
    // in processing. A scheduled reconciliation job must resolve them.
    txn.payoutReconciliationRequired = true;
    if (result.failureReason) txn.lastPayoutCheckError = result.failureReason;
    txn.providerReference = result.providerReference ?? txn.providerReference ?? null;
    return txn.state;
  }

  _autoRefund(txn) {
    txn.state = transition(txn.state, T.REFUND_INITIATED);
    this.ledger.postRefund(txn.id, txn.fee);
    txn.state = transition(txn.state, T.REFUNDED);
    return txn.state;
  }
}
