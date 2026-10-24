"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { setToken } from "@/lib/api";

export default function Login() {
  const [token, setTokenValue] = useState("");
  const router = useRouter();

  const signIn = () => {
    setToken(token.trim());
    router.push("/dashboard");
  };

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="w-80 rounded-2xl border border-line bg-bg-surface p-6">
        <h1 className="mb-4 text-lg font-semibold">Admin sign in</h1>
        <input
          value={token}
          onChange={(e) => setTokenValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && signIn()}
          placeholder="Admin token"
          className="mb-4 w-full rounded-lg border border-line bg-bg-base px-3 py-2 text-sm outline-none"
        />
        <button
          onClick={signIn}
          className="w-full rounded-lg bg-gradient-to-r from-brand-secondary to-brand-primary py-2 text-sm font-semibold text-white"
        >
          Sign in
        </button>
        <p className="mt-3 text-xs text-muted">Dev token: admin-dev</p>
      </div>
    </div>
  );
}
