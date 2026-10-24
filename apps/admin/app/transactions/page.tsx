"use client";

import { useEffect, useState } from "react";
import Shell from "@/components/Shell";
import Table from "@/components/Table";
import { adminFetch, fmtINR } from "@/lib/api";

type Txn = {
  id: string;
  phone: string;
  state: string;
  category: string | null;
  fee: { payeeMinor: number; youPayMinor: number };
};

export default function Transactions() {
  const [txns, setTxns] = useState<Txn[]>([]);

  useEffect(() => {
    adminFetch<{ transactions: Txn[] }>("/admin/transactions")
      .then((d) => setTxns(d.transactions))
      .catch(() => setTxns([]));
  }, []);

  return (
    <Shell>
      <h1 className="mb-6 text-2xl font-bold">Transactions</h1>
      {txns.length === 0 ? (
        <p className="text-muted">No transactions yet.</p>
      ) : (
        <Table head={["Reference", "User", "Category", "Amount", "You pay", "State"]}>
          {txns.map((t) => (
            <tr key={t.id} className="border-t border-line">
              <td className="py-3 font-mono text-xs">{t.id}</td>
              <td>{t.phone}</td>
              <td>{t.category ?? "—"}</td>
              <td>{fmtINR(t.fee.payeeMinor)}</td>
              <td>{fmtINR(t.fee.youPayMinor)}</td>
              <td>{t.state}</td>
            </tr>
          ))}
        </Table>
      )}
    </Shell>
  );
}
