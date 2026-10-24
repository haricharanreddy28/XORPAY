"use client";

import { useCallback, useEffect, useState } from "react";
import Shell from "@/components/Shell";
import Table from "@/components/Table";
import { adminFetch } from "@/lib/api";

type Refund = {
  id: string;
  txnId: string;
  reason: string | null;
  status: string;
  requestedBy: string;
  approvedBy?: string;
};

export default function Refunds() {
  const [refunds, setRefunds] = useState<Refund[]>([]);
  const [txnId, setTxnId] = useState("");
  const [reason, setReason] = useState("");
  const [msg, setMsg] = useState("");

  const load = useCallback(() => {
    adminFetch<{ refunds: Refund[] }>("/admin/refunds")
      .then((d) => setRefunds(d.refunds))
      .catch(() => setMsg("Refunds need the finance role."));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const request = async () => {
    setMsg("");
    try {
      await adminFetch("/admin/refunds/request", {
        method: "POST",
        body: JSON.stringify({ txnId: txnId.trim(), reason }),
      });
      setTxnId("");
      setReason("");
      load();
    } catch {
      setMsg("Couldn't request refund (check the transaction is refundable).");
    }
  };

  const approve = async (id: string) => {
    setMsg("");
    try {
      await adminFetch(`/admin/refunds/${id}/approve`, { method: "POST" });
      load();
    } catch {
      setMsg("Approval failed — a different finance admin must approve (maker-checker).");
    }
  };

  return (
    <Shell>
      <h1 className="mb-2 text-2xl font-bold">Refunds</h1>
      <p className="mb-6 text-sm text-muted">
        Maker-checker: one admin requests, a different admin approves.
      </p>

      <div className="mb-6 flex items-end gap-3">
        <label className="text-xs text-muted">
          Transaction id
          <input
            value={txnId}
            onChange={(e) => setTxnId(e.target.value)}
            className="mt-1 block w-72 rounded-lg border border-line bg-bg-surface px-3 py-2 text-sm text-white"
          />
        </label>
        <label className="text-xs text-muted">
          Reason
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="mt-1 block w-60 rounded-lg border border-line bg-bg-surface px-3 py-2 text-sm text-white"
          />
        </label>
        <button
          onClick={request}
          disabled={!txnId.trim()}
          className="rounded-lg bg-gradient-to-r from-brand-secondary to-brand-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          Request refund
        </button>
      </div>
      {msg && <p className="mb-4 text-warn">{msg}</p>}

      <Table head={["Refund", "Transaction", "Reason", "Status", ""]}>
        {refunds.map((r) => (
          <tr key={r.id} className="border-t border-line">
            <td className="py-3 font-mono text-xs">{r.id}</td>
            <td className="font-mono text-xs">{r.txnId}</td>
            <td>{r.reason ?? "—"}</td>
            <td>{r.status}</td>
            <td className="py-3 text-right">
              {r.status === "pending" && (
                <button onClick={() => approve(r.id)} className="text-ok">
                  Approve
                </button>
              )}
            </td>
          </tr>
        ))}
      </Table>
    </Shell>
  );
}
