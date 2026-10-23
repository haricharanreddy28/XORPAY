// Double-entry ledger (spec §5). Every money movement is recorded as a
// balanced entry (sum of debits == sum of credits). Integer paise. In-memory
// for dev; the same shape maps to a Postgres `ledger_entries` table later.
//
// Account balance convention: balance = debits - credits
//   - asset accounts (collections, payouts bank) are debit-positive
//   - escrow / fee_revenue / gst_payable are credit-positive (show negative)

export const Account = Object.freeze({
  COLLECTIONS: "collections", // money collected from users (asset in)
  ESCROW: "escrow", // held, owed to beneficiaries
  FEE_REVENUE: "fee_revenue", // platform fee earned
  GST_PAYABLE: "gst_payable", // GST collected, owed to govt
  PAYOUTS: "payouts", // money paid out to beneficiaries (asset out)
});

export class Ledger {
  constructor() {
    this.entries = [];
  }

  /** Post a balanced entry. Throws if debits != credits. */
  post(txnId, lines, kind = "entry") {
    const debit = lines.reduce((s, l) => s + (l.debitMinor ?? 0), 0);
    const credit = lines.reduce((s, l) => s + (l.creditMinor ?? 0), 0);
    if (debit !== credit) {
      throw new Error(`unbalanced entry for ${txnId}: ${debit} != ${credit}`);
    }
    this.entries.push({ txnId, kind, lines, at: Date.now() });
  }

  /** Collection: user pays youPay, split into escrow + fee + GST. */
  postPayment(txnId, { payeeMinor, feeMinor, gstMinor, youPayMinor }) {
    this.post(
      txnId,
      [
        { account: Account.COLLECTIONS, debitMinor: youPayMinor },
        { account: Account.ESCROW, creditMinor: payeeMinor },
        { account: Account.FEE_REVENUE, creditMinor: feeMinor },
        { account: Account.GST_PAYABLE, creditMinor: gstMinor },
      ],
      "payment",
    );
  }

  /** Payout: release escrow to the beneficiary. */
  postPayout(txnId, payeeMinor) {
    this.post(
      txnId,
      [
        { account: Account.ESCROW, debitMinor: payeeMinor },
        { account: Account.PAYOUTS, creditMinor: payeeMinor },
      ],
      "payout",
    );
  }

  balance(account) {
    return this.entries
      .flatMap((e) => e.lines)
      .filter((l) => l.account === account)
      .reduce((s, l) => s + (l.debitMinor ?? 0) - (l.creditMinor ?? 0), 0);
  }

  /** All entries for one transaction. */
  forTxn(txnId) {
    return this.entries.filter((e) => e.txnId === txnId);
  }
}
