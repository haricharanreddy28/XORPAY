import { Router } from "express";

import { requireAuth } from "../auth.js";
import {
  getRewards,
  awardCoins,
  getReferral,
  phoneForReferralCode,
  recordReferral,
} from "../store.js";
import { notify } from "../notifications/notifier.js";

// Rewards + referrals (spec §3.6).
const REFERRAL_REWARD_COINS = 200;

export function rewardsRoutes() {
  const router = Router();
  router.use(requireAuth);

  // Coins balance + history.
  router.get("/", (req, res) => {
    res.json(getRewards(req.phone));
  });

  return router;
}

export function referralRoutes() {
  const router = Router();
  router.use(requireAuth);

  // My referral code + how many I've referred.
  router.get("/", (req, res) => {
    const r = getReferral(req.phone);
    res.json({
      code: r.code,
      referralsCount: r.referrals.length,
      rewardCoins: REFERRAL_REWARD_COINS,
      referredBy: r.referredBy,
    });
  });

  // Redeem a referral code (new user applies the inviter's code).
  router.post("/redeem", (req, res) => {
    const code = (req.body?.code || "").toUpperCase();
    const me = getReferral(req.phone);
    if (me.referredBy) return res.status(409).json({ error: "already_referred" });

    const ownerPhone = phoneForReferralCode(code);
    if (!ownerPhone) return res.status(404).json({ error: "invalid_code" });
    if (ownerPhone === req.phone) return res.status(400).json({ error: "self_referral" });

    recordReferral(ownerPhone, req.phone);
    // Reward both sides.
    awardCoins(req.phone, REFERRAL_REWARD_COINS, "referral_joined");
    awardCoins(ownerPhone, REFERRAL_REWARD_COINS, "referral_invited");
    notify(ownerPhone, "Referral reward", `You earned ${REFERRAL_REWARD_COINS} coins — a friend joined with your code.`);
    notify(req.phone, "Welcome bonus", `You earned ${REFERRAL_REWARD_COINS} coins for joining.`);

    res.json({ ok: true, rewardCoins: REFERRAL_REWARD_COINS });
  });

  return router;
}
