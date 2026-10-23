import { test } from "node:test";
import assert from "node:assert/strict";

import { PayoutProcessor } from "./payoutProcessor.js";
import { Ledger, Account } from "../ledger/ledger.js";
import { TxnState } from "../payments/stateMachine.js";
import { computeFee } from "../payments/fee.js";

// Build a transaction already settled (PAID -> queued) with its payment posted.
function setup() {
  const fee = computeFee(1_000_000);
  const txn = { id: "t1", phone: "9", state: TxnState.PAYOUT_QUEUED, fee };
  const ledger = new Ledger();
  ledger.postPayment(txn.id, fee); // payment already recorded
  const getTransaction = (id) => (id === txn.id ? txn : null);
  return { txn, ledger, getTransaction, fee };
}

test("successful payout -> SUCCESS, escrow nets to zero, UTR set", async () => {
  const { txn, ledger, getTransaction } = setup();
  const provider = {
    initiatePayout: async () => ({ status: "SUCCESS", utr: "UTR123" }),
  };
  const p = new PayoutProcessor({ provider, ledger, getTransaction });
  const state = await p.processOne("t1");

  assert.equal(state, TxnState.SUCCESS);
  assert.equal(txn.utr, "UTR123");
  assert.equal(ledger.balance(Account.ESCROW), 0); // released
});

test("transient failures then success retries to SUCCESS", async () => {
  const { ledger, getTransaction } = setup();
  let calls = 0;
  const provider = {
    initiatePayout: async () => {
      calls++;
      return calls < 3 ? { status: "FAILED", permanent: false } : { status: "SUCCESS", utr: "U" };
    },
  };
  const p = new PayoutProcessor({ provider, ledger, getTransaction });
  assert.equal(await p.processOne("t1"), TxnState.SUCCESS);
  assert.equal(calls, 3);
});

test("permanent failure -> auto-refund -> REFUNDED, all accounts net to zero", async () => {
  const { ledger, getTransaction } = setup();
  const provider = {
    initiatePayout: async () => ({ status: "FAILED", permanent: true, failureReason: "invalid_account" }),
  };
  const p = new PayoutProcessor({ provider, ledger, getTransaction });
  const state = await p.processOne("t1");

  assert.equal(state, TxnState.REFUNDED);
  assert.equal(ledger.balance(Account.COLLECTIONS), 0);
  assert.equal(ledger.balance(Account.ESCROW), 0);
  assert.equal(ledger.balance(Account.FEE_REVENUE), 0);
});

test("exhausted transient retries -> refund", async () => {
  const { ledger, getTransaction } = setup();
  const provider = { initiatePayout: async () => ({ status: "PENDING" }) };
  const p = new PayoutProcessor({ provider, ledger, getTransaction, maxAttempts: 2 });
  assert.equal(await p.processOne("t1"), TxnState.REFUNDED);
});

test("does not act on a non-queued transaction", async () => {
  const { txn, ledger, getTransaction } = setup();
  txn.state = TxnState.SUCCESS; // already terminal
  const provider = { initiatePayout: async () => ({ status: "SUCCESS" }) };
  const p = new PayoutProcessor({ provider, ledger, getTransaction });
  assert.equal(await p.processOne("t1"), TxnState.SUCCESS);
});
