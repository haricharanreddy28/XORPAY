// XORPAY API (dev/sandbox). Express today; NestJS + Prisma migration is Phase 4.
//
// Serves: stubbed OTP auth, Cashfree sandbox payments, KYC verification
// (via a swappable provider), and the limits engine. In-memory stores.
// NOT production — see each module's notes.
//
// Run:  node server.js
//   Cashfree payments need CASHFREE_APP_ID / CASHFREE_SECRET_KEY; without them
//   the payment routes return 503 but auth/KYC/limits still work.

import express from "express";
import crypto from "node:crypto";

import { makeToken, requireAuth } from "./src/auth.js";
import { orders, getKyc, getSpend } from "./src/store.js";
import { kycRoutes } from "./src/kyc/kycRoutes.js";
import { limitsRoutes } from "./src/limits/limitsRoutes.js";
import { tierForKyc, evaluate } from "./src/limits/limitsEngine.js";

const {
  CASHFREE_APP_ID,
  CASHFREE_SECRET_KEY,
  CASHFREE_ENV = "SANDBOX",
  PORT = 8080,
} = process.env;

const cashfreeConfigured = !!(CASHFREE_APP_ID && CASHFREE_SECRET_KEY);
if (!cashfreeConfigured) {
  console.warn(
    "[warn] CASHFREE_APP_ID/SECRET not set — payment routes return 503. " +
      "Auth, KYC and limits still work.",
  );
}

const CF_BASE =
  CASHFREE_ENV.toUpperCase() === "PRODUCTION"
    ? "https://api.cashfree.com/pg"
    : "https://sandbox.cashfree.com/pg";

const cfHeaders = {
  "x-client-id": CASHFREE_APP_ID,
  "x-client-secret": CASHFREE_SECRET_KEY,
  "x-api-version": "2023-08-01",
  "Content-Type": "application/json",
};

const app = express();
app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  })
);

// --- stubbed auth (so the app's OTP login works) -------------------------
// Test OTP is always "123456".
app.post("/auth/otp/request", (req, res) => {
  const { phone } = req.body || {};
  if (!phone) return res.status(400).json({ error: "phone_required" });
  console.log(`[otp] ${phone} -> use test OTP 123456`);
  res.json({ ok: true });
});

app.post("/auth/otp/verify", (req, res) => {
  const { phone, otp } = req.body || {};
  if (otp !== "123456") return res.status(401).json({ error: "bad_otp" });
  res.json({ access_token: makeToken(phone), refresh_token: null });
});

// --- KYC + limits --------------------------------------------------------
app.use("/kyc", kycRoutes());
app.use("/limits", limitsRoutes());

// --- payments ------------------------------------------------------------
function requireCashfree(_req, res, next) {
  if (!cashfreeConfigured) {
    return res.status(503).json({ error: "payments_not_configured" });
  }
  next();
}

// 1) Create a Cashfree order — enforces KYC/limits first.
app.post("/payments/orders", requireAuth, requireCashfree, async (req, res) => {
  const { amount, currency = "INR", beneficiaryVerified = true } = req.body || {};
  if (!Number.isInteger(amount) || amount <= 0) {
    return res.status(400).json({ error: "invalid_amount" });
  }

  // Server-side limits enforcement (never trust the client).
  const kyc = getKyc(req.phone);
  const { spentTodayMinor, spentMonthMinor } = getSpend(req.phone);
  const decision = evaluate({
    tier: tierForKyc(kyc),
    amountMinor: amount,
    spentTodayMinor,
    spentMonthMinor,
    beneficiaryVerified,
  });
  if (!decision.allowed) {
    return res.status(403).json({ error: "limit_exceeded", reason: decision.reason });
  }

  const orderId = "ord_" + crypto.randomUUID().replace(/-/g, "").slice(0, 16);
  const orderAmount = amount / 100; // minor (paise) -> major (rupees)

  try {
    const r = await fetch(`${CF_BASE}/orders`, {
      method: "POST",
      headers: cfHeaders,
      body: JSON.stringify({
        order_id: orderId,
        order_amount: orderAmount,
        order_currency: currency,
        customer_details: {
          customer_id:
            "usr_" + crypto.createHash("sha1").update(req.phone).digest("hex").slice(0, 10),
          customer_phone: req.phone,
        },
      }),
    });
    const data = await r.json();
    if (!r.ok || !data.payment_session_id) {
      console.error("[cashfree create]", r.status, data);
      return res.status(502).json({ error: "psp_unavailable", detail: data });
    }
    orders.set(orderId, { amountMinor: amount, phone: req.phone, status: "CREATED" });
    res.json({ order_id: orderId, payment_session_id: data.payment_session_id });
  } catch (e) {
    console.error("[cashfree create] threw", e);
    res.status(502).json({ error: "psp_unavailable" });
  }
});

// 2) Confirm: ask Cashfree for the real status (never trust the client).
app.post("/payments/confirm", requireAuth, requireCashfree, async (req, res) => {
  const { order_id } = req.body || {};
  const record = order_id && orders.get(order_id);
  if (!record) return res.status(404).json({ error: "unknown_order" });
  if (record.phone !== req.phone) return res.status(403).json({ error: "not_owner" });

  try {
    const r = await fetch(`${CF_BASE}/orders/${order_id}`, {
      method: "GET",
      headers: cfHeaders,
    });
    const data = await r.json();
    const status = (data.order_status || "").toUpperCase();
    record.status = status;
    res.json({ order_id, status, amount: record.amountMinor });
  } catch (e) {
    console.error("[cashfree get] threw", e);
    res.status(502).json({ error: "psp_unavailable" });
  }
});

// 3) Webhook: Cashfree's authoritative paid/failed signal.
app.post("/webhooks/cashfree", (req, res) => {
  const signature = req.headers["x-webhook-signature"];
  const timestamp = req.headers["x-webhook-timestamp"];
  const expected = crypto
    .createHmac("sha256", CASHFREE_SECRET_KEY || "")
    .update(String(timestamp) + (req.rawBody?.toString("utf8") ?? ""))
    .digest("base64");

  if (!signature || signature !== expected) {
    console.warn("[webhook] signature mismatch — rejecting");
    return res.status(401).json({ error: "bad_signature" });
  }

  const orderId = req.body?.data?.order?.order_id;
  const orderStatus = req.body?.data?.order?.order_status || req.body?.type;
  if (orderId && orders.has(orderId)) {
    orders.get(orderId).status = orderStatus; // idempotent: last write wins
    console.log(`[webhook] ${orderId} -> ${orderStatus}`);
  }
  // Downstream effects (ledger, receipt, push) belong HERE, idempotently.
  res.json({ ok: true });
});

app.get("/health", (_req, res) =>
  res.json({ ok: true, env: CASHFREE_ENV, payments: cashfreeConfigured })
);

app.listen(PORT, () => {
  console.log(`xorpay api on :${PORT} (Cashfree ${CASHFREE_ENV})`);
  console.log(`payments: ${cashfreeConfigured ? "enabled" : "disabled (no keys)"}`);
});
