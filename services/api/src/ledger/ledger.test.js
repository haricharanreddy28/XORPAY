import { test } from "node:test";
import assert from "node:assert/strict";

import { Ledger, Account } from "./ledger.js";
import { computeFee } from "../payments/fee.js";

test("postPayment is balanced and splits correctly", () => {
  const l = new Ledger();
  const f = computeFee(1_000_000); // ₹10k payee
  l.postPayment("t1", f);

  assert.equal(l.balance(Account.COLLECTIONS), f.youPayMinor);
  assert.equal(l.balance(Account.ESCROW), -f.payeeMinor); // owed out
  assert.equal(l.balance(Account.FEE_REVENUE), -f.feeMinor);
  assert.equal(l.balance(Account.GST_PAYABLE), -f.gstMinor);
});

test("escrow nets to zero after payout", () => {
  const l = new Ledger();
  const f = computeFee(1_000_000);
  l.postPayment("t1", f);
  l.postPayout("t1", f.payeeMinor);
  assert.equal(l.balance(Account.ESCROW), 0);
  assert.equal(l.balance(Account.PAYOUTS), -f.payeeMinor);
});

test("refund reverses the payment — all accounts net to zero", () => {
  const l = new Ledger();
  const f = computeFee(1_000_000);
  l.postPayment("t2", f);
  l.postRefund("t2", f);
  assert.equal(l.balance(Account.COLLECTIONS), 0);
  assert.equal(l.balance(Account.ESCROW), 0);
  assert.equal(l.balance(Account.FEE_REVENUE), 0);
  assert.equal(l.balance(Account.GST_PAYABLE), 0);
});

test("unbalanced post throws", () => {
  const l = new Ledger();
  assert.throws(() =>
    l.post("bad", [
      { account: Account.COLLECTIONS, debitMinor: 100 },
      { account: Account.ESCROW, creditMinor: 90 },
    ]),
  );
});

test("forTxn returns that transaction's entries", () => {
  const l = new Ledger();
  const f = computeFee(500_000);
  l.postPayment("t9", f);
  l.postPayout("t9", f.payeeMinor);
  assert.equal(l.forTxn("t9").length, 2);
});
