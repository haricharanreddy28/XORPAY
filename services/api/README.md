# Xorpay test backend (Cashfree sandbox)

Minimal Node/Express server so you can run a **real Cashfree checkout with test
money** end-to-end with the Flutter app. In-memory, stubbed auth — **not
production**.

## 1. Get sandbox keys
merchant.cashfree.com → Developers → API Keys → **Sandbox** → copy App ID + Secret Key.

## 2. Run it
```bash
cd backend
npm install
CASHFREE_APP_ID=xxx CASHFREE_SECRET_KEY=yyy node server.js
# or: copy .env.example to your shell env / use a dotenv runner
```
Sanity check: `curl http://localhost:8080/health` → `{"ok":true,"env":"SANDBOX"}`

## 3. Expose it over HTTPS (the app needs a reachable URL)
```bash
ngrok http 8080
```
Copy the `https://....ngrok-free.app` URL.

## 4. Point the app at it and run
```bash
# from the project root (not backend/)
flutter run \
  --dart-define=API_BASE_URL=https://YOUR-NGROK-URL \
  --dart-define=CASHFREE_ENV=SANDBOX
```

## 5. Test the flow
- **Login:** enter any phone, then OTP **`123456`** (stubbed).
- **Scan & Pay:** scan any `upi://pay?pa=test@upi&...` QR (generate one online for testing).
- **Checkout:** Cashfree Drop opens — pay with a **sandbox test instrument**
  (test UPI ID / test card from Cashfree's "Test Data" docs). No real money.
- The app calls `/payments/confirm`; status should come back `PAID`.

## Endpoints
| Route | Purpose |
|---|---|
| `POST /auth/otp/request` | stub: logs the OTP (always `123456`) |
| `POST /auth/otp/verify` | stub: returns a test token |
| `POST /kyc/pan` | verify PAN (provider) |
| `POST /kyc/gstin` | verify GSTIN → higher tier |
| `POST /kyc/aadhaar/init` · `/aadhaar/complete` | DigiLocker/OKYC start + finish |
| `POST /kyc/selfie/session` · `/selfie/complete` | liveness session + result |
| `GET /kyc/status` | current KYC state + derived tier |
| `GET /limits` | caps for the user + remaining today/month |
| `POST /limits/check` | pre-check an amount before checkout |
| `GET /cards` · `POST /cards` · `DELETE /cards/:id` | saved card token refs (no PAN) |
| `GET /beneficiaries` · `POST /beneficiaries` | list / add + verify payee |
| `POST /beneficiaries/:id/verify` · `DELETE /beneficiaries/:id` | re-verify / remove |
| `POST /payments/orders` | enforces limits, then creates a Cashfree order |
| `POST /payments/confirm` | reads real status from Cashfree |
| `POST /webhooks/cashfree` | Cashfree's authoritative callback (set as notify URL) |
| `GET /health` | liveness (`payments` flag shows if Cashfree is configured) |

## KYC & limits (Phase 2)
- **Provider is swappable** (`src/kyc/`): a deterministic **stub** runs by default
  (and in CI); set `KYC_PROVIDER=hyperverge` + `HYPERVERGE_APP_ID`/`HYPERVERGE_APP_KEY`
  to use the HyperVerge adapter (endpoints marked TODO to confirm against your docs).
- **Limits engine** (`src/limits/limitsEngine.js`) is pure and unit-tested
  (`npm test`): KYC tier → per-transaction / daily / monthly caps, with a lower
  cap for unverified beneficiaries. It's enforced server-side in `/payments/orders`.
- Spend tracking is stubbed at 0 until the ledger lands (Phase 4).

## Cards & beneficiaries (Phase 3)
- **Cards** (`src/cards/`): the backend stores only the PSP **token reference**
  + display metadata (last4, network, issuer, expiry). `validateCardRef`
  **rejects any field containing a PAN** (12–19 digits) — the app must tokenise
  with the PSP SDK first. The token is never echoed back to the client.
- **Beneficiaries** (`src/beneficiaries/`): added with instant name
  verification via a swappable verifier — a **stub** by default, or set
  `PAYOUT_PROVIDER=cashfree` + Cashfree Payout creds for the penny-drop / UPI
  name-lookup adapter (endpoints marked TODO per dashboard docs). The full
  account number is never returned (only a masked handle) and is flagged for
  field-level encryption before production.
- IFSC/VPA/account validators and the PAN guard are pure and unit-tested.

## Test
```bash
npm test   # node --test — runs the limits engine suite
```

## Before production (do not skip)
- Replace stubbed OTP + base64 tokens with real auth (JWT/session, device binding).
- Replace the in-memory `orders` Map with a database; add idempotency keys.
- Register the webhook URL in the Cashfree dashboard and rely on it for "paid".
- Move secret key to a secrets manager; never commit it.
- Switch keys + `CASHFREE_ENV=PRODUCTION` only after business KYC is approved;
  first live test with ₹1, then refund.
