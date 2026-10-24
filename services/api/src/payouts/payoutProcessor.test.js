import { test } from "node:test";
import assert from "node:assert/strict";

import { PayoutProcessor } from "./payoutProcessor.js";
import { Ledger, Account } from "../ledger/ledger.js";
import { TxnState } from "../payments/stateMachine.js";
import { computeFee } from "../payments/fee.js";

function setup() {
  const fee = computeFee(1_000_000);
  const txn = { id: "t1", phone: "9", state: TxnState.PAYOUT_QUEUED, fee };
  const ledger = new Ledger();
  ledger.postPayment(txn.id, fee);
  const getTransaction = (id) => (id === txn.id ? txn : null);
  return { txn, ledger, getTransaction, fee };
}

test("successful payout -> SUCCESS, escrow nets to zero, UTR set", async () => {
  const { txn, ledger, getTransaction } = setup();
  const provider = { initiatePayout: async () => ({ status: "SUCCESS", utr: "UTR123" }) };
  const p = new PayoutProcessor({ provider, ledger, getTransaction });
  assert.equal(await p.processOne("t1"), TxnState.SUCCESS);
  assert.equal(txn.utr, "UTR123");
  assert.equal(ledger.balance(Account.ESCROW), 0);
});

test("ambiguous submission remains processing and reconciliation completes it", async () => {
  const { txn, ledger, getTransaction } = setup();
  let submissions = 0;
  let polls = 0;
  const provider = {
    initiatePayout: async () => { submissions++; return { status: "PENDING" }; },
    getPayoutStatus: async () => { polls++; return { status: "SUCCESS", utr: "UTR-OK" }; },
  };
  const p = new PayoutProcessor({ provider, ledger, getTransaction });
  assert.equal(await p.processOne("t1"), TxnState.PAYOUT_PROCESSING);
  assert.equal(await p.processOne("t1"), TxnState.PAYOUT_PROCESSING);
  assert.equal(submissions, 1, "must never resubmit while the first transfer is unresolved");
  assert.equal(await p.reconcileOne("t1"), TxnState.SUCCESS);
  assert.equal(polls, 1);
  assert.equal(txn.utr, "UTR-OK");
  assert.equal(ledger.balance(Account.ESCROW), 0);
});

test("transient or unknown status stays processing; no premature refund", async () => {
  const { ledger, getTransaction } = setup();
  const provider = {
    initiatePayout: async () => ({ status: "FAILED", permanent: false }),
    getPayoutStatus: async () => ({ status: "PENDING" }),
  };
  const p = new PayoutProcessor({ provider, ledger, getTransaction });
  assert.equal(await p.processOne("t1"), TxnState.PAYOUT_PROCESSING);
  assert.equal(await p.reconcileOne("t1"), TxnState.PAYOUT_PROCESSING);
  assert.equal(ledger.forTxn("t1").filter((e) => e.kind === "refund").length, 0);
});

test("provider-confirmed permanent failure -> auto-refund", async () => {
  const { ledger, getTransaction } = setup();
  const provider = { initiatePayout: async () => ({ status: "FAILED", permanent: true, failureReason: "invalid_account" }) };
  const p = new PayoutProcessor({ provider, ledger, getTransaction });
  assert.equal(await p.processOne("t1"), TxnState.REFUNDED);
  assert.equal(ledger.balance(Account.COLLECTIONS), 0);
  assert.equal(ledger.balance(Account.ESCROW), 0);
  assert.equal(ledger.balance(Account.FEE_REVENUE), 0);
});

test("does not act on a non-queued transaction", async () => {
  const { txn, ledger, getTransaction } = setup();
  txn.state = TxnState.SUCCESS;
  const provider = { initiatePayout: async () => ({ status: "SUCCESS" }) };
  const p = new PayoutProcessor({ provider, ledger, getTransaction });
  assert.equal(await p.processOne("t1"), TxnState.SUCCESS);
});
