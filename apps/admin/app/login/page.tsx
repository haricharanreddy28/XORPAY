"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { setToken } from "@/lib/api";

const AUTH_DOMAIN = process.env.NEXT_PUBLIC_COGNITO_DOMAIN?.replace(/\/+$/, "");
const CLIENT_ID = process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID;
const REDIRECT_URI = process.env.NEXT_PUBLIC_COGNITO_REDIRECT_URI;
const AUTH_MODE = process.env.NEXT_PUBLIC_ADMIN_AUTH_MODE || "cognito";

function randomVerifier(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(48));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function challengeFor(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return btoa(String.fromCharCode(...new Uint8Array(digest))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export default function Login() {
  const [devToken, setDevToken] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const returnedState = params.get("state");
    const oauthError = params.get("error");
    if (oauthError) {
      setMessage("Sign-in was cancelled or rejected. Please try again.");
      return;
    }
    if (!code) return;
    const verifier = window.sessionStorage.getItem("xorpay_pkce_verifier");
    const expectedState = window.sessionStorage.getItem("xorpay_oauth_state");
    if (!verifier || !returnedState || returnedState !== expectedState ||
        !AUTH_DOMAIN || !CLIENT_ID || !REDIRECT_URI) {
      setMessage("Sign-in could not be verified. Start again.");
      return;
    }

    setBusy(true);
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      client_id: CLIENT_ID,
      code,
      redirect_uri: REDIRECT_URI,
      code_verifier: verifier,
    });
    fetch(`${AUTH_DOMAIN}/oauth2/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok || typeof payload.access_token !== "string") {
          throw new Error("token_exchange_failed");
        }
        setToken(payload.access_token);
        window.sessionStorage.removeItem("xorpay_pkce_verifier");
        window.sessionStorage.removeItem("xorpay_oauth_state");
        window.history.replaceState({}, "", "/login");
        router.replace("/dashboard");
      })
      .catch(() => setMessage("Sign-in failed. Please try again."))
      .finally(() => setBusy(false));
  }, [router]);

  async function signInWithCognito() {
    if (!AUTH_DOMAIN || !CLIENT_ID || !REDIRECT_URI) {
      setMessage("Admin sign-in is not configured yet.");
      return;
    }
    setBusy(true);
    const verifier = randomVerifier();
    const state = randomVerifier();
    window.sessionStorage.setItem("xorpay_pkce_verifier", verifier);
    window.sessionStorage.setItem("xorpay_oauth_state", state);
    const challenge = await challengeFor(verifier);
    const params = new URLSearchParams({
      response_type: "code",
      client_id: CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      scope: "openid email",
      state,
      code_challenge_method: "S256",
      code_challenge: challenge,
    });
    window.location.assign(`${AUTH_DOMAIN}/oauth2/authorize?${params}`);
  }

  function signInDev(event: FormEvent) {
    event.preventDefault();
    if (!devToken.trim()) return;
    setToken(devToken.trim());
    router.push("/dashboard");
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-2xl border border-line bg-bg-surface p-6">
        <h1 className="mb-2 text-xl font-semibold">XORPAY admin</h1>
        <p className="mb-6 text-sm text-muted">Sign in with your authorized operations account.</p>
        {AUTH_MODE === "dev" ? (
          <form onSubmit={signInDev}>
            <label className="mb-2 block text-sm" htmlFor="dev-token">Local development token</label>
            <input
              id="dev-token"
              value={devToken}
              onChange={(event) => setDevToken(event.target.value)}
              autoComplete="off"
              className="mb-4 w-full rounded-lg border border-line bg-bg-base px-3 py-3 text-sm outline-none"
            />
            <button className="w-full rounded-lg bg-gradient-to-r from-brand-secondary to-brand-primary py-3 text-sm font-semibold text-white">
              Continue
            </button>
          </form>
        ) : (
          <button
            disabled={busy}
            onClick={signInWithCognito}
            className="w-full rounded-lg bg-gradient-to-r from-brand-secondary to-brand-primary py-3 text-sm font-semibold text-white disabled:opacity-60"
          >
            {busy ? "Signing in…" : "Sign in securely"}
          </button>
        )}
        {message && <p role="alert" className="mt-4 text-sm text-red-500">{message}</p>}
      </div>
    </div>
  );
}
