import { StubKycProvider } from "./stubProvider.js";
import {
  verifyPan as cfVerifyPan,
  verifyGstin as cfVerifyGstin,
} from "../verification/cashfreeVerification.js";

// KYC via the Cashfree Verification suite.
//
// PAN and GSTIN are verified for real against Cashfree. Aadhaar (DigiLocker /
// OKYC) and selfie liveness are a larger flow (consent URL + Face SDK) — they
// are delegated to the dev stub here and MUST be wired to Cashfree DigiLocker +
// Liveness (or a KUA) before relying on the FULL/GST tiers in production.
// PAN verification alone already unlocks the PAN limit tier, so payments work.
export class CashfreeKycProvider {
  constructor() {
    this._fallback = new StubKycProvider();
  }
  get name() {
    return "cashfree";
  }

  verifyPan(pan, name) {
    return cfVerifyPan(pan, name);
  }
  verifyGstin(gstin) {
    return cfVerifyGstin(gstin);
  }

  // TODO (production): wire Cashfree DigiLocker (Aadhaar) + Face Liveness.
  initAadhaar(redirectUrl) {
    return this._fallback.initAadhaar(redirectUrl);
  }
  completeAadhaar(requestId) {
    return this._fallback.completeAadhaar(requestId);
  }
  createSelfieSession() {
    return this._fallback.createSelfieSession();
  }
  completeSelfie(sessionId) {
    return this._fallback.completeSelfie(sessionId);
  }
}
