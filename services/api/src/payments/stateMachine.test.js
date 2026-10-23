import { test } from "node:test";
import assert from "node:assert/strict";

import { TxnState, canTransition, transition, isTerminal } from "./stateMachine.js";

test("legal forward path", () => {
  assert.ok(canTransition(TxnState.CREATED, TxnState.PAYMENT_PENDING));
  assert.ok(canTransition(TxnState.PAYMENT_PENDING, TxnState.PAID));
  assert.ok(canTransition(TxnState.PAID, TxnState.PAYOUT_QUEUED));
  assert.ok(canTransition(TxnState.PAYOUT_PROCESSING, TxnState.SUCCESS));
});

test("cannot skip straight to SUCCESS", () => {
  assert.equal(canTransition(TxnState.PAID, TxnState.SUCCESS), false);
  assert.throws(() => transition(TxnState.PAID, TxnState.SUCCESS));
});

test("refund path", () => {
  assert.ok(canTransition(TxnState.FAILED, TxnState.REFUND_INITIATED));
  assert.ok(canTransition(TxnState.REFUND_INITIATED, TxnState.REFUNDED));
  assert.ok(canTransition(TxnState.PAID, TxnState.REFUND_INITIATED));
});

test("terminal states", () => {
  assert.ok(isTerminal(TxnState.SUCCESS));
  assert.ok(isTerminal(TxnState.REFUNDED));
  assert.equal(isTerminal(TxnState.PAID), false);
});

test("transition returns target on success", () => {
  assert.equal(
    transition(TxnState.CREATED, TxnState.PAYMENT_PENDING),
    TxnState.PAYMENT_PENDING,
  );
});
