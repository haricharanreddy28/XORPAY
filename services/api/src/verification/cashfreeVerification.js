// Cashfree Verification Suite client (PAN / GSTIN / bank / UPI name-match).
// One vendor for pay-in, payout AND verification.
//
// Credentials come ONLY from the server environment (never the app/repo):
//   CASHFREE_VERIFY_CLIENT_ID, CASHFREE_VERIFY_CLIENT_SECRET
// Environment: CASHFREE_ENV=PRODUCTION uses api.cashfree.com, else sandbox.
//
// Endpoint paths/response fields follow Cashfree's Verification ("Secure ID")
// API; confirm the exact version against your dashboard if a field differs.
// The methods normalise responses to the shapes the KYC / beneficiary code uses.

function base(env = process.env) {
  return (env.CASHFREE_ENV || "SANDBOX").toUpperCase() === "PRODUCTION"
    ? "https://api.cashfree.com"
    : "https://sandbox.cashfree.com";
}

function creds(env = process.env) {
  const id = env.CASHFREE_VERIFY_CLIENT_ID;
  const secret = env.CASHFREE_VERIFY_CLIENT_SECRET;
  if (!id || !secret) return null;
  return { id, secret };
}

export function cashfreeVerificationConfigured(env = process.env) {
  return creds(env) !== null;
}

async function post(path, body, env = process.env) {
  const c = creds(env);
  if (!c) {
    const e = new Error("cashfree_verification_not_configured");
    e.status = 503;
    throw e;
  }
  const res = await fetch(`${base(env)}${path}`, {
    method: "POST",
    headers: {
      "x-client-id": c.id,
      "x-client-secret": c.secret,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = new Error(`cashfree_verification ${path} -> ${res.status}`);
    e.status = res.status;
    e.detail = data;
    throw e;
  }
  return data;
}

// PAN verification -> { verified, registeredName, nameMatch? }
export async function verifyPan(pan, name) {
  const d = await post("/verification/pan", { pan, name });
  return {
    verified: d?.valid === true || d?.status === "VALID",
    registeredName: d?.registered_name ?? d?.name ?? null,
    nameMatch: d?.name_match_result ?? null,
  };
}

// GSTIN verification -> { verified, legalName, address, status }
export async function verifyGstin(gstin) {
  const d = await post("/verification/gstin", { GSTIN: gstin });
  return {
    verified: d?.valid === true,
    legalName: d?.legal_name_of_business ?? d?.trade_name ?? null,
    address: d?.principal_place_of_business ?? null,
    status: d?.gst_in_status ?? d?.status ?? null,
  };
}

// Bank account (penny-less / penny-drop) -> { verified, registeredName }
export async function verifyBank({ accountNumber, ifsc, name }) {
  const d = await post("/verification/bank-account/sync", {
    bank_account: accountNumber,
    ifsc,
    name,
  });
  return {
    verified: (d?.account_status ?? "").toUpperCase() === "VALID",
    registeredName: d?.name_at_bank ?? null,
  };
}

// UPI VPA name lookup -> { verified, registeredName }
export async function verifyUpi({ vpa }) {
  const d = await post("/verification/upi", { vpa });
  return {
    verified: (d?.account_status ?? "").toUpperCase() === "VALID",
    registeredName: d?.name_at_bank ?? d?.registered_name ?? null,
  };
}
