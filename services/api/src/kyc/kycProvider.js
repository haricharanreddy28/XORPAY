import { StubKycProvider } from "./stubProvider.js";
import { makeCashfreeKycProvider } from "./cashfreeKycProvider.js";

/** Production always requires the real Cashfree Secure ID adapter. */
export function makeKycProvider(env = process.env) {
  const providerName = (env.KYC_PROVIDER || "").toLowerCase();
  const production = env.NODE_ENV === "production";
  if (providerName === "cashfree") return makeCashfreeKycProvider(env);
  if (production) throw new Error("Set KYC_PROVIDER=cashfree and configure Cashfree Secure ID credentials");
  if (providerName && providerName !== "stub") {
    throw new Error("Unsupported KYC_PROVIDER; use cashfree or stub");
  }
  return new StubKycProvider();
}
