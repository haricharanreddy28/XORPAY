"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { getToken } from "@/lib/api";

const NAV: [string, string][] = [
  ["Dashboard", "/dashboard"],
  ["KYC queue", "/kyc"],
  ["Transactions", "/transactions"],
  ["Refunds", "/refunds"],
  ["Reports", "/reports"],
  ["Reconciliation", "/reconciliation"],
];

export default function Shell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const path = usePathname();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!getToken()) router.replace("/login");
    else setReady(true);
  }, [router]);

  if (!ready) return null;

  return (
    <div className="flex min-h-screen">
      <aside className="w-56 shrink-0 border-r border-line p-4">
        <div className="mb-6 bg-gradient-to-r from-brand-secondary to-brand-accent bg-clip-text text-xl font-extrabold text-transparent">
          XORPAY
        </div>
        <nav className="space-y-1">
          {NAV.map(([label, href]) => (
            <Link
              key={href}
              href={href}
              className={`block rounded-lg px-3 py-2 text-sm ${
                path === href
                  ? "bg-brand-primary text-white"
                  : "text-muted hover:bg-bg-surface"
              }`}
            >
              {label}
            </Link>
          ))}
        </nav>
        <button
          onClick={() => {
            window.localStorage.removeItem("admin_token");
            router.replace("/login");
          }}
          className="mt-8 text-xs text-muted hover:text-white"
        >
          Sign out
        </button>
      </aside>
      <main className="flex-1 p-8">{children}</main>
    </div>
  );
}
