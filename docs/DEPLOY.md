# Deployment — step by step

Two things get deployed: the **backend** (an HTTPS server holding your Cashfree
secret key) and the **Flutter app** (a signed build users install).

> ⚠️ Gate first: the API remains a sandbox service. It now has signed access
> JWTs and rotating Redis refresh sessions, but business/payment records remain
> in process memory. The API refuses `CASHFREE_ENV=PRODUCTION` until PostgreSQL,
> durable payouts, production admin identity, and reconciliation are implemented.

---

## Part 0 — Harden the backend (before real money)
1. Replace stubbed OTP + base64 tokens with real auth (JWT or sessions, plus
   device/SIM binding).
2. Replace the in-memory `orders` Map with a database (Postgres). Add an
   idempotency key on order creation and on webhook handling.
3. Keep the secret key in the host's secret manager — never in the repo.
4. Rely on the **webhook** for "paid", not the client confirm call.

---

## Part A — AWS Mumbai pilot deployment

The target is AWS `ap-south-1`. The planned stack uses private application
subnets, encrypted PostgreSQL and Redis, Secrets Manager, CloudWatch, and HTTPS
ingress. Provisioning is deferred until the application data layer and pilot
release gates are implemented. Do not point live Cashfree credentials at the
current in-memory API.

## Part B — Build & release the Flutter app

### B1. Generate native folders (first time)
```bash
flutter create .      # from project root; keeps lib/ and pubspec.yaml
flutter pub get
```

### B2. Create a signing key (Android)
```bash
keytool -genkey -v -keystore upload-keystore.jks \
  -keyalg RSA -keysize 2048 -validity 10000 -alias upload
```
Store it **outside** the repo. Create `android/key.properties` (git-ignored):
```
storePassword=...
keyPassword=...
keyAlias=upload
storeFile=/absolute/path/to/upload-keystore.jks
```
Wire it into `android/app/build.gradle` (see Flutter's "Sign the app" docs) so
`release` builds use it.

### B3. Build the release bundle, injecting prod config
```bash
flutter build appbundle --release \
  --dart-define=API_BASE_URL=https://xorpay-backend.onrender.com \
  --dart-define=CASHFREE_ENV=SANDBOX \
  --obfuscate --split-debug-info=build/symbols
```
Output: `build/app/outputs/bundle/release/app-release.aab`.
(For a quick sideload test instead: `flutter build apk --release ...`.)

### B4. Distribute
- **Play Store:** play.google.com/console → create app → upload the `.aab` to
  the **Internal testing** track first → add testers → promote to production
  after it passes. Payments apps get extra Play review — declare permissions
  and provide a privacy policy.
- **iOS:** `flutter build ipa`, upload via Xcode/Transporter to App Store
  Connect → TestFlight → review.

---

## Part C — Go live with real money
1. Complete **Cashfree business KYC**; get it approved.
2. Swap backend env to **production** keys + `CASHFREE_ENV=PRODUCTION`; redeploy.
3. Rebuild the app with `--dart-define=CASHFREE_ENV=PRODUCTION` and the prod
   `API_BASE_URL`.
4. First real transaction: **₹1, then refund it.** Verify the webhook marked it
   paid and your records match.
5. Only then open it to users.

---

## Minimal pre-launch checklist
- [ ] Backend hardened (Part 0) — no in-memory store, no stubbed auth in prod
- [ ] Secrets only in the host's env, not the repo
- [ ] Webhook registered and verified as the source of truth for "paid"
- [ ] App signed with a safely stored keystore
- [ ] TLS pins added in `lib/core/config.dart` for your API domain
- [ ] Privacy policy + permission justifications ready for store review
- [ ] Cashfree KYC approved before production keys
