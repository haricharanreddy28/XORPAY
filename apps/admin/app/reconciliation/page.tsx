"use client";

import { useEffect, useState } from "react";
import Shell from "@/components/Shell";
import Table from "@/components/Table";
import { adminFetch, fmtINR } from "@/lib/api";

type Recon = { balances: Record<string, number>; entries: number };

export default function Reconciliation() {
  const [r, setR] = useState<Recon | null>(null);

  useEffect(() => {
    adminFetch<Recon>("/admin/reconciliation").then(setR).catch(() => setR(null));
  }, []);

  return (
    <Shell>
      <h1 className="mb-2 text-2xl font-bold">Reconciliation</h1>
      <p className="mb-6 text-sm text-muted">
        Double-entry ledger balances (paise, debit-positive).
      </p>
      {r && (
        <>
          <Table head={["Account", "Balance"]}>
            {Object.entries(r.balances).map(([acc, bal]) => (
              <tr key={acc} className="border-t border-line">
                <td className="py-3 capitalize">{acc.replace(/_/g, " ")}</td>
                <td>{fmtINR(bal)}</td>
              </tr>
            ))}
          </Table>
          <p className="mt-4 text-xs text-muted">{r.entries} ledger entries</p>
        </>
      )}
    </Shell>
  );
}
