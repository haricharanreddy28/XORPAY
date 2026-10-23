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

/**
 * Pick a provider from env. Defaults to the stub unless HyperVerge creds are
 * present AND KYC_PROVIDER=hyperverge.
 */
export function makeKycProvider(env = process.env) {
  const useHv =
    (env.KYC_PROVIDER || "").toLowerCase() === "hyperverge" &&
    env.HYPERVERGE_APP_ID &&
    env.HYPERVERGE_APP_KEY;

  if (useHv) {
    return new HyperVergeKycProvider({
      appId: env.HYPERVERGE_APP_ID,
      appKey: env.HYPERVERGE_APP_KEY,
      baseUrl: env.HYPERVERGE_BASE_URL || "https://ind.idv.hyperverge.co",
    });
  }
  return new StubKycProvider();
}
