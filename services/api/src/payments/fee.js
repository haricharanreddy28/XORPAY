// Server-side fee engine (spec §9): platform fee % + 18% GST on the fee.
// Integer paise throughout. Mirrors the app's XFee so the quote the user saw
// matches what the server charges. Pure + unit-tested.

/**
 * @param {number} payeeMinor  what the beneficiary receives, in paise
 * @returns {{payeeMinor,feeMinor,gstMinor,chargeMinor,youPayMinor}}
 */
export function computeFee(payeeMinor, { feeRatePct = 2, gstOnFeePct = 18 } = {}) {
  const feeMinor = Math.round((payeeMinor * feeRatePct) / 100);
  const gstMinor = Math.round((feeMinor * gstOnFeePct) / 100);
  const chargeMinor = feeMinor + gstMinor;
  return {
    payeeMinor,
    feeMinor,
    gstMinor,
    chargeMinor, // fee + GST, the cost on top
    youPayMinor: payeeMinor + chargeMinor, // total charged to the user
  };
}
