export const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8080";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem("admin_token");
}

export function setToken(token: string): void {
  if (typeof window !== "undefined") window.localStorage.setItem("admin_token", token);
}

export async function adminFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "x-admin-token": getToken() ?? "",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(`request failed: ${res.status}`);
  return (await res.json()) as T;
}

/** Format paise as Indian rupees. */
export function fmtINR(paise: number): string {
  return "₹" + (paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 });
}
