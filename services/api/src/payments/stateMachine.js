// Transaction state machine (spec §5). Guards every status change so a
// transaction can only move through legal transitions. Pure + unit-tested.

export const TxnState = Object.freeze({
  CREATED: "CREATED",
  PAYMENT_PENDING: "PAYMENT_PENDING",
  PAID: "PAID",
  PAYOUT_QUEUED: "PAYOUT_QUEUED",
  PAYOUT_PROCESSING: "PAYOUT_PROCESSING",
  SUCCESS: "SUCCESS",
  FAILED: "FAILED",
  REFUND_INITIATED: "REFUND_INITIATED",
  REFUNDED: "REFUNDED",
});

const T = TxnState;

/** Allowed next states from each state. Terminal states have none. */
export const TRANSITIONS = Object.freeze({
  [T.CREATED]: [T.PAYMENT_PENDING, T.FAILED],
  [T.PAYMENT_PENDING]: [T.PAID, T.FAILED],
  [T.PAID]: [T.PAYOUT_QUEUED, T.REFUND_INITIATED],
  [T.PAYOUT_QUEUED]: [T.PAYOUT_PROCESSING, T.FAILED],
  [T.PAYOUT_PROCESSING]: [T.SUCCESS, T.FAILED],
  [T.SUCCESS]: [],
  [T.FAILED]: [T.REFUND_INITIATED],
  [T.REFUND_INITIATED]: [T.REFUNDED],
  [T.REFUNDED]: [],
});

export function canTransition(from, to) {
  return (TRANSITIONS[from] ?? []).includes(to);
}

/** Returns `to` if the transition is legal, else throws. */
export function transition(from, to) {
  if (!canTransition(from, to)) {
    throw new Error(`illegal transition ${from} -> ${to}`);
  }
  return to;
}

export function isTerminal(state) {
  return (TRANSITIONS[state] ?? []).length === 0;
}
