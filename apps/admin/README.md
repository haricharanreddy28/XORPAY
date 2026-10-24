# XORPAY Admin & Ops Panel

Next.js 14 (App Router) + TypeScript + Tailwind. Talks to the XORPAY API
(`services/api`) with a shared admin token.

> The master spec names **shadcn/ui**. This scaffold uses plain Tailwind
> components so it builds standalone in CI without the shadcn generator; shadcn
> can be layered on later. Tokens mirror `xorpay_ui` (spec §7.10).

## Run
```bash
cd apps/admin
npm install
# point at your API, then start:
NEXT_PUBLIC_API_BASE_URL=http://localhost:8080 npm run dev
```
Sign in with the admin token (dev default: `admin-dev`; set `ADMIN_TOKEN` on the
API for anything real).

## Pages (spec §4)
| Route | Shows |
|---|---|
| `/dashboard` | KPIs: GMV, fee revenue, GST collected, success rate, active users |
| `/kyc` | KYC review queue with approve / reject |
| `/transactions` | all transactions (reference, user, category, amount, state) |
| `/reconciliation` | double-entry ledger balances per account |

## Auth & RBAC
Dev auth is a single shared admin token (header `x-admin-token`) with one role
(`super`). Production needs real admin accounts, RBAC (Ops / Finance / Support /
Compliance) and **maker-checker** for refunds and limit changes — the API
surfaces `role` so the panel can gate actions.

## Still to come (Phase 7)
Fee/pricing engine UI, rewards campaigns, risk/blacklist, CMS (banners, feature
flags, force-update), PA/provider switch, support/disputes, and reports
(settlement, GST-on-fees, TDS) for the CA.
