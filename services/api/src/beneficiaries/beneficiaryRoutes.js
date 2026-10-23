import { Router } from "express";

import { requireAuth } from "../auth.js";
import {
  listBeneficiaries,
  getBeneficiary,
  addBeneficiary,
  updateBeneficiary,
  removeBeneficiary,
} from "../store.js";
import { validateBeneficiary, maskAccount } from "./validate.js";
import { makeBeneficiaryVerifier } from "./verifierProvider.js";

// Beneficiary routes (spec §3.3): add with instant name verification, list,
// re-verify and delete. The verifier is swappable (stub / Cashfree Payouts).
export function beneficiaryRoutes() {
  const router = Router();
  const verifier = makeBeneficiaryVerifier();
  router.use(requireAuth);

  async function verify(type, body) {
    return type === "bank"
      ? verifier.verifyBank({ accountNumber: body.accountNumber, ifsc: body.ifsc })
      : verifier.verifyUpi({ vpa: body.vpa });
  }

  router.get("/", (req, res) => {
    // Never return the full account number — only the masked handle.
    const safe = listBeneficiaries(req.phone).map(({ accountNumber, ...b }) => b);
    res.json({ beneficiaries: safe });
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

    const handle = check.type === "bank" ? maskAccount(body.accountNumber) : body.vpa;
    const record = addBeneficiary(req.phone, {
      type: check.type,
      nickname: body.nickname ?? null,
      maskedAccount: handle,
      ifsc: check.type === "bank" ? String(body.ifsc).toUpperCase() : null,
      // Full account kept for payouts. TODO: field-level encryption (spec §6).
      accountNumber: check.type === "bank" ? String(body.accountNumber) : null,
      verified: result.verified,
      registeredName: result.registeredName ?? null,
    });

    const { accountNumber, ...safe } = record;
    res.status(201).json(safe);
  });

  router.post("/:id/verify", async (req, res) => {
    const b = getBeneficiary(req.phone, req.params.id);
    if (!b) return res.status(404).json({ error: "unknown_beneficiary" });
    try {
      const result = await verify(b.type, {
        accountNumber: b.accountNumber,
        ifsc: b.ifsc,
        vpa: b.maskedAccount,
      });
      const updated = updateBeneficiary(req.phone, b.id, {
        verified: result.verified,
        registeredName: result.registeredName ?? b.registeredName,
      });
      const { accountNumber, ...safe } = updated;
      res.json(safe);
    } catch {
      res.status(502).json({ error: "verifier_error" });
    }
  });

  router.delete("/:id", (req, res) => {
    removeBeneficiary(req.phone, req.params.id);
    res.json({ ok: true });
  });

  return router;
}
