// XORPAY API (dev/sandbox). Express today; NestJS + Prisma migration is Phase 4.
//
// Serves: Twilio OTP auth, Cashfree sandbox payments, KYC verification
// (via a swappable provider), and the limits engine. In-memory stores.
// NOT production — see each module's notes.
//
// Run:  node server.js
//   Cashfree payments need CASHFREE_APP_ID / CASHFREE_SECRET_KEY; without them
//   the payment routes return 503 but auth/KYC/limits still work.

import express from "express";
import crypto from "node:crypto";

import { makeToken, requireAuth } from "./src/auth.js";
import { sendVerification, checkVerification } from "./src/auth/twilioVerify.js";
import { orders, getKyc, getSpend } from "./src/store.js";
import { kycRoutes } from "./src/kyc/kycRoutes.js";
import { limitsRoutes } from "./src/limits/limitsRoutes.js";
import { cardRoutes } from "./src/cards/cardRoutes.js";
import { beneficiaryRoutes } from "./src/beneficiaries/beneficiaryRoutes.js";
import { transactionRoutes } from "./src/payments/transactionRoutes.js";
import { invoiceRoutes } from "./src/invoices/invoiceRoutes.js";
import { rewardsRoutes, referralRoutes } from "./src/rewards/rewardsRoutes.js";
import { notificationRoutes } from "./src/notifications/notificationRoutes.js";
import { adminRoutes } from "./src/admin/adminRoutes.js";
import { supportRoutes } from "./src/support/supportRoutes.js";
import { accountRoutes } from "./src/account/accountRoutes.js";
import { computeCoins } from "./src/rewards/coins.js";
import { awardCoins, listTransactions } from "./src/store.js";
import { notify } from "./src/notifications/notifier.js";
import { computeFee } from "./src/payments/fee.js";
import { TxnState, canTransition } from "./src/payments/stateMachine.js";
import {
  createTransaction,
  getTransaction,
  ledger,
} from "./src/store.js";
import { enqueuePayout } from "./src/payouts/payoutQueue.js";
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

// --- OTP authentication (Twilio Verify by default) -----------------------
function normalizePhone(value) {
  if (typeof value !== "string") return null;
  const phone = value.trim().replace(/[\\s().-]/g, "");
  if (/^[6-9]\\d{9}$/.test(phone)) return `+91${phone}`;
  if (/^91[6-9]\\d{9}$/.test(phone)) return `+${phone}`;
  if (/^\\+[1-9]\\d{7,14}$/.test(phone)) return phone;
  return null;
}

const otpProvider = process.env.OTP_PROVIDER || "twilio";
const otpStubCode = process.env.OTP_STUB_CODE || "123456";
if (otpProvider === "stub" && process.env.NODE_ENV === "production") {
  throw new Error("OTP_PROVIDER=stub is disabled in production");
}
const otpRequestHistory = new Map();
const OTP_RESEND_MS = 30_000;
const OTP_MAX_PER_HOUR = 5;

app.post("/auth/otp/request", async (req, res) => {
  const phone = normalizePhone(req.body?.phone);
  if (!phone) return res.status(400).json({ error: "invalid_phone" });

  const key = `${req.ip}:${phone}`;
  const now = Date.now();
  const recent = (otpRequestHistory.get(key) || []).filter((time) => now - time < 3_600_000);
  if (recent.length && now - recent[recent.length - 1] < OTP_RESEND_MS) {
    return res.status(429).json({ error: "otp_cooldown" });
  }
  if (recent.length >= OTP_MAX_PER_HOUR) {
    return res.status(429).json({ error: "otp_rate_limited" });
  }

  try {
    if (otpProvider === "stub") {
      if (process.env.NODE_ENV === "production") {
        return res.status(503).json({ error: "otp_not_configured" });
      }
      console.info("[otp] non-production stub enabled");
    } else if (otpProvider === "twilio") {
      await sendVerification(phone);
    } else {
      return res.status(503).json({ error: "otp_provider_not_supported" });
    }

    recent.push(now);
    otpRequestHistory.set(key, recent);
    res.json({ ok: true });
  } catch (error) {
    const status = error?.status === 503 ? 503 : 502;
    console.error("[otp] verification request failed", status);
    res.status(status).json({ error: status === 503 ? "otp_not_configured" : "otp_provider_unavailable" });
  }
});

app.post("/auth/otp/verify", async (req, res) => {
  const phone = normalizePhone(req.body?.phone);
  const otp = req.body?.otp;
  if (!phone) return res.status(400).json({ error: "invalid_phone" });
  if (typeof otp !== "string" || !/^\\d{4,10}$/.test(otp)) {
    return res.status(400).json({ error: "invalid_otp" });
  }

  try {
    let approved = false;
    if (otpProvider === "stub") {
      approved = process.env.NODE_ENV !== "production" && otp === otpStubCode;
    } else if (otpProvider === "twilio") {
      approved = await checkVerification(phone, otp);
    } else {
      return res.status(503).json({ error: "otp_provider_not_supported" });
    }
    if (!approved) return res.status(401).json({ error: "bad_otp" });
    res.json({ access_token: makeToken(phone), refresh_token: null });
  } catch (error) {
    const status = error?.status === 503 ? 503 : 502;
    console.error("[otp] verification check failed", status);
    res.status(status).json({ error: status === 503 ? "otp_not_configured" : "otp_provider_unavailable" });
  }
});

// --- KYC + limits --------------------------------------------------------
app.use("/kyc", kycRoutes());
app.use("/limits", limitsRoutes());

// --- cards + beneficiaries ----------------------------------------------
app.use("/cards", cardRoutes());
app.use("/beneficiaries", beneficiaryRoutes());

// --- transactions --------------------------------------------------------
app.use("/transactions", transactionRoutes());

// --- invoices (GST Hub) --------------------------------------------------
app.use("/invoices", invoiceRoutes());

// --- rewards, referrals, notifications -----------------------------------
app.use("/rewards", rewardsRoutes());
app.use("/referrals", referralRoutes());
app.use("/notifications", notificationRoutes());

// --- support, account, statements ----------------------------------------
app.use("/support", supportRoutes());
app.use("/account", accountRoutes());

// --- admin & ops ---------------------------------------------------------
app.use("/admin", adminRoutes());

// --- payments ------------------------------------------------------------
function requireCashfree(_req, res, next) {
  if (!cashfreeConfigured) {
    return res.status(503).json({ error: "payments_not_configured" });
  }
  next();
}

// 1) Create a Cashfree order — enforces KYC/limits first.
app.post("/payments/orders", requireAuth, requireCashfree, async (req, res) => {
  const {
    amount,
    currency = "INR",
    beneficiaryVerified = true,
    beneficiaryId = null,
    category = null,
  } = req.body || {};
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

  // `amount` is what the beneficiary receives (paise). Fee is added on top,
  // and the user is charged youPay — matching the quote the app showed.
  const fee = computeFee(amount);
  const orderId = "ord_" + crypto.randomUUID().replace(/-/g, "").slice(0, 16);
  const orderAmount = fee.youPayMinor / 100; // charge the total, in rupees

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
    createTransaction({
      id: orderId,
      phone: req.phone,
      beneficiaryId,
      category,
      state: TxnState.PAYMENT_PENDING,
      fee, // full breakdown, in paise
      createdAt: Date.now(),
    });
    res.json({
      order_id: orderId,
      payment_session_id: data.payment_session_id,
      fee, // so the client can show the exact server-side breakdown
    });
  } catch (e) {
    console.error("[cashfree create] threw", e);
    res.status(502).json({ error: "psp_unavailable" });
  }
});

// Settle a paid order once: advance PAYMENT_PENDING -> PAID, post the payment
// to the ledger, then queue the payout. Idempotent — safe to call from both
// the confirm endpoint and the webhook.
function markPaid(orderId) {
  const txn = getTransaction(orderId);
  if (!txn) return;
  if (!canTransition(txn.state, TxnState.PAID)) return; // already settled
  txn.state = TxnState.PAID;
  ledger.postPayment(orderId, txn.fee);

  // Rewards: award coins + notify (once, inside the idempotent settle block).
  const priorPaid = listTransactions(txn.phone).filter(
    (t) => t.id !== orderId && !["CREATED", "PAYMENT_PENDING", "FAILED"].includes(t.state),
  ).length;
  const coins = computeCoins({
    payeeMinor: txn.fee.payeeMinor,
    category: txn.category,
    isFirstTxn: priorPaid === 0,
  });
  awardCoins(txn.phone, coins, "payment", orderId);
  notify(txn.phone, "Payment successful", `You earned ${coins} coins.`, "payment");

  // Queue the payout; the worker advances PAYOUT_QUEUED -> SUCCESS (or refunds).
  txn.state = TxnState.PAYOUT_QUEUED;
  console.log(`[txn] ${orderId} -> PAID -> PAYOUT_QUEUED (+${coins} coins)`);
  enqueuePayout(orderId);
}

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
    if (status === "PAID") markPaid(order_id);
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
    // Authoritative settlement: post the ledger entry + queue payout, once.
    const paid = orderStatus === "PAID" ||
      String(req.body?.type || "").includes("PAYMENT_SUCCESS");
    if (paid) markPaid(orderId);
  }
  res.json({ ok: true });
});

app.get("/health", (_req, res) =>
  res.json({ ok: true, env: CASHFREE_ENV, payments: cashfreeConfigured })
);

app.listen(PORT, () => {
  console.log(`xorpay api on :${PORT} (Cashfree ${CASHFREE_ENV})`);
  console.log(`payments: ${cashfreeConfigured ? "enabled" : "disabled (no keys)"}`);
});
