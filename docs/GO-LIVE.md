# XORPAY — go-live guide (cloud backend + Play Store)

Two deployments: the **backend** (a cloud server) and the **app** (Play Store).

> ⚠️ **Read "Blockers" first.** Two things must be fixed before you take real
> money or submit to Play, no matter how the steps below go.

---

## 0. Blockers (do not skip)

1. **Persistence.** The backend currently keeps everything **in memory** —
   users, KYC, transactions, the ledger. Every restart/redeploy **wipes all of
   it**. That is fine for a demo, **unacceptable for real money**. Before
   production you must move to **Postgres** (data) + **Redis** (OTP/queue).
   Until then, deploy only to *test* with sandbox keys.
2. **Authorisation.** Collecting + disbursing real money in India runs on an
   **RBI-authorised aggregator (Cashfree)**, and **Google Play's financial-
   services policy** requires you to declare it and may ask for proof that your
   business is registered/authorised. You cannot publish a money-movement app
   without your Cashfree **production account approved** and the Play
   declarations completed.

---

## A. Deploy the backend to a cloud server

### Option 1 — Render (easiest, auto-deploys from GitHub)
1. Go to **render.com** → New → **Web Service** → connect the GitHub repo.
2. Settings:
   - **Root directory:** `services/api`
   - **Build command:** `npm install`
   - **Start command:** `node server.js`
   - Instance type: Starter is fine to begin.
3. **Environment variables** (Render dashboard → Environment) — your real keys,
   set here and nowhere else:
   ```
   OTP_PROVIDER=twilio
   TWILIO_ACCOUNT_SID=...
   TWILIO_AUTH_TOKEN=...
   TWILIO_VERIFY_SERVICE_SID=...
   CASHFREE_ENV=PRODUCTION
   CASHFREE_APP_ID=...            CASHFREE_SECRET_KEY=...
   CASHFREE_VERIFY_CLIENT_ID=...  CASHFREE_VERIFY_CLIENT_SECRET=...
   CASHFREE_PAYOUT_CLIENT_ID=...  CASHFREE_PAYOUT_CLIENT_SECRET=...
   ```
   (Start with `CASHFREE_ENV=SANDBOX` and sandbox keys to test first.)
4. Deploy. You get a URL like `https://xorpay-api.onrender.com`. Check
   `GET /health`.
5. In the **Cashfree dashboard**, set the **webhook URL** to
   `https://<your-url>/webhooks/cashfree`.
6. Auto-deploy: every push to `main` redeploys. (Add a persistent DB add-on
   before real use — see Blockers.)

### Option 2 — Your own VPS (DigitalOcean / AWS EC2 / GCP VM)
1. Create an Ubuntu VM; SSH in.
2. Install Node 20 (`nvm` or NodeSource), `git`, and a reverse proxy (`nginx`).
3. `git clone` the repo; `cd services/api && npm install`.
4. Put the env vars in a process manager (**pm2**) ecosystem file or systemd
   unit — not in the repo. `pm2 start server.js --name xorpay-api`.
5. Point nginx at `localhost:8080` and add **HTTPS with Let's Encrypt**
   (`certbot`). A public HTTPS URL is required (the app won't talk to plain
   HTTP, and Cashfree webhooks need HTTPS).
6. `pm2 startup` + `pm2 save` so it restarts on reboot.

Either way, the result is a **public HTTPS URL** for your API.

---

## B. Build & publish the app to the Play Store

You need **Flutter + Android SDK** on a computer for a signed release build
(or set up CI signing — ask and I can add it).

### B1. One-time setup
1. Install Flutter: https://docs.flutter.dev/get-started/install (+ Android
   Studio for the SDK).
2. From the repo: `cd apps/mobile && flutter create .` (generates `android/`).
3. In `android/app/build.gradle` (or `.kts`): set `compileSdk 36`,
   `minSdk 23`, `targetSdk 34`.
4. In `android/app/src/main/AndroidManifest.xml`, add the permissions the app
   uses: `INTERNET`, `CAMERA`, `NFC`, `USE_BIOMETRIC` (and `RECEIVE_SMS` only if
   you add SMS OTP autofill).

### B2. Create a signing key (keep it safe forever — you can't update the app without it)
```bash
keytool -genkey -v -keystore upload-keystore.jks \
  -keyalg RSA -keysize 2048 -validity 10000 -alias upload
```
Create `android/key.properties` (git-ignored):
```
storePassword=...
keyPassword=...
keyAlias=upload
storeFile=/absolute/path/to/upload-keystore.jks
```
Wire it into `android/app/build.gradle`'s release signing config (see Flutter's
"Sign the app" docs).

### B3. Build the release bundle (points at YOUR server)
```bash
flutter build appbundle --release \
  --dart-define=API_BASE_URL=https://xorpay-api.onrender.com \
  --dart-define=CASHFREE_ENV=PRODUCTION \
  --obfuscate --split-debug-info=build/symbols
```
Output: `build/app/outputs/bundle/release/app-release.aab`.

### B4. Play Console
1. Create a **Google Play Console** account ($25 one-time) at
   play.google.com/console.
2. **Create app** → fill the store listing (name, description, screenshots,
   icon, feature graphic).
3. Complete the required declarations:
   - **Privacy policy URL** (mandatory).
   - **Data safety** form (what data you collect: phone, KYC, payments).
   - **Content rating** questionnaire.
   - **Financial features** declaration — payments apps must declare this and
     may need to show you're an authorised/registered provider (or partnered
     with one). This is where an unapproved payments app gets rejected.
4. **Release → Testing → Internal testing** → upload the `.aab` → add your
   testers (their Google emails) → roll out. Install from the opt-in link on
   your phone.
5. After it passes internal testing and review, promote to **Production**.

---

## C. First real transaction
1. Backend on `CASHFREE_ENV=PRODUCTION` with production keys (and a database).
2. App built with the production `API_BASE_URL` + `CASHFREE_ENV=PRODUCTION`.
3. Do **one ₹1 payment** end-to-end: pay a known payee → confirm the payout
   credits with a UTR → check `/admin/reconciliation` balances → **refund it**.
4. Only then open it to users.

See `docs/SECURITY.md` for the full hardening + release checklist.
