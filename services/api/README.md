# Xorpay test backend (Cashfree sandbox)

Minimal Node/Express server so you can run a **real Cashfree checkout with test
money** and phone verification through Twilio Verify. In-memory auth/payment state — **not
production**.

## 1. Get sandbox keys
1. merchant.cashfree.com → Developers → API Keys → **Sandbox** → copy App ID + Secret Key.
2. Twilio Console → Verify → Services → create a service; copy the Account SID, Auth Token and Verify Service SID. Trial accounts must verify each destination phone number first.

## 2. Run it
```bash
cd services/api
npm install
# Set these in your shell or a local .env loader; never commit real credentials.
CASHFREE_APP_ID=xxx CASHFREE_SECRET_KEY=yyy \
TWILIO_ACCOUNT_SID=AC... TWILIO_AUTH_TOKEN=... \
TWILIO_VERIFY_SERVICE_SID=VA... node server.js
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
- **Login:** enter your Indian mobile number. Twilio sends an SMS code; enter that code in the app. Local 10-digit numbers are converted to +91 E.164 format.
- Twilio Verify has a 30-second resend cooldown and a small per-phone/IP request cap.
- For offline UI testing only, set `OTP_PROVIDER=stub` and optionally `OTP_STUB_CODE=123456`; the fixed code is disabled when `NODE_ENV=production`.
- **Scan & Pay:** scan any `upi://pay?pa=test@upi&...` QR (generate one online for testing).
- **Checkout:** Cashfree Drop opens — pay with a **sandbox test instrument**
  (test UPI ID / test card from Cashfree's "Test Data" docs). No real money.
- The app calls `/payments/confirm`; status should come back `PAID`.

## Endpoints
| Route | Purpose |
|---|---|
| `POST /auth/otp/request` | send an SMS through Twilio Verify |
| `POST /auth/otp/verify` | verify the code through Twilio Verify; returns a test token |
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
| `POST /payments/orders` | limits check → fee → Cashfree order (charges youPay) |
| `POST /payments/confirm` | reads real status; settles ledger + state on PAID |
| `GET /transactions` · `GET /transactions/:id` | history + detail (with ledger) |
| `POST /invoices/import` | pull purchase invoices from GSTR-2A/2B |
| `GET /invoices` · `GET /invoices/suppliers` | list / unpaid totals by supplier |
| `POST /invoices/quote` · `POST /invoices/mark-paid` | TDS-aware payable; settle |
| `GET /rewards` | coins balance + history |
| `GET /referrals` · `POST /referrals/redeem` | referral code; redeem (rewards both) |
| `GET /notifications` · `POST /notifications/:id/read` | notification centre |
| `GET /admin/metrics` · `/admin/transactions` · `/admin/reconciliation` | ops KPIs / ledger (admin token) |
| `GET /admin/kyc` · `POST /admin/kyc/:phone/decision` | KYC review queue + approve/reject |
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

## Payments core (Phase 4)
- **Fee engine** (`src/payments/fee.js`): 2% + 18% GST on the fee, integer paise,
  mirrors the app's XFee. `/payments/orders` charges `youPay`.
- **Double-entry ledger** (`src/ledger/ledger.js`): every payment posts a
  balanced entry (collections = escrow + fee + GST); payout releases escrow.
  Balances net correctly; unbalanced posts throw.
- **State machine** (`src/payments/stateMachine.js`): CREATED → PAYMENT_PENDING
  → PAID → PAYOUT_QUEUED → PAYOUT_PROCESSING → SUCCESS | FAILED →
  REFUND_INITIATED → REFUNDED. Illegal transitions throw.
- Settlement is **idempotent**: `markPaid` posts the ledger + advances state
  once, driven by the confirm endpoint and (authoritatively) the webhook.
- **Payout queue** (`src/payouts/`): on PAID the transaction is enqueued; the
  PayoutProcessor runs PAYOUT_QUEUED → PAYOUT_PROCESSING → SUCCESS via a
  swappable payout provider (stub / Cashfree Payouts skeleton), retries
  transient failures, and on a permanent failure **auto-refunds to source**
  (REFUND_INITIATED → REFUNDED, reversing the ledger). In-process for dev;
  BullMQ/Redis with a dead-letter queue comes with the NestJS migration.
- Next slice: the app's vendor/rent flows + receipts.

## GST Hub / invoices (Phase 5)
- Swappable GSTR importer (`src/invoices/importProvider.js`): a **stub** returns
  sample purchase invoices; set `GSP_PROVIDER=gsp` + `GSP_BASE_URL`/`GSP_API_KEY`
  for a real GSP (endpoints marked TODO; real flow authenticates the GSTIN).
- **TDS math** (`src/invoices/tds.js`) is pure and unit-tested: per-invoice
  deduction for "pay with TDS" vs full payment.
- Flow: import → `/invoices/suppliers` (unpaid totals) → select invoices →
  `/invoices/quote` (gross/TDS/net) → pay via `/payments/orders` → `/invoices/mark-paid`.

## Rewards / referrals / notifications (Phase 6)
- **Coins rule engine** (`src/rewards/coins.js`), pure + unit-tested: base rate
  per ₹100, category multiplier (rent 2×), first-transaction bonus, RuPay bonus.
- A successful payment awards coins and posts a notification (inside the
  idempotent `markPaid`, so once per transaction).
- **Referrals**: each user gets a code; redeeming rewards both sides once
  (self-referral and double-redeem are blocked).
- **Notifications**: persisted in-app; `notifier.sendPush` is an FCM stub —
  wire the FCM Admin SDK + device tokens for real push.

## Test
```bash
npm test   # node --test — runs the limits engine suite
```

## Before production (do not skip)
- Replace the in-memory OTP rate limiter and base64 tokens with shared rate limiting and signed JWT/session auth with device binding.
- Replace the in-memory `orders` Map with a database; add idempotency keys.
- Register the webhook URL in the Cashfree dashboard and rely on it for "paid".
- Move secret key to a secrets manager; never commit it.
- Switch keys + `CASHFREE_ENV=PRODUCTION` only after business KYC is approved;
  first live test with ₹1, then refund.
