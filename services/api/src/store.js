// In-memory stores (reset on restart). Replace with Postgres/Prisma in the
// NestJS migration (Phase 4). Kept in one place so routes share state.

import crypto from "node:crypto";

/** order_id -> { amountMinor, phone, status } */
export const orders = new Map();

/** phone -> [ card ref ]  (token references only — never PAN/CVV) */
const cards = new Map();

/** phone -> [ beneficiary ] */
const beneficiaries = new Map();

const newId = (prefix) =>
  `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;

// --- cards ---------------------------------------------------------------
export function listCards(phone) {
  return cards.get(phone) ?? [];
}
export function addCard(phone, ref) {
  const list = listCards(phone);
  const card = { id: newId("card"), ...ref };
  cards.set(phone, [...list, card]);
  return card;
}
export function removeCard(phone, id) {
  cards.set(phone, listCards(phone).filter((c) => c.id !== id));
}

// --- beneficiaries -------------------------------------------------------
export function listBeneficiaries(phone) {
  return beneficiaries.get(phone) ?? [];
}
export function getBeneficiary(phone, id) {
  return listBeneficiaries(phone).find((b) => b.id === id) ?? null;
}
export function addBeneficiary(phone, bene) {
  const list = listBeneficiaries(phone);
  const record = { id: newId("bene"), ...bene };
  beneficiaries.set(phone, [...list, record]);
  return record;
}
export function updateBeneficiary(phone, id, patch) {
  const list = listBeneficiaries(phone);
  const next = list.map((b) => (b.id === id ? { ...b, ...patch } : b));
  beneficiaries.set(phone, next);
  return next.find((b) => b.id === id) ?? null;
}
export function removeBeneficiary(phone, id) {
  beneficiaries.set(phone, listBeneficiaries(phone).filter((b) => b.id !== id));
}

/** phone -> kyc record */
const kyc = new Map();

const emptyKyc = () => ({
  panVerified: false,
  aadhaarVerified: false,
  selfieVerified: false,
  gstVerified: false,
  pan: null,
  gstin: null,
  legalName: null,
});

export function getKyc(phone) {
  return kyc.get(phone) ?? emptyKyc();
}

export function updateKyc(phone, patch) {
  const next = { ...getKyc(phone), ...patch };
  kyc.set(phone, next);
  return next;
}

/**
 * Spend so far for a user. Stubbed at 0 until the ledger lands (Phase 4);
 * the limits engine already accepts these, so wiring real numbers later is
 * a one-line change here.
 */
export function getSpend(_phone) {
  return { spentTodayMinor: 0, spentMonthMinor: 0 };
}
