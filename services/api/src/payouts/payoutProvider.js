// Cashfree Payouts v2 adapter.
// Contract verified against Cashfree's official Node SDK (2024-01-01 API):
// POST /transfers and GET /transfers?transfer_id=..., authenticated with
// x-client-id / x-client-secret. A stable transfer_id makes retries traceable.

const API_VERSION = "2024-01-01";
const FINAL_SUCCESS = new Set(["SUCCESS"]);
const FINAL_FAILURE = new Set(["FAILED", "REJECTED"]);

function mapResponse(data, httpOk = true) {
  const raw = String(data?.status ?? "").toUpperCase();
  if (FINAL_SUCCESS.has(raw)) {
    return { status: "SUCCESS", utr: data?.utr ?? null, providerReference: data?.cf_transfer_id ?? null };
  }
  if (FINAL_FAILURE.has(raw)) {
    return {
      status: "FAILED",
      permanent: true,
      failureReason: String(data?.status_description ?? data?.message ?? "payout_failed").slice(0, 120),
      providerReference: data?.cf_transfer_id ?? null,
    };
  }
  // RECEIVED/TRANSFER_ACCEPTED/PENDING and unknown successful responses are
  // deliberately non-terminal. Never turn uncertainty into a refund.
  return {
    status: "PENDING",
    providerReference: data?.cf_transfer_id ?? null,
    failureReason: httpOk ? null : "provider_response_unconfirmed",
  };
}

export class CashfreePayoutProvider {
  constructor({ clientId, clientSecret, baseUrl, fetchImpl = fetch, apiVersion = API_VERSION }) {
    if (!clientId || !clientSecret) throw new Error("Cashfree Payouts credentials are required");
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.baseUrl = String(baseUrl).replace(/\\/$/, "");
    this.fetch = fetchImpl;
    this.apiVersion = apiVersion;
  }

  get name() {
    return "cashfree";
  }

  _headers(requestId) {
    return {
      "Content-Type": "application/json",
      "x-client-id": this.clientId,
      "x-client-secret": this.clientSecret,
      "x-api-version": this.apiVersion,
      "x-request-id": requestId,
    };
  }

  async _json(response) {
    return response.json().catch(() => ({}));
  }

  async initiatePayout({ amountMinor, reference, beneficiary }) {
    if (!Number.isSafeInteger(amountMinor) || amountMinor < 100) {
      return { status: "FAILED", permanent: true, failureReason: "invalid_payout_amount" };
    }
    if (!/^[A-Za-z0-9_]{1,40}$/.test(String(reference))) {
      return { status: "FAILED", permanent: true, failureReason: "invalid_transfer_reference" };
    }
    if (!beneficiary?.verified || !beneficiary.registeredName) {
      return { status: "FAILED", permanent: true, failureReason: "verified_beneficiary_required" };
    }

    let transferMode;
    let instrument;
    if (beneficiary.type === "bank" && beneficiary.accountNumber && beneficiary.ifsc) {
      transferMode = process.env.CASHFREE_PAYOUT_MODE || "imps";
      if (!["imps", "neft", "rtgs", "banktransfer"].includes(transferMode)) {
        return { status: "FAILED", permanent: true, failureReason: "unsupported_transfer_mode" };
      }
      instrument = {
        bank_account_number: beneficiary.accountNumber,
        bank_ifsc: beneficiary.ifsc,
      };
    } else if (beneficiary.type === "upi" && beneficiary.maskedAccount) {
      transferMode = "upi";
      instrument = { vpa: beneficiary.maskedAccount };
    } else {
      return { status: "FAILED", permanent: true, failureReason: "invalid_beneficiary_details" };
    }

    const requestId = crypto.randomUUID();
    const payload = {
      transfer_id: reference,
      transfer_amount: Number((amountMinor / 100).toFixed(2)),
      transfer_currency: "INR",
      transfer_mode: transferMode,
      beneficiary_details: {
        beneficiary_name: beneficiary.registeredName,
        beneficiary_instrument_details: instrument,
      },
      transfer_remarks: "XORPAY vendor payment",
    };

    try {
      const response = await this.fetch(`${this.baseUrl}/transfers`, {
        method: "POST",
        headers: this._headers(requestId),
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(15_000),
      });
      const data = await this._json(response);
      // Any non-2xx is treated as uncertain unless Cashfree supplies a
      // documented final transfer status. The worker reconciles by transfer_id.
      return mapResponse(data, response.ok);
    } catch {
      // A timeout can occur after Cashfree accepted the payout. Do not resubmit
      // or refund here; query the original transfer_id during reconciliation.
      return { status: "PENDING", failureReason: "provider_response_unconfirmed" };
    }
  }

  async getPayoutStatus(reference) {
    if (!/^[A-Za-z0-9_]{1,40}$/.test(String(reference))) {
      return { status: "FAILED", permanent: true, failureReason: "invalid_transfer_reference" };
    }
    try {
      const url = new URL(`${this.baseUrl}/transfers`);
      url.searchParams.set("transfer_id", reference);
      const response = await this.fetch(url, {
        method: "GET",
        headers: this._headers(crypto.randomUUID()),
        signal: AbortSignal.timeout(15_000),
      });
      const data = await this._json(response);
      return mapResponse(data, response.ok);
    } catch {
      return { status: "PENDING", failureReason: "provider_status_unavailable" };
    }
  }
}

/** Dev uses a fake provider; production must explicitly configure Cashfree. */
export function makePayoutProvider(env = process.env) {
  const production = env.NODE_ENV === "production" || String(env.CASHFREE_ENV || "").toUpperCase() === "PRODUCTION";
  const selected = String(env.PAYOUT_PROVIDER || (production ? "cashfree" : "stub")).toLowerCase();
  if (selected === "stub") {
    if (production) throw new Error("Stub payouts are forbidden in production");
    return new StubPayoutProvider();
  }
  if (selected !== "cashfree") throw new Error("Unsupported PAYOUT_PROVIDER");
  if (!env.CASHFREE_PAYOUT_CLIENT_ID || !env.CASHFREE_PAYOUT_CLIENT_SECRET) {
    throw new Error("Cashfree Payouts credentials are required when PAYOUT_PROVIDER=cashfree");
  }
  return new CashfreePayoutProvider({
    clientId: env.CASHFREE_PAYOUT_CLIENT_ID,
    clientSecret: env.CASHFREE_PAYOUT_CLIENT_SECRET,
    baseUrl: env.CASHFREE_PAYOUT_BASE_URL || (String(env.CASHFREE_ENV).toUpperCase() === "PRODUCTION"
      ? "https://api.cashfree.com/payout"
      : "https://sandbox.cashfree.com/payout"),
  });
}

import crypto from "node:crypto";
import { StubPayoutProvider } from "./stubPayoutProvider.js";
