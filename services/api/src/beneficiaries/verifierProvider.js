// Beneficiary verification abstraction. Confirms a payee's registered name
// via penny-drop (bank) or UPI name lookup, so the user pays the right person
// (spec §3.3). Swappable like the KYC provider.
//
// A verifier implements:
//   verifyBank({ accountNumber, ifsc }) -> { verified, registeredName? }
//   verifyUpi({ vpa })                  -> { verified, registeredName? }

/** Deterministic dev/sandbox verifier — no network, shaped like the real one. */
export class StubBeneficiaryVerifier {
  name = "stub";
  async verifyBank() {
    return { verified: true, registeredName: "RAMESH TRADERS" };
  }
  async verifyUpi() {
    return { verified: true, registeredName: "RAMESH TRADERS" };
  }
}

/**
 * Cashfree Payouts verifier SKELETON. Cashfree exposes bank-account
 * verification (penny-drop / penny-less) and UPI VPA verification. Confirm the
 * exact endpoints + response fields against your Cashfree Payouts dashboard,
 * then fill the marked spots. Credentials stay server-side.
 */
export class CashfreeBeneficiaryVerifier {
  constructor({ clientId, clientSecret, baseUrl }) {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.baseUrl = baseUrl; // e.g. https://sandbox.cashfree.com/payout
  }
  get name() {
    return "cashfree";
  }
  get _headers() {
    return {
      "x-client-id": this.clientId,
      "x-client-secret": this.clientSecret,
      "Content-Type": "application/json",
    };
  }

  // TODO: set the real path + map the response per Cashfree Payouts docs.
  async verifyBank({ accountNumber, ifsc }) {
    const res = await fetch(`${this.baseUrl}/verification/bank-account`, {
      method: "POST",
      headers: this._headers,
      body: JSON.stringify({ bank_account: accountNumber, ifsc }),
    });
    const data = await res.json().catch(() => ({}));
    return {
      verified: data?.account_status === "VALID",
      registeredName: data?.name_at_bank ?? null,
    };
  }

  async verifyUpi({ vpa }) {
    const res = await fetch(`${this.baseUrl}/verification/upi`, {
      method: "POST",
      headers: this._headers,
      body: JSON.stringify({ vpa }),
    });
    const data = await res.json().catch(() => ({}));
    return {
      verified: data?.account_status === "VALID",
      registeredName: data?.name_at_bank ?? null,
    };
  }
}

export function makeBeneficiaryVerifier(env = process.env) {
  const useCashfree =
    (env.PAYOUT_PROVIDER || "").toLowerCase() === "cashfree" &&
    env.CASHFREE_PAYOUT_CLIENT_ID &&
    env.CASHFREE_PAYOUT_CLIENT_SECRET;

  if (useCashfree) {
    return new CashfreeBeneficiaryVerifier({
      clientId: env.CASHFREE_PAYOUT_CLIENT_ID,
      clientSecret: env.CASHFREE_PAYOUT_CLIENT_SECRET,
      baseUrl: env.CASHFREE_PAYOUT_BASE_URL || "https://sandbox.cashfree.com/payout",
    });
  }
  return new StubBeneficiaryVerifier();
}
