// TDS (tax deducted at source) math for invoice payments (spec §3.4.6:
// "Full payment" vs "Payment with TDS deduction"). Integer paise, pure,
// unit-tested. The default rate is illustrative — real rates depend on the
// section (194C, 194J, …) and should be set per supplier/category.

export function computeTds(amountMinor, ratePct = 2) {
  const tdsMinor = Math.round((amountMinor * ratePct) / 100);
  return { tdsMinor, netMinor: amountMinor - tdsMinor };
}

/**
 * Summarise a selection of invoices for payment.
 * @returns {{count,grossMinor,tdsMinor,netMinor}}
 */
export function summarizeInvoices(invoices, { withTds = false, ratePct = 2 } = {}) {
  let grossMinor = 0;
  let tdsMinor = 0;
  for (const inv of invoices) {
    grossMinor += inv.amountMinor;
    if (withTds) tdsMinor += computeTds(inv.amountMinor, ratePct).tdsMinor;
  }
  return { count: invoices.length, grossMinor, tdsMinor, netMinor: grossMinor - tdsMinor };
}
