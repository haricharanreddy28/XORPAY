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

/** phone -> { balance, history: [...] } */
const rewards = new Map();

/** phone -> { code, referredBy, referrals: [...] }  and  code -> phone */
const referrals = new Map();
const referralCodes = new Map();

/** phone -> [ notification ] */
const notifications = new Map();

/** phone -> [ support ticket ] */
const tickets = new Map();

export function listTickets(phone) {
  return (tickets.get(phone) ?? []).sort((a, b) => b.createdAt - a.createdAt);
}
export function getTicket(phone, id) {
  return (tickets.get(phone) ?? []).find((t) => t.id === id) ?? null;
}
export function createTicket(phone, ticket) {
  const record = {
    id: newId("tkt"),
    status: "open",
    createdAt: Date.now(),
    messages: [],
    ...ticket,
  };
  tickets.set(phone, [...(tickets.get(phone) ?? []), record]);
  return record;
}
export function addTicketMessage(phone, id, msg) {
  const list = tickets.get(phone) ?? [];
  tickets.set(
    phone,
    list.map((t) => (t.id === id ? { ...t, messages: [...t.messages, msg] } : t)),
  );
  return getTicket(phone, id);
}

/** phone -> account profile / settings */
const accounts = new Map();

export function getAccount(phone) {
  return (
    accounts.get(phone) ?? {
      phone,
      language: "en",
      notificationsEnabled: true,
      deletionScheduledAt: null,
    }
  );
}
export function updateAccount(phone, patch) {
  const next = { ...getAccount(phone), ...patch };
  accounts.set(phone, next);
  return next;
}

/** refund_id -> refund request (maker-checker) */
const refundRequests = new Map();

export function createRefundRequest(req) {
  const record = { id: newId("rfnd"), status: "pending", createdAt: Date.now(), ...req };
  refundRequests.set(record.id, record);
  return record;
}
export function getRefundRequest(id) {
  return refundRequests.get(id) ?? null;
}
export function listRefundRequests() {
  return [...refundRequests.values()].sort((a, b) => b.createdAt - a.createdAt);
}

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

/** Admin: every KYC record, with its phone. */
export function allKyc() {
  return [...kyc.entries()].map(([phone, v]) => ({ phone, ...v }));
}

/**
 * Spend so far for a user. Still 0 here; a proper rollup from PAID/SUCCESS
 * transactions lands with the Postgres migration (Phase 4+).
 */
export function getSpend(phone) {
  const paidStates = new Set(["PAID", "PAYOUT_QUEUED", "PAYOUT_PROCESSING", "SUCCESS"]);
  const dayKey = (timestamp) =>
    new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(timestamp);
  const monthKey = (timestamp) => dayKey(timestamp).slice(0, 7);
  const today = dayKey(Date.now());
  const month = today.slice(0, 7);
  let spentTodayMinor = 0;
  let spentMonthMinor = 0;

  for (const txn of transactions.values()) {
    if (txn.phone !== phone || !paidStates.has(txn.state)) continue;
    const amount = txn.fee?.payeeMinor ?? 0;
    const createdAt = txn.createdAt instanceof Date ? txn.createdAt : new Date(txn.createdAt);
    if (dayKey(createdAt) === today) spentTodayMinor += amount;
    if (monthKey(createdAt) === month) spentMonthMinor += amount;
  }
  return { spentTodayMinor, spentMonthMinor };
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

/** Admin: every transaction. */
export function allTransactions() {
  return [...transactions.values()].sort((a, b) => b.createdAt - a.createdAt);
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

// --- rewards (coins) -----------------------------------------------------
export function getRewards(phone) {
  return rewards.get(phone) ?? { balance: 0, history: [] };
}
export function awardCoins(phone, coins, reason, txnId = null) {
  if (!(coins > 0)) return getRewards(phone);
  const cur = getRewards(phone);
  const next = {
    balance: cur.balance + coins,
    history: [{ coins, reason, txnId, at: Date.now() }, ...cur.history],
  };
  rewards.set(phone, next);
  return next;
}

// --- referrals -----------------------------------------------------------
export function getReferral(phone) {
  let r = referrals.get(phone);
  if (!r) {
    const code =
      "XOR" +
      crypto.createHash("sha1").update(phone).digest("hex").slice(0, 6).toUpperCase();
    r = { code, referredBy: null, referrals: [] };
    referrals.set(phone, r);
    referralCodes.set(code, phone);
  }
  return r;
}
export function phoneForReferralCode(code) {
  return referralCodes.get((code || "").toUpperCase()) ?? null;
}
export function recordReferral(ownerPhone, newUserPhone) {
  const owner = getReferral(ownerPhone);
  owner.referrals = [...owner.referrals, newUserPhone];
  referrals.set(ownerPhone, owner);
  const invitee = getReferral(newUserPhone);
  invitee.referredBy = ownerPhone;
  referrals.set(newUserPhone, invitee);
}

// --- notifications -------------------------------------------------------
export function listNotifications(phone) {
  return notifications.get(phone) ?? [];
}
export function addNotification(phone, note) {
  const list = listNotifications(phone);
  const record = { id: newId("ntf"), read: false, at: Date.now(), ...note };
  notifications.set(phone, [record, ...list]);
  return record;
}
export function markNotificationRead(phone, id) {
  notifications.set(
    phone,
    listNotifications(phone).map((n) => (n.id === id ? { ...n, read: true } : n)),
  );
}

// --- shared double-entry ledger -----------------------------------------
import { Ledger } from "./ledger/ledger.js";
export const ledger = new Ledger();
