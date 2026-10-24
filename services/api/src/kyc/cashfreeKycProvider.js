import { randomUUID } from "node:crypto";

const DEFAULT_SANDBOX = "https://sandbox.cashfree.com";
const DEFAULT_PRODUCTION = "https://api.cashfree.com";

function asTrue(value) {
  return value === true || value === "true" || value === "TRUE";
}

/**
 * Cashfree Secure ID adapter. All calls are server-to-server; client secrets
 * and raw KYC credentials never leave the API.
 */
export class CashfreeKycProvider {
  constructor({ clientId, clientSecret, baseUrl, apiVersion = "2024-12-01" }) {
    if (!clientId || !clientSecret) throw new Error("Cashfree Secure ID credentials are required");
    const parsed = new URL(baseUrl);
    if (parsed.protocol !== "https:" || !["api.cashfree.com", "sandbox.cashfree.com"].includes(parsed.hostname)) {
      throw new Error("Cashfree Secure ID base URL is not allowed");
    }
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.baseUrl = parsed.origin;
    this.apiVersion = apiVersion;
  }

  get name() { return "cashfree"; }

  async _request(path, { method = "POST", body, query, apiVersion = false } = {}) {
    const url = new URL(path, this.baseUrl);
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
      }
    }
    const headers = {
      "x-client-id": this.clientId,
      "x-client-secret": this.clientSecret,
      Accept: "application/json",
    };
    if (apiVersion) headers["x-api-version"] = this.apiVersion;
    if (body && !(body instanceof FormData)) headers["Content-Type"] = "application/json";
    const response = await fetch(url, {
      method,
      headers,
      body: body ? (body instanceof FormData ? body : JSON.stringify(body)) : undefined,
      signal: AbortSignal.timeout(15_000),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(`Cashfree Secure ID request failed (${response.status})`);
      error.code = "CASHFREE_SECURE_ID_HTTP_ERROR";
      throw error;
    }
    return data;
  }

  async verifyPan(pan, name) {
    const data = await this._request("/verification/pan", {
      body: { pan, ...(name ? { name } : {}) },
    });
    return {
      verified: asTrue(data.valid),
      registeredName: data.registered_name || data.name_pan_card || undefined,
      ...(typeof data.name_match_result === "string" ? { nameMatch: data.name_match_result === "DIRECT_MATCH" } : {}),
    };
  }

  async verifyGstin(gstin) {
    const data = await this._request("/verification/gstin", {
      body: { GSTIN: gstin },
    });
    return {
      verified: asTrue(data.valid),
      legalName: data.legal_name_of_business || undefined,
      status: data.gst_in_status || undefined,
    };
  }

  async initAadhaar(redirectUrl) {
    const verificationId = `xorpay_${randomUUID().replaceAll("-", "")}`;
    const data = await this._request("/verification/digilocker", {
      body: {
        verification_id: verificationId,
        document_requested: ["AADHAAR"],
        redirect_url: redirectUrl,
        user_flow: "signup",
      },
    });
    if (typeof data.url !== "string" || !data.url.startsWith("https://")) {
      throw new Error("Cashfree did not return a DigiLocker URL");
    }
    return { url: data.url, requestId: verificationId };
  }

  async completeAadhaar(requestId) {
    const status = await this._request("/verification/digilocker", {
      method: "GET",
      query: { verification_id: requestId },
    });
    if (status.status !== "AUTHENTICATED" ||
        !Array.isArray(status.document_consent) ||
        !status.document_consent.includes("AADHAAR")) {
      return { verified: false };
    }
    const document = await this._request("/verification/digilocker/document/AADHAAR", {
      method: "GET",
      query: { verification_id: requestId },
    });
    const verified = document.status === "SUCCESS" && typeof document.uid === "string";
    return {
      verified,
      ...(verified ? { maskedUid: document.uid } : {}),
    };
  }

  async createSelfieSession() {
    return { sessionId: `xorpay_${randomUUID().replaceAll("-", "")}` };
  }

  async completeSelfie(sessionId, image, mimeType) {
    if (!this.apiVersion) throw new Error("Cashfree Secure ID API version is required");
    const form = new FormData();
    form.set("verification_id", sessionId);
    form.set("image", new Blob([image], { type: mimeType }), mimeType === "image/png" ? "selfie.png" : "selfie.jpg");
    const data = await this._request("/verification/face-liveness", {
      body: form,
      apiVersion: true,
    });
    return {
      verified: data.status === "SUCCESS" && asTrue(data.liveness),
      ...(Number.isFinite(Number(data.liveness_score))
        ? { matchScore: Number(data.liveness_score) * 100 }
        : {}),
    };
  }
}

export function makeCashfreeKycProvider(env = process.env) {
  const production = String(env.CASHFREE_SECURE_ID_ENV || "").toUpperCase() === "PRODUCTION";
  return new CashfreeKycProvider({
    clientId: env.CASHFREE_SECURE_ID_CLIENT_ID,
    clientSecret: env.CASHFREE_SECURE_ID_CLIENT_SECRET,
    baseUrl: env.CASHFREE_SECURE_ID_BASE_URL ||
      (production ? DEFAULT_PRODUCTION : DEFAULT_SANDBOX),
    apiVersion: env.CASHFREE_SECURE_ID_API_VERSION || "2024-12-01",
  });
}
