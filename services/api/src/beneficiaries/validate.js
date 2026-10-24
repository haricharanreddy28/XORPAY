// Beneficiary input validation (pure, unit-tested).

// IFSC: 4 bank letters, a 0, then 6 branch alphanumerics.
const IFSC_RE = /^[A-Z]{4}0[0-9A-Z]{6}$/;
// UPI VPA: handle@psp (basic shape; the name lookup confirms it's real).
const VPA_RE = /^[\w.\-]{2,256}@[a-zA-Z]{2,64}$/;

export function isValidIfsc(ifsc) {
  return IFSC_RE.test(String(ifsc ?? "").toUpperCase());
}

export function isValidVpa(vpa) {
  return VPA_RE.test(String(vpa ?? ""));
}

/** Mask the VPA handle but retain the provider suffix for user confirmation. */
export function maskVpa(vpa) {
  const value = String(vpa ?? "");
  const at = value.lastIndexOf("@");
  if (at < 1) return "••••";
  const handle = value.slice(0, at);
  const suffix = value.slice(at + 1);
  return `${handle.slice(0, Math.min(2, handle.length))}•••@${suffix}`;
}

/** Account numbers are 9–18 digits in India. */
export function isValidAccount(acc) {
  return /^\d{9,18}$/.test(String(acc ?? ""));
}

/** Show only the last 4 digits: "•• 4521". */
export function maskAccount(acc) {
  const s = String(acc ?? "");
  if (s.length <= 4) return s;
  return `•• ${s.slice(-4)}`;
}

/**
 * Validate an add-beneficiary payload.
 * @returns {{ok:true, type:'bank'|'upi'}|{ok:false, error:string}}
 */
export function validateBeneficiary(body = {}) {
  const type = body.type;
  if (type === "bank") {
    if (!isValidAccount(body.accountNumber)) return { ok: false, error: "bad_account" };
    if (!isValidIfsc(body.ifsc)) return { ok: false, error: "bad_ifsc" };
    return { ok: true, type };
  }
  if (type === "upi") {
    if (!isValidVpa(body.vpa)) return { ok: false, error: "bad_vpa" };
    return { ok: true, type };
  }
  return { ok: false, error: "bad_type" };
}
