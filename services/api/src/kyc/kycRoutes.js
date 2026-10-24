import { Router } from "express";

import { requireAuth } from "../auth.js";
import { databaseConfigured } from "../db/database.js";
import {
  claimKycSession,
  createKycSession,
  finishKycSession,
  getKycProfile,
  updateKycProfile,
} from "./kycRepository.js";
import { makeKycProvider } from "./kycProvider.js";
import { tierForKyc } from "../limits/limitsEngine.js";

const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const AADHAAR_REDIRECT = process.env.KYC_AADHAAR_REDIRECT_URL || "xorpay://kyc/aadhaar";

function reportFailure(error) {
  console.error("[kyc] operation failed", error?.code || "unknown");
}
function providerFailure(res) {
  return res.status(502).json({ error: "kyc_provider_error" });
}
function storageFailure(res) {
  return res.status(503).json({ error: "kyc_storage_unavailable" });
}

export function kycRoutes() {
  const router = Router();
  const provider = makeKycProvider();
  router.use(requireAuth);

  router.post("/pan", async (req, res) => {
    const pan = typeof req.body?.pan === "string" ? req.body.pan.trim().toUpperCase() : "";
    const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
    if (!PAN_RE.test(pan) || (name && (name.length < 2 || name.length > 120))) {
      return res.status(400).json({ error: "invalid_pan_or_name" });
    }
    let result;
    try { result = await provider.verifyPan(pan, name); }
    catch (error) { reportFailure(error); return providerFailure(res); }

    if (result.verified) {
      try {
        await updateKycProfile(req.phone, {
          panVerified: true,
          pan,
          ...(result.registeredName ? { legalName: String(result.registeredName).slice(0, 160) } : {}),
        });
      } catch (error) { reportFailure(error); return storageFailure(res); }
    }
    return res.json({
      verified: Boolean(result.verified),
      ...(result.registeredName ? { registeredName: String(result.registeredName).slice(0, 160) } : {}),
      ...(typeof result.nameMatch === "boolean" ? { nameMatch: result.nameMatch } : {}),
    });
  });

  router.post("/gstin", async (req, res) => {
    const gstin = typeof req.body?.gstin === "string" ? req.body.gstin.trim().toUpperCase() : "";
    if (!GSTIN_RE.test(gstin)) return res.status(400).json({ error: "invalid_gstin" });
    let result;
    try { result = await provider.verifyGstin(gstin); }
    catch (error) { reportFailure(error); return providerFailure(res); }

    if (result.verified) {
      try {
        await updateKycProfile(req.phone, {
          gstVerified: true,
          gstin,
          ...(result.legalName ? { legalName: String(result.legalName).slice(0, 160) } : {}),
        });
      } catch (error) { reportFailure(error); return storageFailure(res); }
    }
    return res.json({
      verified: Boolean(result.verified),
      ...(result.legalName ? { legalName: String(result.legalName).slice(0, 160) } : {}),
      ...(result.status ? { status: String(result.status).slice(0, 40) } : {}),
    });
  });

  router.post("/aadhaar/init", async (req, res) => {
    if (req.body?.redirectUrl && req.body.redirectUrl !== AADHAAR_REDIRECT) {
      return res.status(400).json({ error: "redirect_url_not_allowed" });
    }
    let result;
    try { result = await provider.initAadhaar(AADHAAR_REDIRECT); }
    catch (error) { reportFailure(error); return providerFailure(res); }
    if (typeof result?.requestId !== "string" || !result.requestId) return providerFailure(res);
    try { await createKycSession(req.phone, "aadhaar", result.requestId); }
    catch (error) { reportFailure(error); return storageFailure(res); }
    return res.json(result);
  });

  router.post("/aadhaar/complete", async (req, res) => {
    const requestId = typeof req.body?.requestId === "string" ? req.body.requestId : "";
    if (!requestId || requestId.length > 256) return res.status(400).json({ error: "invalid_request_id" });
    try {
      if (!(await claimKycSession(req.phone, "aadhaar", requestId))) {
        return res.status(409).json({ error: "kyc_session_invalid_or_used" });
      }
    } catch (error) { reportFailure(error); return storageFailure(res); }

    let result;
    try { result = await provider.completeAadhaar(requestId); }
    catch (error) {
      try { await finishKycSession(req.phone, "aadhaar", requestId, { retry: true }); } catch {}
      reportFailure(error);
      return providerFailure(res);
    }
    try {
      if (result.verified) await updateKycProfile(req.phone, { aadhaarVerified: true });
      await finishKycSession(req.phone, "aadhaar", requestId, { retry: !result.verified });
    } catch (error) {
      try { await finishKycSession(req.phone, "aadhaar", requestId, { retry: true }); } catch {}
      reportFailure(error);
      return storageFailure(res);
    }
    return res.json({
      verified: Boolean(result.verified),
      ...(typeof result.maskedUid === "string" ? { maskedUid: result.maskedUid.slice(0, 24) } : {}),
    });
  });

  router.post("/selfie/session", async (req, res) => {
    let result;
    try { result = await provider.createSelfieSession(); }
    catch (error) { reportFailure(error); return providerFailure(res); }
    if (typeof result?.sessionId !== "string" || !result.sessionId) return providerFailure(res);
    try { await createKycSession(req.phone, "selfie", result.sessionId); }
    catch (error) { reportFailure(error); return storageFailure(res); }
    return res.json(result);
  });

  router.post("/selfie/complete", async (req, res) => {
    const sessionId = typeof req.body?.sessionId === "string" ? req.body.sessionId : "";
    if (!sessionId || sessionId.length > 256) return res.status(400).json({ error: "invalid_session_id" });
    try {
      if (!(await claimKycSession(req.phone, "selfie", sessionId))) {
        return res.status(409).json({ error: "kyc_session_invalid_or_used" });
      }
    } catch (error) { reportFailure(error); return storageFailure(res); }

    let result;
    const imageBase64 = typeof req.body?.imageBase64 === "string" ? req.body.imageBase64 : "";
    const imageMimeType = typeof req.body?.imageMimeType === "string" ? req.body.imageMimeType : "";
    const decoded = Buffer.from(imageBase64, "base64");
    if (!imageBase64 || !["image/jpeg", "image/png"].includes(imageMimeType) ||
        decoded.length < 1 || decoded.length > 1_350_000 ||
        decoded.toString("base64") !== imageBase64) {
      try { await finishKycSession(req.phone, "selfie", sessionId, { retry: true }); } catch {}
      return res.status(400).json({ error: "invalid_selfie_image" });
    }
    try { result = await provider.completeSelfie(sessionId, decoded, imageMimeType); }
    catch (error) {
      try { await finishKycSession(req.phone, "selfie", sessionId, { retry: true }); } catch {}
      reportFailure(error);
      return providerFailure(res);
    }
    try {
      if (result.verified) await updateKycProfile(req.phone, { selfieVerified: true });
      await finishKycSession(req.phone, "selfie", sessionId);
    } catch (error) {
      try { await finishKycSession(req.phone, "selfie", sessionId, { retry: true }); } catch {}
      reportFailure(error);
      return storageFailure(res);
    }
    return res.json({
      verified: Boolean(result.verified),
      ...(Number.isFinite(result.matchScore) ? { matchScore: result.matchScore } : {}),
    });
  });

  router.get("/status", async (req, res) => {
    try {
      const kyc = await getKycProfile(req.phone);
      return res.json({ ...kyc, tier: tierForKyc(kyc) });
    } catch (error) { reportFailure(error); return storageFailure(res); }
  });

  return router;
}
