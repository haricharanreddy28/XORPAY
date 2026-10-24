// Admin reports (spec §4): settlement, GST-on-fees, fee revenue, over an
// optional date range. Pure + unit-tested. Amounts in paise.

const SETTLED = new Set(["SUCCESS"]);
const PAID = new Set(["PAID", "PAYOUT_QUEUED", "PAYOUT_PROCESSING", "SUCCESS", "REFUND_INITIATED", "REFUNDED"]);

function inRange(t, fromMs, toMs) {
  if (fromMs != null && t.createdAt < fromMs) return false;
  if (toMs != null && t.createdAt > toMs) return false;
  return true;
}

/**
 * @returns {{settlementMinor,gstOnFeesMinor,feeRevenueMinor,settledCount,gmvMinor}}
 */
export function buildReport(transactions, { fromMs = null, toMs = null } = {}) {
  const inWindow = transactions.filter((t) => inRange(t, fromMs, toMs));
  const paid = inWindow.filter((t) => PAID.has(t.state));
  const settled = inWindow.filter((t) => SETTLED.has(t.state));
  const sum = (arr, pick) => arr.reduce((s, t) => s + (pick(t) || 0), 0);

  return {
    // Money actually credited to beneficiaries (payout succeeded).
    settlementMinor: sum(settled, (t) => t.fee?.payeeMinor),
    settledCount: settled.length,
    // GST collected on platform fees (liability to remit).
    gstOnFeesMinor: sum(paid, (t) => t.fee?.gstMinor),
    // Platform fee revenue.
    feeRevenueMinor: sum(paid, (t) => t.fee?.feeMinor),
    // Gross merchandise value (total charged).
    gmvMinor: sum(paid, (t) => t.fee?.youPayMinor),
  };
}
