import { Router } from "express";

import { requireAuth } from "../auth.js";
import { getAccount, updateAccount, listTransactions } from "../store.js";

// Account & settings (spec §3.10) + statements (spec §3.5).
const DELETE_COOLING_DAYS = 30;

export function accountRoutes() {
  const router = Router();
  router.use(requireAuth);

  router.get("/", (req, res) => res.json(getAccount(req.phone)));

  // Settings: language, notification preference.
  router.post("/settings", (req, res) => {
    const patch = {};
    if (typeof req.body?.language === "string") patch.language = req.body.language;
    if (typeof req.body?.notificationsEnabled === "boolean") {
      patch.notificationsEnabled = req.body.notificationsEnabled;
    }
    res.json(updateAccount(req.phone, patch));
  });

  // Delete account with a cooling period (soft delete; recoverable until then).
  router.post("/delete", (req, res) => {
    const when = Date.now() + DELETE_COOLING_DAYS * 24 * 60 * 60 * 1000;
    updateAccount(req.phone, { deletionScheduledAt: when });
    res.json({ ok: true, deletionScheduledAt: when, coolingDays: DELETE_COOLING_DAYS });
  });

  router.post("/delete/cancel", (req, res) => {
    res.json(updateAccount(req.phone, { deletionScheduledAt: null }));
  });

  // Statements: transactions in a date window (?from&to in ms). format=csv
  // returns text/csv for download/email.
  router.get("/statements", (req, res) => {
    const fromMs = req.query.from ? Number(req.query.from) : 0;
    const toMs = req.query.to ? Number(req.query.to) : Date.now();
    const rows = listTransactions(req.phone).filter(
      (t) => t.createdAt >= fromMs && t.createdAt <= toMs,
    );

    if (req.query.format === "csv") {
      const header = "date,reference,category,state,payee_rupees,you_pay_rupees";
      const lines = rows.map((t) =>
        [
          new Date(t.createdAt).toISOString(),
          t.id,
          t.category ?? "",
          t.state,
          (t.fee?.payeeMinor ?? 0) / 100,
          (t.fee?.youPayMinor ?? 0) / 100,
        ].join(","),
      );
      res.setHeader("Content-Type", "text/csv");
      res.send([header, ...lines].join("\n"));
      return;
    }
    res.json({ transactions: rows });
  });

  return router;
}
