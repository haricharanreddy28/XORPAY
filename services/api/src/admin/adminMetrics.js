// Admin KPI aggregation (spec §4). Pure + unit-tested. Works off the
// transaction records; amounts in paise.

const PAID_STATES = new Set([
  "PAID",
  "PAYOUT_QUEUED",
  "PAYOUT_PROCESSING",
  "SUCCESS",
  "REFUND_INITIATED",
  "REFUNDED",
]);

export function computeMetrics(transactions) {
  const paid = transactions.filter((t) => PAID_STATES.has(t.state));
  const success = transactions.filter((t) => t.state === "SUCCESS");

  const sum = (arr, pick) => arr.reduce((s, t) => s + (pick(t) || 0), 0);

  return {
    gmvMinor: sum(paid, (t) => t.fee?.youPayMinor),
    feeRevenueMinor: sum(paid, (t) => t.fee?.feeMinor),
    gstCollectedMinor: sum(paid, (t) => t.fee?.gstMinor),
    txnCount: transactions.length,
    successCount: success.length,
    successRate: transactions.length ? success.length / transactions.length : 0,
    activeUsers: new Set(transactions.map((t) => t.phone)).size,
  };
}
