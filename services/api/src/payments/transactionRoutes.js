import { Router } from "express";

import { requireAuth } from "../auth.js";
import { listTransactions, getTransaction, ledger } from "../store.js";
import { databaseConfigured } from "../db/database.js";
import { getPayment, getPaymentLedger, listPayments } from "./paymentRepository.js";

export function transactionRoutes() {
  const router = Router();
  router.use(requireAuth);

  router.get("/", async (req, res) => {
    try {
      const transactions = databaseConfigured()
        ? await listPayments(req.phone)
        : listTransactions(req.phone);
      res.json({ transactions });
    } catch {
      res.status(503).json({ error: "transactions_unavailable" });
    }
  });

  router.get("/:id", async (req, res) => {
    try {
      const txn = databaseConfigured()
        ? await getPayment(req.params.id)
        : getTransaction(req.params.id);
      if (!txn || txn.phone !== req.phone) {
        return res.status(404).json({ error: "unknown_transaction" });
      }
      const entries = databaseConfigured()
        ? await getPaymentLedger(txn.id)
        : ledger.forTxn(txn.id);
      res.json({ ...txn, ledger: entries });
    } catch {
      res.status(503).json({ error: "transaction_unavailable" });
    }
  });

  return router;
}
