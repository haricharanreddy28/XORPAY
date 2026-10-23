// Deterministic dev/sandbox KYC provider. No network calls — lets you run the
// full KYC flow locally and in CI. Results are fake but shaped like the real
// provider's. NEVER use in production (make sure KYC_PROVIDER=hyperverge there).

const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]{3}$/;

export class StubKycProvider {
  name = "stub";

  async verifyPan(pan) {
    const verified = PAN_RE.test((pan || "").toUpperCase());
    return {
      verified,
      registeredName: verified ? "TEST USER" : null,
      nameMatch: verified ? 1 : 0,
    };
  }

  async verifyGstin(gstin) {
    const verified = GSTIN_RE.test((gstin || "").toUpperCase());
    return {
      verified,
      legalName: verified ? "TEST ENTERPRISES PRIVATE LIMITED" : null,
      address: verified ? "Test Address, Bengaluru, KA" : null,
      status: verified ? "Active" : null,
    };
  }

  async initAadhaar(redirectUrl) {
    const requestId = "stub_aadhaar_" + Date.now();
    // In real DigiLocker flow this URL opens the consent page.
    return { url: `${redirectUrl}?stub=1&requestId=${requestId}`, requestId };
  }

  async completeAadhaar(requestId) {
    return { verified: !!requestId, maskedUid: "XXXX XXXX 1234" };
  }

  async createSelfieSession() {
    return {
      sessionId: "stub_selfie_" + Date.now(),
      sdkToken: "stub-token",
    };
  }

  async completeSelfie(sessionId) {
    return { verified: !!sessionId, matchScore: 0.99 };
  }
}
