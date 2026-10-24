// KYC provider abstraction. The rest of the app depends on this shape, never
// on a specific vendor — so you can swap HyperVerge for IDfy/Signzy/Digio, or
// run the stub in dev, without touching routes.
//
// A provider implements:
//   verifyPan(pan, name?)      -> { verified, registeredName?, nameMatch? }
//   verifyGstin(gstin)         -> { verified, legalName?, address?, status? }
//   initAadhaar(redirectUrl)   -> { url, requestId }   // DigiLocker/OKYC start
//   completeAadhaar(requestId) -> { verified, maskedUid? }
//   createSelfieSession()      -> { sessionId, sdkToken }
//   completeSelfie(sessionId)  -> { verified, matchScore? }

import { StubKycProvider } from "./stubProvider.js";
import { HyperVergeKycProvider } from "./hypervergeProvider.js";
import { CashfreeKycProvider } from "./cashfreeKycProvider.js";
import { cashfreeVerificationConfigured } from "../verification/cashfreeVerification.js";

/**
 * Pick a provider from env:
 *  - Cashfree Verification when its creds are set (the default), or
 *    KYC_PROVIDER=cashfree.
 *  - HyperVerge when KYC_PROVIDER=hyperverge + creds.
 *  - Stub otherwise (dev/sandbox).
 */
export function makeKycProvider(env = process.env) {
  const choice = (env.KYC_PROVIDER || "").toLowerCase();

  if (choice === "hyperverge" && env.HYPERVERGE_APP_ID && env.HYPERVERGE_APP_KEY) {
    return new HyperVergeKycProvider({
      appId: env.HYPERVERGE_APP_ID,
      appKey: env.HYPERVERGE_APP_KEY,
      baseUrl: env.HYPERVERGE_BASE_URL || "https://ind.idv.hyperverge.co",
    });
  }

  if (choice === "cashfree" || cashfreeVerificationConfigured(env)) {
    return new CashfreeKycProvider();
  }

  return new StubKycProvider();
}
