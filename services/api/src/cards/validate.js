// Card input guards. The backend stores only a PSP token reference — it must
// NEVER receive or persist a full card number (PAN) or CVV (spec §6, PCI-DSS).
// These helpers are pure and unit-tested.

/** A run of 12–19 digits looks like a PAN — reject it if it reaches us. */
export function looksLikePan(value) {
  if (value == null) return false;
  const digits = String(value).replace(/[\s-]/g, "");
  return /^\d{12,19}$/.test(digits);
}

/** True if any field in the object contains a PAN-looking value. */
export function containsPan(obj = {}) {
  return Object.values(obj).some(looksLikePan);
}

const NETWORKS = new Set([
  "visa",
  "mastercard",
  "rupay",
  "amex",
  "diners",
  "other",
]);

/** Validate the token-reference payload the app sends after PSP tokenisation. */
export function validateCardRef(body = {}) {
  const { token, last4, network, expiryMonth, expiryYear } = body;

  if (containsPan(body)) return { ok: false, error: "pan_not_allowed" };
  if (!token || typeof token !== "string") return { ok: false, error: "token_required" };
  if (!/^\d{4}$/.test(String(last4 ?? ""))) return { ok: false, error: "bad_last4" };
  if (network && !NETWORKS.has(String(network).toLowerCase())) {
    return { ok: false, error: "bad_network" };
  }
  const m = Number(expiryMonth);
  const y = Number(expiryYear);
  if (!(m >= 1 && m <= 12)) return { ok: false, error: "bad_expiry_month" };
  if (!(y >= 2000 && y <= 2099)) return { ok: false, error: "bad_expiry_year" };

  return { ok: true };
}
