import crypto from "node:crypto";
import { Router } from "express";

import { requireAuth } from "../auth.js";
import {
  clearEmailChallenge,
  issueEmailChallenge,
  getNotificationPreferences,
  listNotifications,
  markNotificationRead,
  registerDevice,
  unregisterDevice,
  updateNotificationPreferences,
  verifyEmailChallenge,
} from "./notificationRepository.js";
import { sendEmailVerification } from "./notifier.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const codeHmac = (phone, code) =>
  crypto.createHmac("sha256", process.env.JWT_SECRET || "xorpay-local-email-development")
    .update(`xorpay:email-verify:v1:${phone}:${code}`)
    .digest("hex");

export function notificationRoutes() {
  const router = Router();
  router.use(requireAuth);

  router.get("/", async (req, res) => {
    try {
      const items = await listNotifications(req.phone);
      return res.json({ notifications: items, unread: items.filter((item) => !item.read).length });
    } catch (error) {
      console.error("[notifications] list failed", error?.code || "unknown");
      return res.status(503).json({ error: "notifications_unavailable" });
    }
  });

  router.post("/:id/read", async (req, res) => {
    try {
      await markNotificationRead(req.phone, req.params.id);
      return res.json({ ok: true });
    } catch (error) {
      console.error("[notifications] mark read failed", error?.code || "unknown");
      return res.status(503).json({ error: "notifications_unavailable" });
    }
  });

  router.get("/preferences", async (req, res) => {
    try {
      return res.json(await getNotificationPreferences(req.phone));
    } catch (error) {
      console.error("[notifications] preferences failed", error?.code || "unknown");
      return res.status(503).json({ error: "notification_preferences_unavailable" });
    }
  });

  router.patch("/preferences", async (req, res) => {
    const patch = req.body || {};
    const keys = Object.keys(patch);
    if (!keys.length || keys.some((key) => !["sms", "email", "push"].includes(key)) ||
        keys.some((key) => typeof patch[key] !== "boolean")) {
      return res.status(400).json({ error: "invalid_preferences" });
    }
    try {
      if (!(await updateNotificationPreferences(req.phone, patch))) {
        return res.status(409).json({ error: "verify_email_before_enabling" });
      }
      return res.json({ ok: true });
    } catch (error) {
      console.error("[notifications] preference update failed", error?.code || "unknown");
      return res.status(503).json({ error: "notification_preferences_unavailable" });
    }
  });

  router.post("/email/request", async (req, res) => {
    const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
    if (email.length > 254 || !EMAIL_RE.test(email)) return res.status(400).json({ error: "invalid_email" });
    const code = String(crypto.randomInt(100000, 1_000_000));
    try {
      const accepted = await issueEmailChallenge(req.phone, email, codeHmac(req.phone, code));
      if (!accepted) return res.status(429).json({ error: "email_verification_rate_limited" });
      try {
        await sendEmailVerification(email, code);
      } catch (error) {
        await clearEmailChallenge(req.phone);
        console.error("[notifications] verification email failed", error?.code || "provider_error");
        return res.status(502).json({ error: "email_provider_unavailable" });
      }
      return res.json({ ok: true, expiresIn: 600 });
    } catch (error) {
      console.error("[notifications] email verification request failed", error?.code || "unknown");
      return res.status(503).json({ error: "email_verification_unavailable" });
    }
  });

  router.post("/email/verify", async (req, res) => {
    const code = typeof req.body?.code === "string" ? req.body.code : "";
    if (!/^\d{6}$/.test(code)) return res.status(400).json({ error: "invalid_code" });
    try {
      const verified = await verifyEmailChallenge(req.phone, codeHmac(req.phone, code));
      return verified
        ? res.json({ verified: true })
        : res.status(400).json({ error: "invalid_or_expired_code" });
    } catch (error) {
      console.error("[notifications] email verification failed", error?.code || "unknown");
      return res.status(503).json({ error: "email_verification_unavailable" });
    }
  });

  router.post("/devices", async (req, res) => {
    const token = typeof req.body?.token === "string" ? req.body.token.trim() : "";
    const platform = req.body?.platform;
    if (token.length < 20 || token.length > 4096 || !["android", "ios"].includes(platform)) {
      return res.status(400).json({ error: "invalid_device" });
    }
    try {
      await registerDevice(req.phone, token, platform);
      return res.status(201).json({ ok: true });
    } catch (error) {
      console.error("[notifications] device registration failed", error?.code || "unknown");
      return res.status(503).json({ error: "device_registration_unavailable" });
    }
  });

  router.delete("/devices", async (req, res) => {
    const token = typeof req.body?.token === "string" ? req.body.token.trim() : "";
    if (token.length < 20 || token.length > 4096) return res.status(400).json({ error: "invalid_device" });
    try {
      await unregisterDevice(req.phone, token);
      return res.json({ ok: true });
    } catch (error) {
      console.error("[notifications] device removal failed", error?.code || "unknown");
      return res.status(503).json({ error: "device_removal_unavailable" });
    }
  });

  return router;
}
