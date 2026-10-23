// Limits engine (spec §2 tiers, §3.4 limits). Pure and dependency-free so it
// is unit-testable and will port directly into the NestJS service.
//
// All amounts are in MINOR units (paise) to keep money math integer-exact.

/** KYC tiers, lowest to highest capability. */
export const KycTier = Object.freeze({
  MINIMAL: "MINIMAL", // phone only — cannot pay yet
  PAN: "PAN", // PAN verified
  FULL: "FULL", // PAN + Aadhaar + selfie
  GST: "GST", // FULL + GSTIN
});

const L = (perTxn, daily, monthly) => ({ perTxn, daily, monthly });

/** Default caps per tier, in paise. Tune / move to config as needed. */
export const TIER_LIMITS = Object.freeze({
  [KycTier.MINIMAL]: L(0, 0, 0),
  [KycTier.PAN]: L(2_500_000, 5_000_000, 20_000_000), // ₹25k / ₹50k / ₹2L
  [KycTier.FULL]: L(10_000_000, 20_000_000, 100_000_000), // ₹1L / ₹2L / ₹10L
  [KycTier.GST]: L(50_000_000, 100_000_000, 500_000_000), // ₹5L / ₹10L / ₹50L
});

/** Payments to an UNVERIFIED beneficiary are capped low regardless of tier. */
export const UNVERIFIED_PAYEE_PER_TXN = 500_000; // ₹5,000

/** Derive the tier from a KYC record. */
export function tierForKyc(kyc = {}) {
  const { panVerified, aadhaarVerified, selfieVerified, gstVerified } = kyc;
  if (panVerified && aadhaarVerified && selfieVerified && gstVerified) {
    return KycTier.GST;
  }
  if (panVerified && aadhaarVerified && selfieVerified) return KycTier.FULL;
  if (panVerified) return KycTier.PAN;
  return KycTier.MINIMAL;
}

/**
 * Decide whether a payment is allowed.
 * @returns {{allowed:boolean, reason?:string, tier:string, limits:object,
 *            remainingDailyMinor:number, remainingMonthlyMinor:number}}
 */
export function evaluate({
  tier,
  amountMinor,
  spentTodayMinor = 0,
  spentMonthMinor = 0,
  beneficiaryVerified = true,
  unverifiedPerTxnCap = UNVERIFIED_PAYEE_PER_TXN,
}) {
  const limits = TIER_LIMITS[tier] ?? TIER_LIMITS[KycTier.MINIMAL];
  const base = {
    tier,
    limits,
    remainingDailyMinor: Math.max(0, limits.daily - spentTodayMinor),
    remainingMonthlyMinor: Math.max(0, limits.monthly - spentMonthMinor),
  };

  if (!Number.isInteger(amountMinor) || amountMinor <= 0) {
    return { ...base, allowed: false, reason: "invalid_amount" };
  }
  if (limits.perTxn === 0) {
    return { ...base, allowed: false, reason: "kyc_required" };
  }
  if (!beneficiaryVerified && amountMinor > unverifiedPerTxnCap) {
    return { ...base, allowed: false, reason: "unverified_payee_limit" };
  }
  if (amountMinor > limits.perTxn) {
    return { ...base, allowed: false, reason: "per_transaction_limit" };
  }
  if (spentTodayMinor + amountMinor > limits.daily) {
    return { ...base, allowed: false, reason: "daily_limit" };
  }
  if (spentMonthMinor + amountMinor > limits.monthly) {
    return { ...base, allowed: false, reason: "monthly_limit" };
  }

  return {
    ...base,
    allowed: true,
    remainingDailyMinor: limits.daily - spentTodayMinor - amountMinor,
    remainingMonthlyMinor: limits.monthly - spentMonthMinor - amountMinor,
  };
}
