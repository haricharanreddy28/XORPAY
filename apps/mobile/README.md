# Xorpay — Flutter payments-app starter

A clean, original scaffold for a business-payments app. It gives you the shape
of a production app (auth, biometric lock, QR scan-to-pay, a PSP-agnostic
payment flow, secure networking) without any real payment logic wired in — you
plug in **your own** backend and licensed payment provider.

> This is greenfield code written from scratch. It is a reference architecture,
> not a copy of any existing app.

## Native permissions (after `flutter create .`)
Add-card Scan/NFC need platform permissions the starter doesn't auto-generate:
- **Android** `AndroidManifest.xml`: `<uses-permission android:name="android.permission.CAMERA"/>`
  and `<uses-permission android:name="android.permission.NFC"/>`. NFC EMV read is
  Android-only and best-effort (see `lib/cards/nfc/`).
- **iOS** `Info.plist`: `NSCameraUsageDescription`. iOS restricts EMV contactless
  reads, so the NFC tab targets Android.

## Before you build: you can't move money by yourself

A payments app in India sits on top of RBI-regulated rails. Pick a path:

1. **Integrate a licensed PSP/aggregator** — Razorpay, Cashfree, PhonePe PG,
   Juspay, Setu. Recommended for v1. They hold the license, do settlement, and
   are PCI-DSS compliant. **This scaffold assumes this path.**
2. **Become a UPI TPAP** — needs an NPCI-approved sponsor bank + certification.
3. **PPI/wallet license** — direct RBI licensing.

For KYC you'll use a licensed provider (HyperVerge, IDfy, Signzy) or
DigiLocker + Aadhaar eKYC through a licensed KUA.

## The golden security rule

**Nothing secret ships in the app.** Every user can unzip the APK and read it.
So:

- PSP **secret** keys, signing, and order creation live on **your backend**.
- The app only holds a short-lived session token and a PSP **publishable** key.
- Payments are **verified server-side** before being treated as paid.

See `lib/payments/payment_service.dart` — the 5-step flow is documented there.

## Project layout

```
lib/
  main.dart                     app entry (+ optional Sentry)
  app.dart                      root widget, auth gate + biometric lock
  core/
    config.dart                 build-time config (--dart-define), cert pins
    api_client.dart             Dio client, auth interceptor, TLS pinning
    secure_storage.dart         keystore-backed token storage
  auth/
    session.dart                OTP request/verify, session state
    biometric_lock.dart         fingerprint/face gate for sensitive screens
  login/login_screen.dart       phone + OTP UI
  payments/
    payment_service.dart        PSP-agnostic order/pay/verify (stubbed)
    qr_scan_screen.dart         ML Kit QR scan + UPI URI parser
    payment_status_screen.dart  success/pending/failed (Lottie + fallback)
    home_screen.dart            balance + scan-and-pay
  common/app_theme.dart         Material 3 theme
```

## Run it

```bash
# 1. Install Flutter: https://docs.flutter.dev/get-started/install
flutter --version

# 2. Generate the native platform folders (android/ios) for this project.
#    Run from inside this folder; it keeps the existing lib/ and pubspec.yaml.
flutter create .

# 3. Fetch dependencies
flutter pub get

# 4. Run, injecting config (no secrets in source!)
flutter run \
  --dart-define=API_BASE_URL=https://api.yourbackend.com \
  --dart-define=CASHFREE_ENV=SANDBOX \
  --dart-define=SENTRY_DSN=
```

## PSP: Cashfree (wired in)

This scaffold uses the **Cashfree** Drop-in checkout
(`flutter_cashfree_pg_sdk`), implemented in `lib/payments/payment_service.dart`.

The trust boundary — **the app never holds your Cashfree secret key**:

1. App → **your backend**: `POST /payments/orders` (amount, currency).
2. Backend → Cashfree *Create Order* API using the **secret key**; returns
   `order_id` + `payment_session_id`.
3. App opens Cashfree Drop checkout with the `payment_session_id`.
4. On the SDK verify callback, app → **your backend**: `POST /payments/confirm`.
5. Backend → Cashfree *Get Order* API (secret key); it trusts **that** status,
   not the client, before marking the order paid. Back this with Cashfree
   **webhooks** for reconciliation.

Your backend endpoints to implement:

| Endpoint | Does |
|---|---|
| `POST /payments/orders` | Create a Cashfree order, return `order_id` + `payment_session_id` |
| `POST /payments/confirm` | Fetch real order status from Cashfree, return `{ "status": "PAID" }` |

> SDK note: class/method names here target `flutter_cashfree_pg_sdk` ^2.2.x.
> If `flutter pub get` resolves a different major version, re-check the builder
> and callback names against the package README and adjust `payment_service.dart`.

## Platform permissions to add (after `flutter create .`)

- **Android** (`android/app/src/main/AndroidManifest.xml`): `CAMERA` (QR),
  `USE_BIOMETRIC`, `INTERNET`. Add others (SMS/contacts) only if you truly need
  them and can justify them in Play review — request at runtime, minimally.
- **iOS** (`ios/Runner/Info.plist`): `NSCameraUsageDescription`,
  `NSFaceIDUsageDescription`.

## Hardening checklist (fintech)

- [x] TLS pinning scaffold (`core/api_client.dart` — add your pins in config)
- [x] Secure token storage
- [x] Biometric app-lock
- [ ] Initialize `freerasp` for root/hook/debug/tamper detection (see `main.dart`)
- [ ] Certificate **public-key (SPKI)** pinning with a backup pin for rotation
- [ ] Runtime permission requests (not all-upfront)
- [ ] Obfuscation: `flutter build apk --obfuscate --split-debug-info=...`
```
