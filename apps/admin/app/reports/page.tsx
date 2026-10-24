"use client";

import { useState } from "react";
import Shell from "@/components/Shell";
import { adminFetch, fmtINR } from "@/lib/api";

type Report = {
  settlementMinor: number;
  settledCount: number;
  gstOnFeesMinor: number;
  feeRevenueMinor: number;
  gmvMinor: number;
};

export default function Reports() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [r, setR] = useState<Report | null>(null);
  const [err, setErr] = useState("");

  const run = () => {
    setErr("");
    const q = new URLSearchParams();
    if (from) q.set("from", String(new Date(from).getTime()));
    if (to) q.set("to", String(new Date(to).getTime()));
    adminFetch<Report>(`/admin/reports?${q.toString()}`)
      .then(setR)
      .catch(() => setErr("Couldn't load the report (needs the finance role)."));
  };

  return (
    <Shell>
      <h1 className="mb-2 text-2xl font-bold">Reports</h1>
      <p className="mb-6 text-sm text-muted">Settlement, GST-on-fees and revenue for the CA.</p>
      <div className="mb-6 flex items-end gap-3">
        <Field label="From" value={from} onChange={setFrom} />
        <Field label="To" value={to} onChange={setTo} />
        <button
          onClick={run}
          className="rounded-lg bg-gradient-to-r from-brand-secondary to-brand-primary px-4 py-2 text-sm font-semibold text-white"
        >
          Run report
        </button>
      </div>
      {err && <p className="text-err">{err}</p>}
      {r && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
          <Stat label="Settled to payees" value={fmtINR(r.settlementMinor)} sub={`${r.settledCount} txns`} />
          <Stat label="GST on fees (to remit)" value={fmtINR(r.gstOnFeesMinor)} />
          <Stat label="Fee revenue" value={fmtINR(r.feeRevenueMinor)} />
          <Stat label="GMV" value={fmtINR(r.gmvMinor)} />
        </div>
      )}
    </Shell>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="text-xs text-muted">
      {label}
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 block rounded-lg border border-line bg-bg-surface px-3 py-2 text-sm text-white"
      />
    </label>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-line bg-bg-surface p-5">
      <div className="text-xs text-muted">{label}</div>
      <div className="mt-2 text-2xl font-bold">{value}</div>
      {sub && <div className="mt-1 text-xs text-muted">{sub}</div>}
    </div>
  );
}
