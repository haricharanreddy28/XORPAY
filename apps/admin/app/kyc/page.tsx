"use client";

import { useCallback, useEffect, useState } from "react";
import Shell from "@/components/Shell";
import Table from "@/components/Table";
import { adminFetch } from "@/lib/api";

type User = {
  phone: string;
  tier: string;
  reviewStatus: string;
  legalName: string | null;
  panVerified: boolean;
  gstVerified: boolean;
};

export default function Kyc() {
  const [users, setUsers] = useState<User[]>([]);

  const load = useCallback(() => {
    adminFetch<{ users: User[] }>("/admin/kyc")
      .then((d) => setUsers(d.users))
      .catch(() => setUsers([]));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const decide = async (phone: string, decision: "approve" | "reject") => {
    await adminFetch(`/admin/kyc/${phone}/decision`, {
      method: "POST",
      body: JSON.stringify({ decision }),
    });
    load();
  };

  return (
    <Shell>
      <h1 className="mb-6 text-2xl font-bold">KYC queue</h1>
      {users.length === 0 ? (
        <p className="text-muted">No KYC records yet.</p>
      ) : (
        <Table head={["Phone", "Tier", "Legal name", "Status", ""]}>
          {users.map((u) => (
            <tr key={u.phone} className="border-t border-line">
              <td className="py-3">{u.phone}</td>
              <td>{u.tier}</td>
              <td>{u.legalName ?? "—"}</td>
              <td>{u.reviewStatus}</td>
              <td className="py-3 text-right">
                <button onClick={() => decide(u.phone, "approve")} className="mr-3 text-ok">
                  Approve
                </button>
                <button onClick={() => decide(u.phone, "reject")} className="text-err">
                  Reject
                </button>
              </td>
            </tr>
          ))}
        </Table>
      )}
    </Shell>
  );
}
