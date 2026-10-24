"use client";

import { useEffect, useState } from "react";
import Shell from "@/components/Shell";
import { adminFetch, fmtINR } from "@/lib/api";

type Metrics = {
  gmvMinor: number;
  feeRevenueMinor: number;
  gstCollectedMinor: number;
  txnCount: number;
  successCount: number;
  successRate: number;
  activeUsers: number;
};

export default function Dashboard() {
  const [m, setM] = useState<Metrics | null>(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    adminFetch<Metrics>("/admin/metrics").then(setM).catch(() => setErr(true));
  }, []);

  return (
    <Shell>
      <h1 className="mb-6 text-2xl font-bold">Dashboard</h1>
      {err && (
        <p className="text-err">
          Couldn&apos;t load metrics. Check the API URL and admin token.
        </p>
      )}
      {m && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Stat label="GMV" value={fmtINR(m.gmvMinor)} />
          <Stat label="Fee revenue" value={fmtINR(m.feeRevenueMinor)} />
          <Stat label="GST collected" value={fmtINR(m.gstCollectedMinor)} />
          <Stat label="Transactions" value={String(m.txnCount)} />
          <Stat label="Success rate" value={`${Math.round(m.successRate * 100)}%`} />
          <Stat label="Active users" value={String(m.activeUsers)} />
        </div>
      )}
    </Shell>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-line bg-bg-surface p-5">
      <div className="text-xs text-muted">{label}</div>
      <div className="mt-2 text-2xl font-bold">{value}</div>
    </div>
  );
}
