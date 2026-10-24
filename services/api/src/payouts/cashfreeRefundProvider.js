import crypto from "node:crypto";

const PENDING = new Set(["PENDING", "PENDING_APPROVAL", "ONHOLD"]);
const SUCCESS = new Set(["SUCCESS"]);
const FAILED = new Set(["CANCELLED", "REJECTED"]);

function mapRefund(data, ok) {
  const raw = String(data?.refund_status ?? data?.status ?? "").toUpperCase();
  if (SUCCESS.has(raw)) return { status: "SUCCESS", refundArn: data?.refund_arn ?? null };
  if (FAILED.has(raw)) return { status: "FAILED", permanent: true, failureCode: raw.toLowerCase() };
  if (!ok && !raw) return { status: "PENDING", failureCode: "provider_response_unconfirmed" };
  return { status: PENDING.has(raw) || !raw ? "PENDING" : "PENDING", refundArn: data?.refund_arn ?? null };
}

function stableUuid(seed) {
  const bytes = crypto.createHash("sha256").update(seed).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}

export class CashfreeRefundProvider {
  constructor({ clientId, clientSecret, baseUrl, fetchImpl = fetch, apiVersion = "2023-08-01" }) {
    if (!clientId || !clientSecret) throw new Error("Cashfree PG credentials are required for refunds");
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.baseUrl = String(baseUrl).replace(/\/+$/, "");
    this.fetch = fetchImpl;
    this.apiVersion = apiVersion;
  }

  _headers(requestId, idempotencyKey) {
    return {
      "Content-Type": "application/json",
      "x-client-id": this.clientId,
      "x-client-secret": this.clientSecret,
      "x-api-version": this.apiVersion,
      "x-request-id": requestId,
      "x-idempotency-key": idempotencyKey,
    };
  }

  async _json(response) { return response.json().catch(() => ({})); }

  async getRefund(orderId, refundId) {
    try {
      const response = await this.fetch(
        `${this.baseUrl}/orders/${encodeURIComponent(orderId)}/refunds/${encodeURIComponent(refundId)}`,
        { method: "GET", headers: this._headers(crypto.randomUUID(), stableUuid(`refund:${refundId}`)), signal: AbortSignal.timeout(15_000) },
      );
      if (response.status === 404) return { status: "NOT_FOUND" };
      return mapRefund(await this._json(response), response.ok);
    } catch {
      return { status: "PENDING", failureCode: "provider_status_unavailable" };
    }
  }

  async createRefund({ orderId, refundId, amountMinor }) {
    if (!Number.isSafeInteger(amountMinor) || amountMinor < 100 ||
        !/^[A-Za-z0-9]{3,40}$/.test(String(refundId))) {
      return { status: "FAILED", permanent: true, failureCode: "invalid_refund_request" };
    }
    try {
      const response = await this.fetch(
        `${this.baseUrl}/orders/${encodeURIComponent(orderId)}/refunds`,
        {
          method: "POST",
          headers: this._headers(crypto.randomUUID(), stableUuid(`refund:${refundId}`)),
          body: JSON.stringify({
            refund_amount: Number((amountMinor / 100).toFixed(2)),
            refund_id: refundId,
            refund_note: "XORPAY payout failed",
            refund_speed: "STANDARD",
          }),
          signal: AbortSignal.timeout(15_000),
        },
      );
      return mapRefund(await this._json(response), response.ok);
    } catch {
      return { status: "PENDING", failureCode: "provider_response_unconfirmed" };
    }
  }
}

export function makeRefundProvider(env = process.env, fetchImpl = fetch) {
  const production = env.NODE_ENV === "production" || String(env.CASHFREE_ENV || "").toUpperCase() === "PRODUCTION";
  if (!env.CASHFREE_APP_ID || !env.CASHFREE_SECRET_KEY) {
    if (production) throw new Error("Cashfree PG credentials are required for production refunds");
    return null;
  }
  const baseUrl = env.CASHFREE_PG_BASE_URL || (String(env.CASHFREE_ENV).toUpperCase() === "PRODUCTION"
    ? "https://api.cashfree.com/pg"
    : "https://sandbox.cashfree.com/pg");
  return new CashfreeRefundProvider({
    clientId: env.CASHFREE_APP_ID,
    clientSecret: env.CASHFREE_SECRET_KEY,
    baseUrl,
    fetchImpl,
    apiVersion: env.CASHFREE_PG_API_VERSION || "2023-08-01",
  });
}
