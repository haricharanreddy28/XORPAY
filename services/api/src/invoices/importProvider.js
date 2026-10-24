// GSTR import abstraction (spec §3.4.6). Pulls purchase invoices from GSTR-2A
// (auto-drafted) / 2B (static monthly) via a GST Suvidha Provider (GSP). The
// real flow needs the user's GST login + OTP through the GSP. Swappable.

/** Deterministic dev importer: returns sample purchase invoices. No network. */
export class StubGstrImporter {
  name = "stub";
  async fetchInvoices(_phone, source = "2B") {
    // Original, generic sample suppliers — amounts in paise.
    const now = new Date().toISOString().slice(0, 10);
    return [
      { supplierGstin: "29ABCDE1234F1Z5", supplierName: "Acme Supplies", invoiceNo: "AS-1042", invoiceDate: now, amountMinor: 4_50_000, source },
      { supplierGstin: "29ABCDE1234F1Z5", supplierName: "Acme Supplies", invoiceNo: "AS-1043", invoiceDate: now, amountMinor: 1_20_000, source },
      { supplierGstin: "27PQRSX6789K2Z1", supplierName: "Northwind Traders", invoiceNo: "NW-556", invoiceDate: now, amountMinor: 9_80_000, source },
      { supplierGstin: "27PQRSX6789K2Z1", supplierName: "Northwind Traders", invoiceNo: "NW-557", invoiceDate: now, amountMinor: 2_35_000, source },
      { supplierGstin: "06LMNOP4321Q3Z9", supplierName: "Summit Hardware", invoiceNo: "SH-91", invoiceDate: now, amountMinor: 75_000, source },
    ];
  }
}

/**
 * GSP importer SKELETON. A real integration authenticates the user's GSTIN
 * with the GSP (login + OTP), then fetches GSTR-2A/2B for a return period.
 * Confirm endpoints/auth with your GSP (ClearTax, Masters India, etc.), then
 * fill the marked spots. Credentials stay server-side.
 */
export class GspGstrImporter {
  constructor({ baseUrl, apiKey }) {
    this.baseUrl = baseUrl;
    this.apiKey = apiKey;
  }
  get name() {
    return "gsp";
  }
  // TODO: authenticate the GSTIN session, then GET the return for the period.
  async fetchInvoices(_phone, source = "2B", period) {
    const res = await fetch(`${this.baseUrl}/gstr/${source}?period=${period ?? ""}`, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });
    const data = await res.json().catch(() => ({}));
    // TODO: map the GSP's document shape to our invoice shape.
    return (data?.invoices ?? []).map((d) => ({
      supplierGstin: d.ctin,
      supplierName: d.trdnm,
      invoiceNo: d.inum,
      invoiceDate: d.dt,
      amountMinor: Math.round(Number(d.val) * 100),
      source,
    }));
  }
}

export function makeGstrImporter(env = process.env) {
  if ((env.GSP_PROVIDER || "").toLowerCase() === "gsp" && env.GSP_BASE_URL && env.GSP_API_KEY) {
    return new GspGstrImporter({ baseUrl: env.GSP_BASE_URL, apiKey: env.GSP_API_KEY });
  }
  return new StubGstrImporter();
}
