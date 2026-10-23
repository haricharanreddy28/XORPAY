# Deployment — step by step

Two things get deployed: the **backend** (an HTTPS server holding your Cashfree
secret key) and the **Flutter app** (a signed build users install).

> ⚠️ Gate first: the `backend/` server is a **test** server (in-memory store,
> stubbed OTP, base64 tokens). Do the hardening in **Part 0** before deploying
> it for real money. For a sandbox demo you can deploy it as-is.

---

## Part 0 — Harden the backend (before real money)
1. Replace stubbed OTP + base64 tokens with real auth (JWT or sessions, plus
   device/SIM binding).
2. Replace the in-memory `orders` Map with a database (Postgres). Add an
   idempotency key on order creation and on webhook handling.
3. Keep the secret key in the host's secret manager — never in the repo.
4. Rely on the **webhook** for "paid", not the client confirm call.

---

## Part A — Deploy the backend (example: Render)

Any Node host works (Render, Railway, Fly.io, a VPS). Render is the simplest.

1. **Push to GitHub**
   ```bash
   cd backend
   git init && git add . && git commit -m "xorpay backend"
   # create a repo on github.com, then:
   git remote add origin https://github.com/you/xorpay-backend.git
   git push -u origin main
   ```
   (Confirm `.env` and any keys are git-ignored. Never commit secrets.)

2. **Create the service on render.com**
   - New → **Web Service** → connect the repo.
   - Root directory: `backend` (if the repo is the whole project) or `.`
   - Build command: `npm install`
   - Start command: `node server.js`
   - Instance: free/starter is fine to start.

3. **Set environment variables** (Render dashboard → Environment):
   | Key | Value |
   |---|---|
   | `CASHFREE_APP_ID` | your sandbox (or production) App ID |
   | `CASHFREE_SECRET_KEY` | matching Secret Key |
   | `CASHFREE_ENV` | `SANDBOX` or `PRODUCTION` |

4. **Deploy.** You get a URL like `https://xorpay-backend.onrender.com`.
   Check `GET /health` returns `{"ok":true}`.

5. **Register the webhook in Cashfree**
   Dashboard → Developers → Webhooks → add
   `https://xorpay-backend.onrender.com/webhooks/cashfree`.

---

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
