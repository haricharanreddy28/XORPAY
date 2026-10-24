import { Router } from "express";

import { requireAuth } from "../auth.js";
import { listTickets, getTicket, createTicket, addTicketMessage } from "../store.js";

// Support & disputes (spec §3.9). Tickets, optionally tied to a transaction
// (a dispute). In-memory; a real build routes these to an agent inbox.
export function supportRoutes() {
  const router = Router();
  router.use(requireAuth);

  router.get("/tickets", (req, res) => {
    res.json({ tickets: listTickets(req.phone) });
  });

  router.get("/tickets/:id", (req, res) => {
    const t = getTicket(req.phone, req.params.id);
    if (!t) return res.status(404).json({ error: "unknown_ticket" });
    res.json(t);
  });

  router.post("/tickets", (req, res) => {
    const { subject, body, txnId = null } = req.body || {};
    if (!subject || !body) return res.status(400).json({ error: "subject_body_required" });
    const t = createTicket(req.phone, {
      subject,
      txnId, // present -> this is a dispute
      messages: [{ from: "user", body, at: Date.now() }],
    });
    res.status(201).json(t);
  });

  router.post("/tickets/:id/reply", (req, res) => {
    const { body } = req.body || {};
    if (!body) return res.status(400).json({ error: "body_required" });
    const t = addTicketMessage(req.phone, req.params.id, {
      from: "user",
      body,
      at: Date.now(),
    });
    if (!t) return res.status(404).json({ error: "unknown_ticket" });
    res.json(t);
  });

  return router;
}
