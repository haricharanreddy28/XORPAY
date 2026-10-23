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
| `POST /payments/orders` | creates a Cashfree order → `payment_session_id` |
| `POST /payments/confirm` | reads real status from Cashfree |
| `POST /webhooks/cashfree` | Cashfree's authoritative callback (set as notify URL) |
| `GET /health` | liveness |

## Before production (do not skip)
- Replace stubbed OTP + base64 tokens with real auth (JWT/session, device binding).
- Replace the in-memory `orders` Map with a database; add idempotency keys.
- Register the webhook URL in the Cashfree dashboard and rely on it for "paid".
- Move secret key to a secrets manager; never commit it.
- Switch keys + `CASHFREE_ENV=PRODUCTION` only after business KYC is approved;
  first live test with ₹1, then refund.
