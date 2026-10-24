"use client";

import { useEffect, useState } from "react";
import Shell from "@/components/Shell";
import { adminFetch } from "@/lib/api";

type AuditEvent = {
  request_id: string;
  actor_subject: string;
  actor_role: string;
  http_method: string;
  action: string;
  resource_sha256: string | null;
  response_status: number | null;
  started_at: string;
  completed_at: string | null;
};

export default function AuditPage() {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    adminFetch<{ events: AuditEvent[] }>("/admin/audit?limit=200")
      .then((response) => setEvents(response.events))
      .catch(() => setError("Audit trail is unavailable or your role cannot view it."));
  }, []);

  return (
    <Shell>
      <h1 className="mb-2 text-2xl font-bold">Admin audit trail</h1>
      <p className="mb-6 text-sm text-muted">Recorded admin mutations and their response status.</p>
      {error && <div role="alert" className="mb-4 rounded-lg border border-line p-3 text-sm">{error}</div>}
      <div className="overflow-x-auto rounded-xl border border-line">
        <table className="w-full text-left text-sm">
          <thead className="bg-bg-surface text-muted">
            <tr>
              <th className="p-3">Time</th><th className="p-3">Actor</th>
              <th className="p-3">Role</th><th className="p-3">Action</th>
              <th className="p-3">Status</th><th className="p-3">Resource fingerprint</th>
            </tr>
          </thead>
          <tbody>
            {events.map((event) => (
              <tr key={event.request_id} className="border-t border-line">
                <td className="whitespace-nowrap p-3">{new Date(event.started_at).toLocaleString()}</td>
                <td className="max-w-48 truncate p-3" title={event.actor_subject}>{event.actor_subject}</td>
                <td className="p-3">{event.actor_role}</td>
                <td className="p-3">{event.http_method} {event.action}</td>
                <td className="p-3">{event.response_status ?? "in progress"}</td>
                <td className="max-w-40 truncate p-3 font-mono text-xs" title={event.resource_sha256 || ""}>
                  {event.resource_sha256?.slice(0, 12) || "—"}
                </td>
              </tr>
            ))}
            {!events.length && !error && (
              <tr><td className="p-6 text-muted" colSpan={6}>No admin changes recorded.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}
