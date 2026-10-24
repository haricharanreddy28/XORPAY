import { test } from "node:test";
import assert from "node:assert/strict";

import {
  KycTier,
  TIER_LIMITS,
  tierForKyc,
  evaluate,
} from "./limitsEngine.js";

test("tierForKyc derives the right tier", () => {
  assert.equal(tierForKyc({}), KycTier.MINIMAL);
  assert.equal(tierForKyc({ panVerified: true }), KycTier.PAN);
  assert.equal(
    tierForKyc({ panVerified: true, aadhaarVerified: true, selfieVerified: true }),
    KycTier.FULL,
  );
  assert.equal(
    tierForKyc({
      panVerified: true,
      aadhaarVerified: true,
      selfieVerified: true,
      gstVerified: true,
    }),
    KycTier.GST,
  );
});

test("MINIMAL tier cannot pay (kyc_required)", () => {
  const r = evaluate({ tier: KycTier.MINIMAL, amountMinor: 100_000 });
  assert.equal(r.allowed, false);
  assert.equal(r.reason, "kyc_required");
});

test("within PAN per-transaction limit is allowed", () => {
  const r = evaluate({ tier: KycTier.PAN, amountMinor: 2_000_000 });
  assert.equal(r.allowed, true);
  assert.equal(r.remainingDailyMinor, TIER_LIMITS.PAN.daily - 2_000_000);
});

test("over per-transaction limit is rejected", () => {
  const r = evaluate({ tier: KycTier.PAN, amountMinor: 3_000_000 });
  assert.equal(r.allowed, false);
  assert.equal(r.reason, "per_transaction_limit");
});

test("daily cap is enforced using prior spend", () => {
  const r = evaluate({
    tier: KycTier.PAN,
    amountMinor: 2_000_000,
    spentTodayMinor: 4_000_000, // 4L already; daily cap 5L
  });
  assert.equal(r.allowed, false);
  assert.equal(r.reason, "daily_limit");
});

test("monthly cap is enforced", () => {
  const r = evaluate({
    tier: KycTier.FULL,
    amountMinor: 5_000_000, // ₹50k
    spentMonthMinor: 99_000_000, // ₹9.9L spent; FULL monthly cap is ₹10L
  });
  assert.equal(r.allowed, false);
  assert.equal(r.reason, "monthly_limit");
});

test("unverified beneficiary is capped low regardless of tier", () => {
  const over = evaluate({
    tier: KycTier.GST,
    amountMinor: 600_000, // ₹6,000 > ₹5,000 cap
    beneficiaryVerified: false,
  });
  assert.equal(over.allowed, false);
  assert.equal(over.reason, "unverified_payee_limit");

  const ok = evaluate({
    tier: KycTier.GST,
    amountMinor: 400_000, // ₹4,000 within cap
    beneficiaryVerified: false,
  });
  assert.equal(ok.allowed, true);
});

test("zero / invalid amount rejected", () => {
  assert.equal(evaluate({ tier: KycTier.FULL, amountMinor: 0 }).reason, "invalid_amount");
  assert.equal(evaluate({ tier: KycTier.FULL, amountMinor: -5 }).reason, "invalid_amount");
});

test("pilot caps further restrict KYC tier limits", () => {
  const caps = { perTxn: 500_000, daily: 1_000_000, monthly: 5_000_000 };
  const overTransaction = evaluate({
    tier: KycTier.GST,
    amountMinor: 500_001,
    caps,
  });
  assert.equal(overTransaction.allowed, false);
  assert.equal(overTransaction.reason, "per_transaction_limit");

  const overDaily = evaluate({
    tier: KycTier.GST,
    amountMinor: 200_000,
    spentTodayMinor: 900_000,
    caps,
  });
  assert.equal(overDaily.allowed, false);
  assert.equal(overDaily.reason, "daily_limit");
});
