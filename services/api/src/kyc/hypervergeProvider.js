// HyperVerge KYC adapter.
//
// This is a structured SKELETON: the method shapes and auth wiring are here,
// but the exact endpoint paths and response fields MUST be confirmed against
// your HyperVerge dashboard/API docs for the products you enable (PAN, GSTIN,
// DigiLocker/OKYC, Face/Liveness). They differ by account and region, so they
// are intentionally not hard-guessed here. Fill in the marked spots, then set
// KYC_PROVIDER=hyperverge with HYPERVERGE_APP_ID / HYPERVERGE_APP_KEY.
//
// Keep ALL calls server-side: the app never holds these credentials.

export class HyperVergeKycProvider {
  constructor({ appId, appKey, baseUrl }) {
    this.appId = appId;
    this.appKey = appKey;
    this.baseUrl = baseUrl;
  }

  get name() {
    return "hyperverge";
  }

  get _headers() {
    return {
      appId: this.appId,
      appKey: this.appKey,
      "Content-Type": "application/json",
    };
  }

  async _post(path, body) {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: this._headers,
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(`hyperverge ${path} -> ${res.status}`);
      err.detail = data;
      throw err;
    }
    return data;
  }

  // --- TODO (per your HyperVerge docs): set the real path + map the response.
  async verifyPan(pan, name) {
    const data = await this._post("/api/verifyPAN", { pan, name });
    return {
      verified: data?.result?.status === "success",
      registeredName: data?.result?.name ?? null,
      nameMatch: data?.result?.nameMatchScore ?? null,
    };
  }

  async verifyGstin(gstin) {
    const data = await this._post("/api/verifyGSTIN", { gstin });
    return {
      verified: data?.result?.status === "success",
      legalName: data?.result?.legalName ?? null,
      address: data?.result?.address ?? null,
      status: data?.result?.gstinStatus ?? null,
    };
  }

  async initAadhaar(redirectUrl) {
    const data = await this._post("/api/digilocker/initiate", { redirectUrl });
    return { url: data?.result?.url, requestId: data?.result?.requestId };
  }

  async completeAadhaar(requestId) {
    const data = await this._post("/api/digilocker/status", { requestId });
    return {
      verified: data?.result?.status === "success",
      maskedUid: data?.result?.maskedUid ?? null,
    };
  }

  async createSelfieSession() {
    // Typically you mint a short-lived token for the mobile Face/Liveness SDK.
    const data = await this._post("/api/face/session", {});
    return { sessionId: data?.result?.sessionId, sdkToken: data?.result?.token };
  }

  async completeSelfie(sessionId) {
    const data = await this._post("/api/face/result", { sessionId });
    return {
      verified: data?.result?.live === "yes",
      matchScore: data?.result?.matchScore ?? null,
    };
  }
}
