// Payout provider abstraction (spec §5). Sends money OUT to a beneficiary's
// bank/UPI via IMPS/NEFT/UPI. Swappable like the other providers.
//
// A provider implements:
//   initiatePayout({ amountMinor, reference, beneficiary })
//     -> { status: 'SUCCESS' | 'PENDING' | 'FAILED', utr?, failureReason?, permanent? }
//   getPayoutStatus(reference) -> same shape

/** Deterministic dev payout provider: always succeeds with a fake UTR. */
export class StubPayoutProvider {
  name = "stub";
  async initiatePayout({ reference }) {
    return { status: "SUCCESS", utr: `UTRSTUB${reference.slice(-8).toUpperCase()}` };
  }
  async getPayoutStatus() {
    return { status: "SUCCESS" };
  }
}

/**
 * Cashfree Payouts SKELETON. Cashfree Payouts creates a beneficiary then a
 * transfer (IMPS/NEFT/UPI) and reports status via API + webhook. Confirm the
 * exact endpoints + auth (it uses a separate client-id/secret and a bearer
 * token exchange) against your Payouts dashboard, then fill the marked spots.
 * Credentials stay server-side.
 */
export class CashfreePayoutProvider {
  constructor({ clientId, clientSecret, baseUrl }) {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.baseUrl = baseUrl; // e.g. https://sandbox.cashfree.com/payout
  }
  get name() {
    return "cashfree";
  }

  // TODO: Cashfree Payouts uses a token exchange (/payout/v1/authorize) then
  // Bearer auth. Wire that, then call the standard transfer endpoint and map
  // the response/status codes. Treat validation/KYC errors as permanent.
  async initiatePayout({ amountMinor, reference, beneficiary }) {
    const res = await fetch(`${this.baseUrl}/transfers`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        transfer_id: reference,
        amount: (amountMinor / 100).toFixed(2),
        beneficiary_details: beneficiary ?? {},
      }),
    });
    const data = await res.json().catch(() => ({}));
    const s = data?.status ?? (res.ok ? "PENDING" : "FAILED");
    return {
      status: s === "SUCCESS" ? "SUCCESS" : s === "PENDING" ? "PENDING" : "FAILED",
      utr: data?.utr ?? null,
      failureReason: data?.reason ?? null,
      permanent: res.status >= 400 && res.status < 500, // client errors = permanent
    };
  }

  async getPayoutStatus(reference) {
    const res = await fetch(`${this.baseUrl}/transfers/${reference}`, {
      headers: { "Content-Type": "application/json" },
    });
    const data = await res.json().catch(() => ({}));
    return { status: data?.status ?? "PENDING", utr: data?.utr ?? null };
  }
}

export function makePayoutProvider(env = process.env) {
  const useCashfree =
    (env.PAYOUT_PROVIDER || "").toLowerCase() === "cashfree" &&
    env.CASHFREE_PAYOUT_CLIENT_ID &&
    env.CASHFREE_PAYOUT_CLIENT_SECRET;

  if (useCashfree) {
    return new CashfreePayoutProvider({
      clientId: env.CASHFREE_PAYOUT_CLIENT_ID,
      clientSecret: env.CASHFREE_PAYOUT_CLIENT_SECRET,
      baseUrl: env.CASHFREE_PAYOUT_BASE_URL || "https://sandbox.cashfree.com/payout",
    });
  }
  return new StubPayoutProvider();
}
