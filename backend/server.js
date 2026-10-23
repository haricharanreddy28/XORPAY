// Minimal Cashfree SANDBOX test backend for the Xorpay Flutter app.
//
// PURPOSE: let you run a real Cashfree checkout end-to-end with TEST money.
// NOT production: in-memory store, stubbed OTP auth, trivial tokens. Replace
// the auth + storage before anything real.
//
// Run:  CASHFREE_APP_ID=... CASHFREE_SECRET_KEY=... node server.js
// Then expose it over HTTPS (e.g. `ngrok http 8080`) and point the app's
// API_BASE_URL at the tunnel URL.

import express from "express";
import crypto from "node:crypto";

const {
  CASHFREE_APP_ID,
  CASHFREE_SECRET_KEY,
  CASHFREE_ENV = "SANDBOX",
  PORT = 8080,
} = process.env;

if (!CASHFREE_APP_ID || !CASHFREE_SECRET_KEY) {
  console.error("Set CASHFREE_APP_ID and CASHFREE_SECRET_KEY (sandbox keys).");
  process.exit(1);
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

// --- in-memory stores (reset on restart) --------------------------------
const orders = new Map(); // order_id -> { amountMinor, phone, status }

// Trivial test token: base64(phone). DO NOT ship this; use real JWTs/session.
const makeToken = (phone) => Buffer.from(phone).toString("base64");
const phoneFromToken = (t) => {
  try {
    return Buffer.from(t, "base64").toString("utf8");
  } catch {
    return null;
  }
};

const app = express();
// Capture raw body (needed for webhook signature verification).
app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  })
);

function requirePhone(req, res) {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  const phone = token && phoneFromToken(token);
  if (!phone) {
    res.status(401).json({ error: "unauthorized" });
    return null;
  }
  return phone;
}

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

// --- payments ------------------------------------------------------------
// 1) Create a Cashfree order.
app.post("/payments/orders", async (req, res) => {
  const phone = requirePhone(req, res);
  if (!phone) return;

  const { amount, currency = "INR" } = req.body || {};
  if (!Number.isInteger(amount) || amount <= 0) {
    return res.status(400).json({ error: "invalid_amount" });
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
          customer_id: "usr_" + crypto.createHash("sha1").update(phone).digest("hex").slice(0, 10),
          customer_phone: phone,
        },
      }),
    });
    const data = await r.json();
    if (!r.ok || !data.payment_session_id) {
      console.error("[cashfree create]", r.status, data);
      return res.status(502).json({ error: "psp_unavailable", detail: data });
    }
    orders.set(orderId, { amountMinor: amount, phone, status: "CREATED" });
    res.json({
      order_id: orderId,
      payment_session_id: data.payment_session_id,
    });
  } catch (e) {
    console.error("[cashfree create] threw", e);
    res.status(502).json({ error: "psp_unavailable" });
  }
});

// 2) Confirm: ask Cashfree for the real status (never trust the client).
app.post("/payments/confirm", async (req, res) => {
  const phone = requirePhone(req, res);
  if (!phone) return;

  const { order_id } = req.body || {};
  const record = order_id && orders.get(order_id);
  if (!record) return res.status(404).json({ error: "unknown_order" });
  if (record.phone !== phone) return res.status(403).json({ error: "not_owner" });

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
    .createHmac("sha256", CASHFREE_SECRET_KEY)
    .update(String(timestamp) + req.rawBody.toString("utf8"))
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

app.get("/health", (_req, res) => res.json({ ok: true, env: CASHFREE_ENV }));

app.listen(PORT, () => {
  console.log(`xorpay test backend on :${PORT} (Cashfree ${CASHFREE_ENV})`);
  console.log(`Cashfree base: ${CF_BASE}`);
});
