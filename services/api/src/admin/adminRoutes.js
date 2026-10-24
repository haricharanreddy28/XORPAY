import { Router } from "express";
import crypto from "node:crypto";
import { databaseConfigured, getDatabase } from "../db/database.js";
import { verifyAdminAccessToken } from "./adminAuth.js";

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

// Admin & ops API (spec §4).
const isProduction = process.env.NODE_ENV === "production" ||
  String(process.env.CASHFREE_ENV || "").toUpperCase() === "PRODUCTION";
const auditHashKey = process.env.ADMIN_AUDIT_HASH_KEY || "";
if (isProduction && Buffer.byteLength(auditHashKey) < 32) {
  throw new Error("ADMIN_AUDIT_HASH_KEY must contain at least 32 bytes in production");
}

function parseDevelopmentTokens() {
  const map = new Map();
  if (isProduction) return map;
  if (process.env.ADMIN_TOKENS) {
    for (const pair of process.env.ADMIN_TOKENS.split(",")) {
      const [token, role] = pair.split(":").map((value) => value.trim());
      if (token && role) map.set(token, role);
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

function adminAuth(developmentTokens) {
  return async (req, res, next) => {
    const authorization = String(req.headers.authorization || "");
    const bearer = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
    const identity = bearer
      ? await verifyAdminAccessToken(bearer)
      : null;
    if (identity) {
      req.adminRole = identity.role;
      req.adminSubject = identity.subject;
      req.adminEmail = identity.email;
      return next();
    }

    // Static tokens exist only for local development; production always requires Cognito.
    if (!isProduction) {
      const devToken = req.headers["x-admin-token"] || bearer;
      const role = developmentTokens.get(devToken || "");
      if (role) {
        req.adminRole = role;
        req.adminSubject = "dev:" + crypto.createHash("sha256").update(devToken).digest("hex");
        req.adminEmail = null;
        return next();
      }
    }
    return res.status(401).json({ error: "unauthorized" });
  };
}

async function auditAdminMutation(req, res, next) {
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) return next();
  if (!databaseConfigured()) {
    if (isProduction) return res.status(503).json({ error: "admin_audit_unavailable" });
    return next();
  }

  const requestId = crypto.randomUUID();
  const resource = Object.values(req.params || {}).filter((value) => typeof value === "string").join("|");
  const resourceHash = resource
    ? crypto.createHmac("sha256", auditHashKey || "xorpay-local-audit-hash-only").update(resource).digest("hex")
    : null;
  try {
    const db = getDatabase();
    const inserted = await db.query(
      "INSERT INTO xorpay_admin_audit_log(request_id,actor_subject,actor_role,http_method,action,resource_sha256) " +
      "VALUES ($1,$2,$3,$4,$5,$6) RETURNING id",
      [requestId, req.adminSubject, req.adminRole, req.method, "pending", resourceHash],
    );
    res.once("finish", () => {
      const route = req.route?.path ? String(req.route.path) : "unmatched";
      const action = (req.baseUrl + route).slice(0, 240);
      void db.query(
        "UPDATE xorpay_admin_audit_log SET action=$2,response_status=$3,completed_at=now() WHERE id=$1",
        [inserted.rows[0].id, action, res.statusCode],
      ).catch((error) => console.error("[admin-audit] completion update failed", error?.code || "unknown"));
    });
    next();
  } catch (error) {
    console.error("[admin-audit] write failed", error?.code || "unknown");
    return res.status(503).json({ error: "admin_audit_unavailable" });
  }
}

export function adminRoutes() {
  const router = Router();
  const tokens = parseDevelopmentTokens();

  router.use(adminAuth(tokens));
  router.use(auditAdminMutation);

  const requireRole = (...roles) => (req, res, next) => {
    if (req.adminRole === "super" || roles.includes(req.adminRole)) return next();
    res.status(403).json({ error: "forbidden", need: roles });
  };

  router.get("/me", (req, res) => res.json({ role: req.adminRole, email: req.adminEmail }));

  router.get("/audit", requireRole("compliance"), async (req, res) => {
    if (!databaseConfigured()) return res.status(503).json({ error: "admin_audit_unavailable" });
    const requested = Number(req.query.limit || 100);
    const limit = Math.min(500, Math.max(1, Number.isFinite(requested) ? Math.floor(requested) : 100));
    try {
      const result = await getDatabase().query(
        "SELECT request_id,actor_subject,actor_role,http_method,action,resource_sha256,response_status,started_at,completed_at " +
        "FROM xorpay_admin_audit_log ORDER BY started_at DESC LIMIT $1",
        [limit],
      );
      res.json({ events: result.rows });
    } catch (error) {
      console.error("[admin-audit] list failed", error?.code || "unknown");
      res.status(503).json({ error: "admin_audit_unavailable" });
    }
  });

  router.get("/metrics", (_req, res) => res.json(computeMetrics(allTransactions())));

  // Reports (finance): settlement, GST-on-fees, fee revenue, over ?from&to (ms).
  router.get("/reports", requireRole("finance"), (req, res) => {
    const fromMs = req.query.from ? Number(req.query.from) : null;
    const toMs = req.query.to ? Number(req.query.to) : null;
    res.json(buildReport(allTransactions(), { fromMs, toMs }));
  });

  // KYC review (compliance).
  router.get("/kyc", requireRole("compliance"), (_req, res) => {
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
    const rr = createRefundRequest({ txnId, reason: reason ?? null, requestedBy: req.adminSubject });
    res.status(201).json(rr);
  });

  router.post("/refunds/:id/approve", requireRole("finance"), (req, res) => {
    const rr = getRefundRequest(req.params.id);
    if (!rr) return res.status(404).json({ error: "unknown_refund" });
    if (rr.status !== "pending") return res.status(409).json({ error: "already_resolved" });
    // Maker-checker: the approver must differ from the requester.
    if (rr.requestedBy === req.adminSubject) {
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
    rr.approvedBy = req.adminSubject;
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
