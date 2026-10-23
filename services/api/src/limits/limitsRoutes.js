import { Router } from "express";

import { requireAuth } from "../auth.js";
import { getKyc, getSpend } from "../store.js";
import { tierForKyc, evaluate, TIER_LIMITS } from "./limitsEngine.js";

// Limits routes (spec §3.4). The app reads limits to show caps and an
// "increase limit" prompt; the engine is also enforced server-side at payment.
export function limitsRoutes() {
  const router = Router();
  router.use(requireAuth);

  // Current caps for the user, with how much is left today/this month.
  router.get("/", (req, res) => {
    const kyc = getKyc(req.phone);
    const tier = tierForKyc(kyc);
    const { spentTodayMinor, spentMonthMinor } = getSpend(req.phone);
    const limits = TIER_LIMITS[tier];
    res.json({
      tier,
      perTxnMinor: limits.perTxn,
      dailyMinor: limits.daily,
      monthlyMinor: limits.monthly,
      remainingDailyMinor: Math.max(0, limits.daily - spentTodayMinor),
      remainingMonthlyMinor: Math.max(0, limits.monthly - spentMonthMinor),
    });
  });

  // Pre-check an amount before starting checkout (same logic the payment
  // route enforces), so the UI can warn early.
  router.post("/check", (req, res) => {
    const { amount, beneficiaryVerified = true } = req.body || {};
    const kyc = getKyc(req.phone);
    const { spentTodayMinor, spentMonthMinor } = getSpend(req.phone);
    const result = evaluate({
      tier: tierForKyc(kyc),
      amountMinor: amount,
      spentTodayMinor,
      spentMonthMinor,
      beneficiaryVerified,
    });
    res.json(result);
  });

  return router;
}
