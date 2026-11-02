/**
 * Invoice settings — everything printed on a studio invoice that is not the
 * client or the line items. Lives in the Setting table under `invoice_settings`
 * so the owner edits it on /invoices without a deploy.
 *
 * Bank fields ship EMPTY on purpose. Nothing here invents an IBAN, a routing
 * number or a tax id: issuing is refused until the bank block for the
 * invoice's currency is filled in.
 */
export interface EurBank {
  holder: string;
  iban: string;
  bic: string;
  bank: string;
}

export interface UsdBank {
  holder: string;
  bank: string;
  routing: string; // ACH routing number
  account: string; // account number
  swift: string; // wire / SWIFT-BIC
  bankAddress: string;
}

export interface InvoiceSettings {
  sellerName: string;
  contactName: string;
  email: string;
  website: string;
  addressLines: string[];
  steuernummer: string;
  ustIdNr: string;
  eur: EurBank;
  usd: UsdBank;
  /** Wise "request money" link, printed on USD invoices and encoded in their QR */
  wisePayLink: string;
  defaultDueDays: number;
  /** Last day of the § 19 UStG small-business scheme (ISO date). Invoices issued after it charge 19% to German clients. */
  kleinunternehmerUntil: string;
  /** Crossing this in a calendar year ends § 19 immediately (EUR). */
  revenueCeilingEur: number;
  /** First number to use in `sequenceStartYear` when no invoice exists yet (for numbers issued before this system). */
  sequenceStartYear: number;
  sequenceStart: number;
  /** Rough Stripe card cost shown next to the Stripe option, in percent. */
  stripeFeePct: number;
}

export const INVOICE_SETTINGS_KEY = "invoice_settings";

export const DEFAULT_INVOICE_SETTINGS: InvoiceSettings = {
  sellerName: "Blok Blok Studio LLC",
  contactName: "Chase Haynes",
  email: "chase@blokblokstudio.com",
  website: "blokblokstudio.com",
  addressLines: ["Max-Beer-Straße 50", "10119 Berlin", "Deutschland / Germany"],
  steuernummer: "13/334/01938",
  ustIdNr: "",
  eur: { holder: "Blok Blok Studio LLC", iban: "", bic: "", bank: "" },
  usd: { holder: "Blok Blok Studio LLC", bank: "", routing: "", account: "", swift: "", bankAddress: "" },
  wisePayLink: "",
  defaultDueDays: 14,
  kleinunternehmerUntil: "2026-12-31",
  revenueCeilingEur: 100000,
  sequenceStartYear: 2026,
  sequenceStart: 1,
  stripeFeePct: 5.5,
};

function str(v: unknown, fallback: string): string {
  return typeof v === "string" ? v : fallback;
}
function num(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

/** Merge a stored (possibly partial) object over the defaults so new fields never read as undefined. */
export function normalizeInvoiceSettings(raw: unknown): InvoiceSettings {
  const d = DEFAULT_INVOICE_SETTINGS;
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const eur = (r.eur && typeof r.eur === "object" ? r.eur : {}) as Record<string, unknown>;
  const usd = (r.usd && typeof r.usd === "object" ? r.usd : {}) as Record<string, unknown>;
  return {
    sellerName: str(r.sellerName, d.sellerName),
    contactName: str(r.contactName, d.contactName),
    email: str(r.email, d.email),
    website: str(r.website, d.website),
    addressLines: Array.isArray(r.addressLines)
      ? r.addressLines.filter((l): l is string => typeof l === "string").map((l) => l.trim()).filter(Boolean)
      : d.addressLines,
    steuernummer: str(r.steuernummer, d.steuernummer),
    ustIdNr: str(r.ustIdNr, d.ustIdNr),
    eur: {
      holder: str(eur.holder, d.eur.holder),
      iban: str(eur.iban, "").replace(/\s+/g, "").toUpperCase(),
      bic: str(eur.bic, "").replace(/\s+/g, "").toUpperCase(),
      bank: str(eur.bank, ""),
    },
    usd: {
      holder: str(usd.holder, d.usd.holder),
      bank: str(usd.bank, ""),
      routing: str(usd.routing, "").trim(),
      account: str(usd.account, "").trim(),
      swift: str(usd.swift, "").replace(/\s+/g, "").toUpperCase(),
      bankAddress: str(usd.bankAddress, ""),
    },
    wisePayLink: /^https:\/\/(www\.)?wise\.com\//i.test(str(r.wisePayLink, "").trim()) ? str(r.wisePayLink, "").trim() : "",
    defaultDueDays: Math.min(90, Math.max(0, Math.round(num(r.defaultDueDays, d.defaultDueDays)))),
    kleinunternehmerUntil: /^\d{4}-\d{2}-\d{2}$/.test(str(r.kleinunternehmerUntil, ""))
      ? (r.kleinunternehmerUntil as string)
      : d.kleinunternehmerUntil,
    revenueCeilingEur: Math.max(0, num(r.revenueCeilingEur, d.revenueCeilingEur)),
    sequenceStartYear: Math.round(num(r.sequenceStartYear, d.sequenceStartYear)),
    sequenceStart: Math.max(1, Math.round(num(r.sequenceStart, d.sequenceStart))),
    stripeFeePct: Math.max(0, num(r.stripeFeePct, d.stripeFeePct)),
  };
}

/** IBAN check: country + length + mod-97. Enough to catch typos before they land on a client's invoice. */
export function isValidIban(iban: string): boolean {
  const v = iban.replace(/\s+/g, "").toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(v)) return false;
  const rearranged = v.slice(4) + v.slice(0, 4);
  let remainder = 0;
  for (const ch of rearranged) {
    const code = ch >= "A" && ch <= "Z" ? String(ch.charCodeAt(0) - 55) : ch;
    for (const digit of code) remainder = (remainder * 10 + Number(digit)) % 97;
  }
  return remainder === 1;
}

/** What still has to be filled in before an invoice in `currency` can be issued. */
export function missingBankFields(settings: InvoiceSettings, currency: "EUR" | "USD"): string[] {
  const missing: string[] = [];
  if (currency === "EUR") {
    if (!settings.eur.holder) missing.push("EUR account holder");
    if (!settings.eur.iban) missing.push("IBAN");
    else if (!isValidIban(settings.eur.iban)) missing.push("IBAN (fails the checksum)");
    if (!settings.eur.bank) missing.push("EUR bank name");
  } else {
    if (!settings.usd.holder) missing.push("USD account holder");
    if (!settings.usd.bank) missing.push("USD bank name");
    if (!settings.usd.routing) missing.push("ACH routing number");
    if (!settings.usd.account) missing.push("USD account number");
  }
  if (!settings.steuernummer && !settings.ustIdNr) missing.push("Steuernummer or USt-IdNr");
  return missing;
}

/** Non-blocking advice shown on the settings card. */
export function settingsWarnings(settings: InvoiceSettings): string[] {
  const w: string[] = [];
  if (settings.eur.iban && !isValidIban(settings.eur.iban)) w.push("The IBAN does not pass the checksum. Re-check it before issuing EUR invoices.");
  if (!settings.eur.iban) w.push("EUR bank details are empty. EUR invoices cannot be issued until the IBAN is in.");
  if (!settings.usd.routing || !settings.usd.account) w.push("USD (Wise) account details are empty. USD invoices cannot be issued until they are in.");
  return w;
}
