import { Router } from "express";

import { requireAuth } from "../auth.js";
import { listTransactions, getTransaction, ledger } from "../store.js";

// Transaction history + detail (spec §3.5). Read-only here; state changes
// happen through the payment flow.
export function transactionRoutes() {
  const router = Router();
  router.use(requireAuth);

  router.get("/", (req, res) => {
    res.json({ transactions: listTransactions(req.phone) });
  });

  router.get("/:id", (req, res) => {
    const txn = getTransaction(req.params.id);
    if (!txn || txn.phone !== req.phone) {
      return res.status(404).json({ error: "unknown_transaction" });
    }
    // Include the ledger entries for this transaction (the money trail).
    res.json({ ...txn, ledger: ledger.forTxn(txn.id) });
  });

  return router;
}
