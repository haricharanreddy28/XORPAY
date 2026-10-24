# XORPAY

> Pay anything. Earn on everything.

A business payments platform for India — pay vendors, rent, GST, taxes, fees and
invoices by card/UPI/net banking, with the money settled to the beneficiary's
bank account or UPI ID. Original product and branding.

This is a **monorepo**.

```
apps/
  mobile/        Flutter app (Android first, iOS ready)
  admin/         Next.js admin & ops panel (dashboard, KYC, recon)
services/
  api/           Backend API                        (Cashfree sandbox test
                 server today; NestJS in Phase 4)
packages/
  xorpay_ui/     Design system (tokens, theme, components) — build on this
docs/            Backend API spec, deploy guide
```

## Partners (v1 defaults — switchable from admin)
| Capability | Provider |
|---|---|
| Pay-in (collection) | Cashfree |
| Payouts (settlement) | Cashfree Payouts |
| KYC (PAN/Aadhaar/selfie/GSTIN) | HyperVerge |
| Bill pay (BBPS) | Setu |
| Platform fee | 2% + 18% GST on the fee |

## Build order (master plan, phase by phase)
1. ✅ Foundation — design system, auth/OTP, onboarding, KYC stepper, CI
2. ✅ KYC + business profile + limits
3. ✅ Cards + beneficiaries
4. ✅ Payments core (fee engine, PA, webhooks, payouts, ledger, receipts)
5. ✅ More categories (GST, education, taxes, card bills, invoices/GST Hub)
6. ✅ Rewards, referrals, notifications
7. ✅ Admin panel + reconciliation + reports + RBAC/maker-checker
8. ✅ Support, disputes, statements, settings, delete-account
9. ✅ Hardening (session lock, security checklist) — see [docs/SECURITY.md](docs/SECURITY.md)

> "✅" means code-complete and CI-green. Production launch still needs the
> external rails live + RBI/PA onboarding, Postgres/Redis, and device/load
> testing — see the release checklist in [docs/SECURITY.md](docs/SECURITY.md).

## Each part's README
- Mobile app: [apps/mobile/README.md](apps/mobile/README.md)
- Design system: [packages/xorpay_ui/README.md](packages/xorpay_ui/README.md)
- API (test server): [services/api/README.md](services/api/README.md)
- Deploy: [docs/DEPLOY.md](docs/DEPLOY.md) · API spec: [docs/BACKEND.md](docs/BACKEND.md)

## Compliance note
Money is collected and settled only through an RBI-authorised payment
aggregator; XORPAY does not hold funds. KYC/AML, DPDP data-localisation, and
card-tokenisation rules apply — see the security section of the master spec.
