import { Router } from "express";

import { requireAuth } from "../auth.js";
import {
  listBeneficiaries,
  getBeneficiary,
  addBeneficiary,
  updateBeneficiary,
  removeBeneficiary,
} from "../store.js";
import { validateBeneficiary, maskAccount, maskVpa } from "./validate.js";
import { makeBeneficiaryVerifier } from "./verifierProvider.js";
import { databaseConfigured } from "../db/database.js";
import {
  createStoredBeneficiary,
  getStoredBeneficiary,
  listStoredBeneficiaries,
  removeStoredBeneficiary,
  updateStoredBeneficiaryVerification,
} from "./beneficiaryRepository.js";

export function beneficiaryRoutes() {
  const router = Router();
  const verifier = makeBeneficiaryVerifier();
  router.use(requireAuth);

  async function verify(type, body) {
    return type === "bank"
      ? verifier.verifyBank({ accountNumber: body.accountNumber, ifsc: body.ifsc })
      : verifier.verifyUpi({ vpa: body.vpa });
  }

  router.get("/", async (req, res) => {
    try {
      const beneficiaries = databaseConfigured()
        ? await listStoredBeneficiaries(req.phone)
        : listBeneficiaries(req.phone).map(({ accountNumber, vpa, ...safe }) => safe);
      res.json({ beneficiaries });
    } catch (error) {
      console.error("[beneficiary] list failed", error?.code || "unknown");
      res.status(503).json({ error: "beneficiary_storage_unavailable" });
    }
  });

  router.post("/", async (req, res) => {
    const body = req.body || {};
    const check = validateBeneficiary(body);
    if (!check.ok) return res.status(400).json({ error: check.error });

    let result;
    try {
      result = await verify(check.type, body);
    } catch {
      return res.status(502).json({ error: "verifier_error" });
    }

    const input = {
      type: check.type,
      nickname: typeof body.nickname === "string" ? body.nickname.trim().slice(0, 80) : null,
      maskedAccount: check.type === "bank" ? maskAccount(body.accountNumber) : maskVpa(body.vpa),
      ifsc: check.type === "bank" ? String(body.ifsc).toUpperCase() : null,
      accountNumber: check.type === "bank" ? String(body.accountNumber) : null,
      vpa: check.type === "upi" ? String(body.vpa) : null,
      verified: Boolean(result.verified && result.registeredName),
      registeredName: result.registeredName ?? null,
    };

    try {
      const record = databaseConfigured()
        ? await createStoredBeneficiary(req.phone, input)
        : addBeneficiary(req.phone, input);
      const { accountNumber, vpa, ...safe } = record;
      res.status(201).json(safe);
    } catch (error) {
      if (error?.code === "BENEFICIARY_ENCRYPTION_NOT_CONFIGURED") {
        return res.status(503).json({ error: "beneficiary_storage_not_configured" });
      }
      console.error("[beneficiary] persistence failed", error?.code || "unknown");
      res.status(503).json({ error: "beneficiary_storage_unavailable" });
    }
  });

  router.post("/:id/verify", async (req, res) => {
    try {
      const beneficiary = databaseConfigured()
        ? await getStoredBeneficiary(req.phone, req.params.id)
        : getBeneficiary(req.phone, req.params.id);
      if (!beneficiary) return res.status(404).json({ error: "unknown_beneficiary" });

      const result = await verify(beneficiary.type, {
        accountNumber: beneficiary.accountNumber,
        ifsc: beneficiary.ifsc,
        vpa: beneficiary.vpa ?? beneficiary.maskedAccount,
      });
      const patch = {
        verified: Boolean(result.verified),
        registeredName: result.registeredName ?? beneficiary.registeredName,
      };
      const updated = databaseConfigured()
        ? await updateStoredBeneficiaryVerification(req.phone, beneficiary.id, patch)
        : updateBeneficiary(req.phone, beneficiary.id, patch);
      if (!updated) return res.status(404).json({ error: "unknown_beneficiary" });
      const { accountNumber, vpa, ...safe } = updated;
      res.json(safe);
    } catch (error) {
      console.error("[beneficiary] verification failed", error?.code || "unknown");
      const status = error?.code === "BENEFICIARY_ENCRYPTION_KEY_UNAVAILABLE" ? 503 : 502;
      res.status(status).json({ error: status === 503 ? "beneficiary_storage_unavailable" : "verifier_error" });
    }
  });

  router.delete("/:id", async (req, res) => {
    try {
      if (databaseConfigured()) {
        const result = await removeStoredBeneficiary(req.phone, req.params.id);
        if (result.reason === "payment_in_progress") {
          return res.status(409).json({ error: "beneficiary_has_payment_in_progress" });
        }
      } else {
        removeBeneficiary(req.phone, req.params.id);
      }
      res.json({ ok: true });
    } catch (error) {
      console.error("[beneficiary] delete failed", error?.code || "unknown");
      res.status(503).json({ error: "beneficiary_storage_unavailable" });
    }
  });

  return router;
}
