import { Router } from "express";

import {
  allTransactions,
  allKyc,
  updateKyc,
  getTransaction,
  ledger,
  createRefundRequest,
  getRefundRequest,
  listRefundRequests,
} from "../store.js";
import { Account } from "../ledger/ledger.js";
import { TxnState, canTransition } from "../payments/stateMachine.js";
import { computeMetrics } from "./adminMetrics.js";
import { buildReport } from "./reports.js";
import { tierForKyc } from "../limits/limitsEngine.js";

// Admin & ops API (spec §4) with RBAC + maker-checker.
//
// Auth: header x-admin-token maps to a role. Configure real tokens via
// ADMIN_TOKENS="token1:super,token2:finance,...". Dev defaults below. Roles:
// super, ops, finance, support, compliance.
function parseTokens() {
  const map = new Map();
  if (process.env.ADMIN_TOKENS) {
    for (const pair of process.env.ADMIN_TOKENS.split(",")) {
      const [t, r] = pair.split(":").map((s) => s.trim());
      if (t && r) map.set(t, r);
    }
  }
  if (map.size === 0) {
    map.set("admin-dev", "super");
    map.set("finance-dev", "finance");
    map.set("compliance-dev", "compliance");
    map.set("ops-dev", "ops");
  }
  return map;
}

export function adminRoutes() {
  const router = Router();
  const tokens = parseTokens();

  function adminAuth(req, res, next) {
    const role = tokens.get(req.headers["x-admin-token"] || "");
    if (!role) return res.status(401).json({ error: "unauthorized" });
    req.adminRole = role;
    req.adminToken = req.headers["x-admin-token"];
    next();
  }

  const requireRole = (...roles) => (req, res, next) => {
    if (req.adminRole === "super" || roles.includes(req.adminRole)) return next();
    res.status(403).json({ error: "forbidden", need: roles });
  };

  router.use(adminAuth);

  router.get("/me", (req, res) => res.json({ role: req.adminRole }));

  router.get("/metrics", (_req, res) => res.json(computeMetrics(allTransactions())));

  // Reports (finance): settlement, GST-on-fees, fee revenue, over ?from&to (ms).
  router.get("/reports", requireRole("finance"), (req, res) => {
    const fromMs = req.query.from ? Number(req.query.from) : null;
    const toMs = req.query.to ? Number(req.query.to) : null;
    res.json(buildReport(allTransactions(), { fromMs, toMs }));
  });

  // KYC review (compliance).
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

  router.post("/kyc/:phone/decision", requireRole("compliance"), (req, res) => {
    const decision = req.body?.decision;
    if (!["approve", "reject"].includes(decision)) {
      return res.status(400).json({ error: "bad_decision" });
    }
    updateKyc(req.params.phone, {
      reviewStatus: decision === "approve" ? "approved" : "rejected",
      reviewReason: req.body?.reason ?? null,
    });
    res.json({ ok: true });
  });

  router.get("/transactions", (_req, res) =>
    res.json({ transactions: allTransactions() }),
  );

  // --- Maker-checker refunds (finance) ----------------------------------
  // Maker requests; a different finance admin approves; only then is it processed.
  router.get("/refunds", requireRole("finance"), (_req, res) =>
    res.json({ refunds: listRefundRequests() }),
  );

  router.post("/refunds/request", requireRole("finance"), (req, res) => {
    const { txnId, reason } = req.body || {};
    const txn = getTransaction(txnId);
    if (!txn) return res.status(404).json({ error: "unknown_transaction" });
    if (!canTransition(txn.state, TxnState.REFUND_INITIATED)) {
      return res.status(409).json({ error: "not_refundable", state: txn.state });
    }
    const rr = createRefundRequest({ txnId, reason: reason ?? null, requestedBy: req.adminToken });
    res.status(201).json(rr);
  });

  router.post("/refunds/:id/approve", requireRole("finance"), (req, res) => {
    const rr = getRefundRequest(req.params.id);
    if (!rr) return res.status(404).json({ error: "unknown_refund" });
    if (rr.status !== "pending") return res.status(409).json({ error: "already_resolved" });
    // Maker-checker: the approver must differ from the requester.
    if (rr.requestedBy === req.adminToken) {
      return res.status(403).json({ error: "needs_second_approver" });
    }
    const txn = getTransaction(rr.txnId);
    if (!txn || !canTransition(txn.state, TxnState.REFUND_INITIATED)) {
      return res.status(409).json({ error: "not_refundable" });
    }
    // Process the refund (reverse the ledger, advance state).
    txn.state = TxnState.REFUND_INITIATED;
    ledger.postRefund(txn.id, txn.fee);
    txn.state = TxnState.REFUNDED;
    rr.status = "approved";
    rr.approvedBy = req.adminToken;
    res.json({ ok: true });
  });

  // Reconciliation.
  router.get("/reconciliation", (_req, res) => {
    const balances = {};
    for (const acc of Object.values(Account)) balances[acc] = ledger.balance(acc);
    res.json({ balances, entries: ledger.entries.length });
  });

  return router;
}
