// In-memory stores (reset on restart). Replace with Postgres/Prisma in the
// NestJS migration (Phase 4). Kept in one place so routes share state.

import crypto from "node:crypto";

/** order_id -> { amountMinor, phone, status } */
export const orders = new Map();

/** phone -> [ card ref ]  (token references only — never PAN/CVV) */
const cards = new Map();

/** phone -> [ beneficiary ] */
const beneficiaries = new Map();

/** txn_id -> transaction record */
const transactions = new Map();

/** phone -> [ invoice ] */
const invoices = new Map();

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
 * Spend so far for a user. Still 0 here; a proper rollup from PAID/SUCCESS
 * transactions lands with the Postgres migration (Phase 4+).
 */
export function getSpend(_phone) {
  return { spentTodayMinor: 0, spentMonthMinor: 0 };
}

// --- transactions --------------------------------------------------------
export function createTransaction(txn) {
  transactions.set(txn.id, txn);
  return txn;
}
export function getTransaction(id) {
  return transactions.get(id) ?? null;
}
export function listTransactions(phone) {
  return [...transactions.values()]
    .filter((t) => t.phone === phone)
    .sort((a, b) => b.createdAt - a.createdAt);
}

// --- invoices (GST Hub) --------------------------------------------------
export function listInvoices(phone, status) {
  const all = invoices.get(phone) ?? [];
  return status ? all.filter((i) => i.status === status) : all;
}
export function addInvoices(phone, list) {
  const existing = invoices.get(phone) ?? [];
  // De-dupe by supplier GSTIN + invoice number.
  const seen = new Set(existing.map((i) => `${i.supplierGstin}|${i.invoiceNo}`));
  const added = [];
  for (const inv of list) {
    const key = `${inv.supplierGstin}|${inv.invoiceNo}`;
    if (seen.has(key)) continue;
    seen.add(key);
    added.push({ id: newId("inv"), status: "unpaid", paidTxnId: null, ...inv });
  }
  invoices.set(phone, [...existing, ...added]);
  return added;
}
export function getInvoicesByIds(phone, ids) {
  const set = new Set(ids);
  return listInvoices(phone).filter((i) => set.has(i.id));
}
export function markInvoicesPaid(phone, ids, txnId = null) {
  const set = new Set(ids);
  const next = listInvoices(phone).map((i) =>
    set.has(i.id) ? { ...i, status: "paid", paidTxnId: txnId } : i,
  );
  invoices.set(phone, next);
}

// --- shared double-entry ledger -----------------------------------------
import { Ledger } from "./ledger/ledger.js";
export const ledger = new Ledger();
