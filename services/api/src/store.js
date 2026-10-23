// In-memory stores (reset on restart). Replace with Postgres/Prisma in the
// NestJS migration (Phase 4). Kept in one place so routes share state.

/** order_id -> { amountMinor, phone, status } */
export const orders = new Map();

/** phone -> kyc record */
const kyc = new Map();

const emptyKyc = () => ({
  panVerified: false,
  aadhaarVerified: false,
  selfieVerified: false,
  gstVerified: false,
  pan: null,
  gstin: null,
  legalName: null,
});

export function getKyc(phone) {
  return kyc.get(phone) ?? emptyKyc();
}

export function updateKyc(phone, patch) {
  const next = { ...getKyc(phone), ...patch };
  kyc.set(phone, next);
  return next;
}

/**
 * Spend so far for a user. Stubbed at 0 until the ledger lands (Phase 4);
 * the limits engine already accepts these, so wiring real numbers later is
 * a one-line change here.
 */
export function getSpend(_phone) {
  return { spentTodayMinor: 0, spentMonthMinor: 0 };
}
