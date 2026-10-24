import { Router } from "express";

import { requireAuth } from "../auth.js";
import {
  listInvoices,
  addInvoices,
  getInvoicesByIds,
  markInvoicesPaid,
} from "../store.js";
import { makeGstrImporter } from "./importProvider.js";
import { summarizeInvoices } from "./tds.js";

// GST Hub (spec §3.4.6): import purchase invoices, list by supplier, and pay a
// selection with an optional TDS deduction. The importer is swappable (stub /
// GSP). Actual settlement reuses the payment flow.
export function invoiceRoutes() {
  const router = Router();
  const importer = makeGstrImporter();
  router.use(requireAuth);

  // Import from GSTR-2A/2B (real flow authenticates the GSTIN via a GSP).
  router.post("/import", async (req, res) => {
    const source = (req.body?.source || "2B").toUpperCase();
    try {
      const fetched = await importer.fetchInvoices(req.phone, source, req.body?.period);
      const added = addInvoices(req.phone, fetched);
      res.json({ imported: added.length, total: listInvoices(req.phone).length });
    } catch {
      res.status(502).json({ error: "import_failed" });
    }
  });

  // List invoices (optionally ?status=unpaid|paid).
  router.get("/", (req, res) => {
    res.json({ invoices: listInvoices(req.phone, req.query.status) });
  });

  // Unpaid totals grouped by supplier.
  router.get("/suppliers", (req, res) => {
    const unpaid = listInvoices(req.phone, "unpaid");
    const bySupplier = new Map();
    for (const inv of unpaid) {
      const key = inv.supplierGstin;
      const agg = bySupplier.get(key) ?? {
        supplierGstin: key,
        supplierName: inv.supplierName,
        count: 0,
        unpaidMinor: 0,
      };
      agg.count += 1;
      agg.unpaidMinor += inv.amountMinor;
      bySupplier.set(key, agg);
    }
    res.json({ suppliers: [...bySupplier.values()] });
  });

  // Compute a payable summary for a selection (with optional TDS). This is the
  // quote the app shows before checkout; the order is created via /payments.
  router.post("/quote", (req, res) => {
    const { invoiceIds = [], withTds = false, tdsRatePct = 2 } = req.body || {};
    const invs = getInvoicesByIds(req.phone, invoiceIds).filter((i) => i.status === "unpaid");
    if (invs.length === 0) return res.status(400).json({ error: "no_unpaid_invoices" });
    const summary = summarizeInvoices(invs, { withTds, ratePct: tdsRatePct });
    res.json({ ...summary, invoiceIds: invs.map((i) => i.id) });
  });

  // Mark a selection paid (ties to a completed txn). Dev convenience; in
  // production this is driven by the payment confirmation/webhook.
  router.post("/mark-paid", (req, res) => {
    const { invoiceIds = [], txnId = null } = req.body || {};
    markInvoicesPaid(req.phone, invoiceIds, txnId);
    res.json({ ok: true, unpaid: listInvoices(req.phone, "unpaid").length });
  });

  return router;
}
