# XORPAY Admin & Ops Panel

**Planned — Phase 7.** Next.js 14 + TypeScript + Tailwind + shadcn/ui, with
role-based access (Super admin, Ops, Finance, Support, Compliance) and
maker-checker for refunds and limit changes.

Scope (master spec §4): KPI dashboard (GMV, success rate, fee revenue), KYC
review queue, transactions + reconciliation, fee/pricing engine, rewards
engine, risk/blacklist, CMS (banners, FAQs, force-update, feature flags),
payment-gateway switch with failover, support/disputes, and reports
(settlement, GST-on-fees, TDS) for the CA.

Tokens will be shared with the app via the Tailwind theme exported from
`packages/xorpay_ui` (spec §7.10).

This folder is a placeholder so the monorepo structure is in place; scaffolding
lands in Phase 7.
