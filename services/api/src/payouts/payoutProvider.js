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
 * Cashfree Payouts (V2 API, x-api-version 2024-01-01). Direct client-id/secret
 * auth — no token exchange. Disburses to a bank account or UPI VPA and reports
 * status via API + webhook. Credentials come only from the server env.
 *
 * NOTE: this disburses to a payee (vendor/rent). Biller categories (GST, tax,
 * education, card bill) settle through BBPS, a separate rail not wired here —
 * without a destination the transfer is treated as a permanent failure, which
 * auto-refunds the user.
 */
export class CashfreePayoutProvider {
  constructor({ clientId, clientSecret, baseUrl }) {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.baseUrl = baseUrl; // e.g. https://payout-api.cashfree.com/payout
  }
  get name() {
    return "cashfree";
  }
  get _headers() {
    return {
      "x-client-id": this.clientId,
      "x-client-secret": this.clientSecret,
      "x-api-version": "2024-01-01",
      "Content-Type": "application/json",
    };
  }

  _beneficiaryDetails(b) {
    if (!b) return null;
    const name = b.registeredName || b.nickname || "Beneficiary";
    if (b.type === "upi" && b.maskedAccount) {
      return {
        beneficiary_name: name,
        beneficiary_instrument_details: { vpa: b.maskedAccount },
      };
    }
    if (b.type === "bank" && b.accountNumber && b.ifsc) {
      return {
        beneficiary_name: name,
        beneficiary_instrument_details: {
          bank_account_number: b.accountNumber,
          bank_ifsc: b.ifsc,
        },
      };
    }
    return null;
  }

  _map(res, data) {
    const s = (data?.status ?? "").toUpperCase();
    const status = s === "SUCCESS" ? "SUCCESS" : s === "FAILED" || s === "REJECTED" ? "FAILED" : "PENDING";
    return {
      status,
      utr: data?.transfer_utr ?? null,
      failureReason: data?.status_description ?? data?.message ?? null,
      // 4xx (validation / bad beneficiary) won't succeed on retry.
      permanent: status === "FAILED" || (res.status >= 400 && res.status < 500),
    };
  }

  async initiatePayout({ amountMinor, reference, beneficiary }) {
    const details = this._beneficiaryDetails(beneficiary);
    if (!details) {
      return { status: "FAILED", permanent: true, failureReason: "no_destination" };
    }
    const mode = beneficiary.type === "upi" ? "upi" : "banktransfer";
    try {
      const res = await fetch(`${this.baseUrl}/transfers`, {
        method: "POST",
        headers: this._headers,
        body: JSON.stringify({
          transfer_id: reference,
          transfer_amount: Number((amountMinor / 100).toFixed(2)),
          transfer_mode: mode,
          beneficiary_details: details,
        }),
      });
      const data = await res.json().catch(() => ({}));
      return this._map(res, data);
    } catch {
      return { status: "FAILED", permanent: false, failureReason: "network_error" };
    }
  }

  async getPayoutStatus(reference) {
    const res = await fetch(
      `${this.baseUrl}/transfers?transfer_id=${encodeURIComponent(reference)}`,
      { headers: this._headers },
    );
    const data = await res.json().catch(() => ({}));
    return { status: (data?.status ?? "PENDING").toUpperCase(), utr: data?.transfer_utr ?? null };
  }
}

export function makePayoutProvider(env = process.env) {
  if (env.CASHFREE_PAYOUT_CLIENT_ID && env.CASHFREE_PAYOUT_CLIENT_SECRET) {
    const prod = (env.CASHFREE_ENV || "SANDBOX").toUpperCase() === "PRODUCTION";
    return new CashfreePayoutProvider({
      clientId: env.CASHFREE_PAYOUT_CLIENT_ID,
      clientSecret: env.CASHFREE_PAYOUT_CLIENT_SECRET,
      baseUrl:
        env.CASHFREE_PAYOUT_BASE_URL ||
        (prod
          ? "https://payout-api.cashfree.com/payout"
          : "https://payout-gamma.cashfree.com/payout"),
    });
  }
  return new StubPayoutProvider();
}
