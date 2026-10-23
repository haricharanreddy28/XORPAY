import { Router } from "express";

import { requireAuth } from "../auth.js";
import { listCards, addCard, removeCard } from "../store.js";
import { validateCardRef } from "./validate.js";

// Card routes (spec §3.2). We store ONLY the PSP token reference + display
// metadata — never the PAN/CVV. The app must tokenise with the PSP SDK first
// and send us the resulting token.
export function cardRoutes() {
  const router = Router();
  router.use(requireAuth);

  router.get("/", (req, res) => {
    res.json({ cards: listCards(req.phone) });
  });

  router.post("/", (req, res) => {
    const check = validateCardRef(req.body || {});
    if (!check.ok) return res.status(400).json({ error: check.error });

    const { token, last4, network, issuer, expiryMonth, expiryYear } = req.body;
    const card = addCard(req.phone, {
      token, // PSP token reference (opaque)
      last4: String(last4),
      network: (network || "other").toLowerCase(),
      issuer: issuer ?? null,
      expiryMonth: Number(expiryMonth),
      expiryYear: Number(expiryYear),
    });
    // Never echo the token back to the client.
    const { token: _omit, ...safe } = card;
    res.status(201).json(safe);
  });

  router.delete("/:id", (req, res) => {
    removeCard(req.phone, req.params.id);
    res.json({ ok: true });
  });

  return router;
}
