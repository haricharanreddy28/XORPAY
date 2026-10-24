# Cashfree Secure ID KYC

XORPAY uses Cashfree for payment collection, payouts, and Secure ID verification.
Secure ID credentials are separate configuration from Cashfree PG/Payouts and
must be activated for the merchant account before use.

## Configure

Set these values in the API runtime (use Secrets Manager in AWS):

- `KYC_PROVIDER=cashfree`
- `CASHFREE_SECURE_ID_ENV=SANDBOX` or `PRODUCTION`
- `CASHFREE_SECURE_ID_CLIENT_ID` and `CASHFREE_SECURE_ID_CLIENT_SECRET`
- Optional `CASHFREE_SECURE_ID_API_VERSION` (Face Liveness default: `2024-12-01`)

Sandbox defaults to `https://sandbox.cashfree.com`; production defaults to
`https://api.cashfree.com`. Only those two HTTPS origins are accepted.
Production API startup rejects missing Secure ID credentials. Keep the provider
set to `stub` only for local development.

Cashfree requires Secure ID product activation and may require public IP
allowlisting. Verify the account's enabled products, API credentials, IP
allowlist, and billing in the Cashfree dashboard before pilot use.

## Verification flow

- `POST /kyc/pan`: Cashfree PAN verification.
- `POST /kyc/gstin`: Cashfree GSTIN verification.
- `POST /kyc/aadhaar/init`: starts a consent-based Cashfree DigiLocker session.
- `POST /kyc/aadhaar/complete`: checks Cashfree consent/status and retrieves the
  masked Aadhaar document result; incomplete consent can be checked again.
- `POST /kyc/selfie/session`: issues an owner-bound, one-use XORPAY session ID.
- `POST /kyc/selfie/complete`: submits the captured JPEG/PNG image to Cashfree
  Face Liveness. The mobile app limits the image to 1.35 MB before encoding.

PAN/GSTIN values are encrypted at rest by the KYC repository. Aadhaar numbers
are not accepted by the app or persisted by XORPAY; Cashfree returns the masked
UID for the status response. Selfie bytes are forwarded to Cashfree and are not
stored by XORPAY. The API stores only pass/fail flags and session hashes.

Cashfree's DigiLocker API uses time-limited links and user consent. The Flutter
app launches the returned link and checks status for at most one minute. A user
can retry if they leave DigiLocker before granting consent.

This adapter implements face liveness. Face matching the selfie against the
Aadhaar portrait is a separate verification and must be enabled/implemented
before treating the flow as a complete regulated Digital KYC journey. Account
approval and Cashfree's acceptance of XORPAY's use case remain launch gates.
