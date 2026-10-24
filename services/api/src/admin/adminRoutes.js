import { Router } from "express";

import { allTransactions, allKyc, updateKyc, ledger } from "../store.js";
import { Account } from "../ledger/ledger.js";
import { computeMetrics } from "./adminMetrics.js";
import { tierForKyc } from "../limits/limitsEngine.js";

// Admin & ops API (spec §4). Dev auth: a shared admin token (header
// x-admin-token). Production needs real admin accounts + RBAC + maker-checker;
// the role is surfaced here so the panel can gate actions.
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "admin-dev";

function adminAuth(req, res, next) {
  if ((req.headers["x-admin-token"] || "") !== ADMIN_TOKEN) {
    return res.status(401).json({ error: "unauthorized" });
  }
  req.adminRole = "super"; // single role for now
  next();
}

export function adminRoutes() {
  const router = Router();
  router.use(adminAuth);

  router.get("/me", (req, res) => res.json({ role: req.adminRole }));

  router.get("/metrics", (_req, res) => {
    res.json(computeMetrics(allTransactions()));
  });

  // KYC review queue.
  router.get("/kyc", (_req, res) => {
    const users = allKyc().map((k) => ({
      phone: k.phone,
      tier: tierForKyc(k),
      panVerified: k.panVerified,
      aadhaarVerified: k.aadhaarVerified,
      selfieVerified: k.selfieVerified,
      gstVerified: k.gstVerified,
      legalName: k.legalName,
      reviewStatus: k.reviewStatus ?? "pending",
    }));
    res.json({ users });
  });

  router.post("/kyc/:phone/decision", (req, res) => {
    const decision = req.body?.decision; // 'approve' | 'reject'
    if (!["approve", "reject"].includes(decision)) {
      return res.status(400).json({ error: "bad_decision" });
    }
    updateKyc(req.params.phone, {
      reviewStatus: decision === "approve" ? "approved" : "rejected",
      reviewReason: req.body?.reason ?? null,
    });
    res.json({ ok: true });
  });

  router.get("/transactions", (_req, res) => {
    res.json({ transactions: allTransactions() });
  });

  // Reconciliation: ledger balances per account (should net to the float held).
  router.get("/reconciliation", (_req, res) => {
    const balances = {};
    for (const acc of Object.values(Account)) balances[acc] = ledger.balance(acc);
    res.json({ balances, entries: ledger.entries.length });
  });

  return router;
}
