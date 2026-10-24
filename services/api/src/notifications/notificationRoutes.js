import { Router } from "express";

import { requireAuth } from "../auth.js";
import { listNotifications, markNotificationRead } from "../store.js";

// Notification centre (spec §3.9).
export function notificationRoutes() {
  const router = Router();
  router.use(requireAuth);

  router.get("/", (req, res) => {
    const list = listNotifications(req.phone);
    res.json({ notifications: list, unread: list.filter((n) => !n.read).length });
  });

  router.post("/:id/read", (req, res) => {
    markNotificationRead(req.phone, req.params.id);
    res.json({ ok: true });
  });

  return router;
}
