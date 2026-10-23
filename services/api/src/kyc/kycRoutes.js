import { Router } from "express";

import { requireAuth } from "../auth.js";
import { getKyc, updateKyc } from "../store.js";
import { makeKycProvider } from "./kycProvider.js";
import { tierForKyc } from "../limits/limitsEngine.js";

// KYC routes (spec §2 steps 5–7). Verification runs server-side via the
// configured provider (stub in dev, HyperVerge in prod).
export function kycRoutes() {
  const router = Router();
  const provider = makeKycProvider();

  router.use(requireAuth);

  // PAN verify.
  router.post("/pan", async (req, res) => {
    const { pan, name } = req.body || {};
    try {
      const r = await provider.verifyPan(pan, name);
      if (r.verified) {
        updateKyc(req.phone, { panVerified: true, pan: (pan || "").toUpperCase() });
      }
      res.json(r);
    } catch (e) {
      res.status(502).json({ error: "kyc_provider_error" });
    }
  });

  // GSTIN verify (optional; unlocks higher tier + lower fee).
  router.post("/gstin", async (req, res) => {
    const { gstin } = req.body || {};
    try {
      const r = await provider.verifyGstin(gstin);
      if (r.verified) {
        updateKyc(req.phone, {
          gstVerified: true,
          gstin: (gstin || "").toUpperCase(),
          legalName: r.legalName,
        });
      }
      res.json(r);
    } catch (e) {
      res.status(502).json({ error: "kyc_provider_error" });
    }
  });

  // Aadhaar via DigiLocker — start then complete.
  router.post("/aadhaar/init", async (req, res) => {
    const { redirectUrl } = req.body || {};
    try {
      res.json(await provider.initAadhaar(redirectUrl || "xorpay://kyc/aadhaar"));
    } catch (e) {
      res.status(502).json({ error: "kyc_provider_error" });
    }
  });

  router.post("/aadhaar/complete", async (req, res) => {
    const { requestId } = req.body || {};
    try {
      const r = await provider.completeAadhaar(requestId);
      if (r.verified) updateKyc(req.phone, { aadhaarVerified: true });
      res.json(r);
    } catch (e) {
      res.status(502).json({ error: "kyc_provider_error" });
    }
  });

  // Selfie liveness — mint a session, then record the result.
  router.post("/selfie/session", async (_req, res) => {
    try {
      res.json(await provider.createSelfieSession());
    } catch (e) {
      res.status(502).json({ error: "kyc_provider_error" });
    }
  });

  router.post("/selfie/complete", async (req, res) => {
    const { sessionId } = req.body || {};
    try {
      const r = await provider.completeSelfie(sessionId);
      if (r.verified) updateKyc(req.phone, { selfieVerified: true });
      res.json(r);
    } catch (e) {
      res.status(502).json({ error: "kyc_provider_error" });
    }
  });

  // Current KYC state + derived tier.
  router.get("/status", (req, res) => {
    const kyc = getKyc(req.phone);
    res.json({ ...kyc, tier: tierForKyc(kyc) });
  });

  return router;
}
