# XORPAY — security hardening & release checklist

Covers the master spec §6 (security & compliance) and the Phase 9 hardening
work. Items marked **[code]** are implemented in this repo; **[ops]** are
environment/process steps; **[wire]** are integration points left stubbed.

## App hardening (spec §6)
- **[code]** Biometric app-lock on the authenticated shell (`BiometricLock`).
- **[code]** Session timeout — re-locks after inactivity (`core/inactivity.dart`).
- **[code]** TLS public-key pinning scaffold (`core/api_client.dart`) — add your
  SPKI pins + a backup pin in `core/config.dart`.
- **[code]** Secure token storage (keystore/keychain); `clear()` wipes auth on logout.
- **[code]** Card PAN/CVV never leave the device except to the PSP tokeniser.
- **[wire]** Root/jailbreak, emulator, debugger & tamper detection — initialise
  **freerasp** in `main.dart` (the TODO is marked there). Confirm the package's
  current API, set your signing-cert hashes, and react to threat callbacks.
- **[wire]** Screenshot block on sensitive screens (e.g. `no_screenshot` /
  `FLAG_SECURE`), Play Integrity API, code obfuscation
  (`flutter build apk --obfuscate --split-debug-info=…`).

## Backend hardening (spec §6)
- **[code]** Live Cashfree mode currently fails closed at startup because business data, payouts, admin identity, and reconciliation are not production-ready.
- **[code]** Limits enforced server-side before order creation.
- **[code]** Double-entry ledger; payout settlement is idempotent.
- **[code]** Maker-checker for refunds (different approver required).
- **[code]** Signed 15-minute access JWTs; Redis-backed rotating refresh tokens
  with logout revocation. **[ops]** Add device binding and individual admin
  accounts with MFA, RBAC, and durable audit records.
- **[ops]** Move all secrets to a secrets manager; never in the repo.
- **[ops]** Move OTP/payment/beneficiary rate limits from process memory to Redis; add velocity /
  fraud rules (round-tripping, self-payments, shared beneficiaries).
- **[ops]** Field-level encryption for PAN/Aadhaar refs and beneficiary account
  numbers; store Aadhaar only as a masked reference.
- **[code]** Verify Cashfree webhook signatures; **[ops]** add replay/idempotency records in PostgreSQL and verify every provider callback.

## Compliance (spec §6)
- **[ops]** Collect/settle only via an RBI-authorised PA; do not hold funds.
- **[ops]** Card tokenisation (CoF) rules; honour B2B card-payment category rules
  (keep every category toggleable from admin).
- **[ops]** KYC/AML per PMLA; landlord PAN above the rent threshold.
- **[ops]** DPDP Act 2023: consent records, purpose limitation, data deletion
  (the 30-day account-deletion cooling period is implemented), data stored in India.
- **[ops]** Full audit log for admin actions.

## Testing (spec §8/§9)
- **[code]** 49 backend unit tests (limits, fee, ledger, state machine, payout,
  TDS, coins, metrics, reports) + Flutter widget/parser tests; all green in CI.
- **[ops]** Add integration + e2e tests, and a load test on the money flows,
  before launch. Target ≥70% coverage on backend money paths (spec §10).

## Release checklist (spec §8/§9)
1. [ops] All external rails live with production creds (Cashfree PG + Payouts,
   HyperVerge, BBPS/GSP, FCM) and the PA onboarding/KYC approved.
2. [ops] Postgres + Redis (BullMQ) replace in-memory stores; migrations run.
3. [ops] NestJS API migration (or harden the Express app) + secrets manager.
4. [code/ops] App signed, obfuscated; permissions justified for Play review;
   privacy policy published.
5. [ops] TLS pins set; freerasp + screenshot block enabled.
6. [ops] Monitoring: Sentry (app + API), structured logs, alerts on webhook /
   reconciliation mismatches.
7. [ops] First production payment: ₹1, verify payout + UTR + reconciliation,
   then refund.
8. [ops] Internal testing track → staged rollout.
