import { Router } from "express";

import { requireAuth } from "../auth.js";
import { getSpend } from "../store.js";
import { getKycProfile } from "../kyc/kycRepository.js";
import { databaseConfigured } from "../db/database.js";
import { getPaymentSpend } from "../payments/paymentRepository.js";
import { tierForKyc, evaluate, limitsFor } from "./limitsEngine.js";
import { pilotMode, pilotCaps } from "../config/pilot.js";

// Limits routes (spec §3.4). The app reads limits to show caps and an
// "increase limit" prompt; the engine is also enforced server-side at payment.
export function limitsRoutes() {
  const router = Router();
  router.use(requireAuth);

  // Current caps for the user, with how much is left today/this month.
  router.get("/", async (req, res) => {
    try {
      const kyc = await getKycProfile(req.phone);
      const tier = tierForKyc(kyc);
      const { spentTodayMinor, spentMonthMinor } = databaseConfigured()
        ? await getPaymentSpend(req.phone)
        : getSpend(req.phone);
      const limits = limitsFor(tier, pilotMode ? pilotCaps : null);
      res.json({
        tier,
        perTxnMinor: limits.perTxn,
        dailyMinor: limits.daily,
        monthlyMinor: limits.monthly,
        remainingDailyMinor: Math.max(0, limits.daily - spentTodayMinor),
        remainingMonthlyMinor: Math.max(0, limits.monthly - spentMonthMinor),
      });
    } catch (error) {
      console.error("[limits] read failed", error?.code || "unknown");
      res.status(503).json({ error: "limits_unavailable" });
    }
  });

  // Pre-check an amount before starting checkout (same logic the payment
  // route enforces), so the UI can warn early.
  router.post("/check", async (req, res) => {
    try {
      const { amount, beneficiaryVerified = true } = req.body || {};
      const kyc = await getKycProfile(req.phone);
      const { spentTodayMinor, spentMonthMinor } = databaseConfigured()
        ? await getPaymentSpend(req.phone)
        : getSpend(req.phone);
      const result = evaluate({
        tier: tierForKyc(kyc),
        amountMinor: amount,
        spentTodayMinor,
        spentMonthMinor,
        beneficiaryVerified,
        caps: pilotMode ? pilotCaps : null,
      });
      res.json(result);
    } catch (error) {
      console.error("[limits] check failed", error?.code || "unknown");
      res.status(503).json({ error: "limits_unavailable" });
    }
  });

  return router;
}
