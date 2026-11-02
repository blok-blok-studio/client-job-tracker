import type { InvoiceSettings } from "./settings";

/**
 * VAT rules for studio invoices, as agreed with BD Berlin Digital Tax (spec of
 * 2026-11-02). Pure functions: the API and the UI both call them so the
 * preview and the printed invoice can never disagree.
 */
export type InvoiceTemplate = "DE" | "US" | "EU";
export type VatScheme = "KLEINUNTERNEHMER" | "DRITTLAND" | "REVERSE_CHARGE" | "REGULAR";
export type InvoiceLanguage = "de" | "en";
export type InvoiceCurrency = string; // ISO 4217; EUR + USD have dedicated bank blocks, others use settings.otherBanks

export const EU_COUNTRIES = [
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE", "IT", "LV", "LT", "LU",
  "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE",
];

export const COUNTRY_CURRENCY: Record<string, string> = {
  GB: "GBP", CH: "CHF", CA: "CAD", AU: "AUD", NZ: "NZD", SE: "SEK", NO: "NOK", DK: "DKK", PL: "PLN", CZ: "CZK", HU: "HUF",
  PH: "PHP", JP: "JPY", SG: "SGD", HK: "HKD", MX: "MXN", BR: "BRL", ZA: "ZAR", IN: "INR", TR: "TRY", IL: "ILS", KR: "KRW", CN: "CNY", AE: "AED",
};

const COUNTRY_WORDS: Array<[RegExp, string]> = [
  [/\b(deutschland|germany|berlin|münchen|munich|hamburg|köln|cologne|frankfurt)\b/i, "DE"],
  [/\b(usa|u\.s\.a\.|united states|america|texas|california|new york|florida|dallas|austin|houston)\b/i, "US"],
  [/\b(österreich|austria)\b/i, "AT"],
  [/\b(schweiz|switzerland)\b/i, "CH"],
  [/\b(nederland|netherlands|holland)\b/i, "NL"],
  [/\b(france|frankreich)\b/i, "FR"],
  [/\b(españa|spain|spanien)\b/i, "ES"],
  [/\b(italia|italy|italien)\b/i, "IT"],
  [/\b(united kingdom|england|uk|great britain)\b/i, "GB"],
  [/\b(canada|kanada)\b/i, "CA"],
  [/\b(china|prc)\b/i, "CN"],
  [/\b(philippines|pilipinas|manila|cebu)\b/i, "PH"],
  [/\b(australia)\b/i, "AU"],
];

/** Best guess at an ISO country code from the client record. */
export function guessCountry(client: { country?: string | null; companyCountry?: string | null; companyState?: string | null }): string | null {
  if (client.country && /^[A-Z]{2}$/.test(client.country)) return client.country;
  const text = [client.companyCountry, client.companyState].filter(Boolean).join(" ");
  if (!text) return null;
  const upper = text.trim().toUpperCase();
  if (/^[A-Z]{2}$/.test(upper)) return upper;
  for (const [re, code] of COUNTRY_WORDS) if (re.test(text)) return code;
  return null;
}

/** 1. German client → DE. 2. EU client outside Germany → EU. 3. Everyone else → US. */
export function templateForCountry(country: string | null): InvoiceTemplate {
  if (country === "DE") return "DE";
  if (country && EU_COUNTRIES.includes(country)) return "EU";
  return "US";
}

export function defaultsForTemplate(template: InvoiceTemplate): { language: InvoiceLanguage; currency: InvoiceCurrency } {
  if (template === "DE") return { language: "de", currency: "EUR" };
  if (template === "EU") return { language: "en", currency: "EUR" };
  return { language: "en", currency: "USD" };
}

/** Is the § 19 UStG small-business scheme still in force on this date? */
export function isKleinunternehmer(issueDate: Date, settings: Pick<InvoiceSettings, "kleinunternehmerUntil">): boolean {
  const iso = issueDate.toISOString().slice(0, 10);
  return iso <= settings.kleinunternehmerUntil;
}

export interface VatDecision {
  scheme: VatScheme;
  rate: number; // percent
  /** Printed under the totals, one entry per line */
  notes: string[];
  /** Human warning for the owner (not printed) */
  warning: string | null;
  /** The client's VAT id must be on the invoice */
  requiresClientVatId: boolean;
}

export type VatOverride = "AUTO" | VatScheme;

export const VAT_OVERRIDE_OPTIONS: Array<{ value: VatOverride; label: string }> = [
  { value: "AUTO", label: "Automatic (country + date rule)" },
  { value: "REGULAR", label: "19% USt (German VAT)" },
  { value: "KLEINUNTERNEHMER", label: "0%, § 19 UStG note" },
  { value: "REVERSE_CHARGE", label: "0%, EU reverse charge" },
  { value: "DRITTLAND", label: "0%, non-EU (§ 3a Abs. 2 UStG)" },
];

function forScheme(scheme: VatScheme, small: boolean): VatDecision {
  switch (scheme) {
    case "REGULAR":
      return {
        scheme,
        rate: 19,
        notes: [],
        warning: small ? "19% USt chosen while § 19 UStG is still in force. Only do this if you have opted out of the small-business scheme (Verzicht nach § 19 Abs. 2 UStG), otherwise the VAT is owed anyway. Confirm with BD Berlin Digital Tax." : null,
        requiresClientVatId: false,
      };
    case "KLEINUNTERNEHMER":
      return { scheme, rate: 0, notes: ["Gemäß § 19 UStG wird keine Umsatzsteuer berechnet."], warning: small ? null : "§ 19 note chosen after the small-business scheme ended. Check this is right.", requiresClientVatId: false };
    case "REVERSE_CHARGE":
      return { scheme, rate: 0, notes: ["Steuerschuldnerschaft des Leistungsempfängers / Reverse charge (Art. 196 MwStSystRL)."], warning: "Reverse charge needs the client's VAT ID on the invoice.", requiresClientVatId: true };
    case "DRITTLAND":
      return {
        scheme,
        rate: 0,
        notes: ["Keine Umsatzsteuer gemäß § 3a Abs. 2 UStG (Leistung an ein Drittland).", "No VAT charged according to § 3a (2) UStG for services supplied to a non-EU country."],
        warning: null,
        requiresClientVatId: false,
      };
  }
}

export function decideVat(input: {
  template: InvoiceTemplate;
  issueDate: Date;
  clientVatId?: string | null;
  settings: Pick<InvoiceSettings, "kleinunternehmerUntil">;
  override?: VatOverride | null;
}): VatDecision {
  const small = isKleinunternehmer(input.issueDate, input.settings);
  if (input.override && input.override !== "AUTO") return forScheme(input.override, small);
  if (input.template === "DE") {
    if (small) {
      return {
        scheme: "KLEINUNTERNEHMER",
        rate: 0,
        notes: ["Gemäß § 19 UStG wird keine Umsatzsteuer berechnet."],
        warning: null,
        requiresClientVatId: false,
      };
    }
    return {
      scheme: "REGULAR",
      rate: 19,
      notes: [],
      warning: "Regular VAT (19% USt) applies from 2027. Confirm the VAT filing setup with BD Berlin Digital Tax before sending.",
      requiresClientVatId: false,
    };
  }
  if (input.template === "EU") {
    return {
      scheme: "REVERSE_CHARGE",
      rate: 0,
      notes: ["Steuerschuldnerschaft des Leistungsempfängers / Reverse charge (Art. 196 MwStSystRL)."],
      warning: small
        ? "EU client outside Germany: confirm with BD Berlin Digital Tax before issuing (reverse charge while under § 19 UStG). The client's VAT ID is required."
        : "EU business client: reverse charge, 0% VAT. The client's VAT ID is required on the invoice.",
      requiresClientVatId: true,
    };
  }
  return {
    scheme: "DRITTLAND",
    rate: 0,
    notes: [
      "Keine Umsatzsteuer gemäß § 3a Abs. 2 UStG (Leistung an ein Drittland).",
      "No VAT charged according to § 3a (2) UStG for services supplied to a non-EU country.",
    ],
    warning: null,
    requiresClientVatId: false,
  };
}

export const VAT_SCHEME_LABELS: Record<VatScheme, string> = {
  KLEINUNTERNEHMER: "§ 19 UStG, no VAT",
  DRITTLAND: "Non-EU, no VAT (§ 3a Abs. 2 UStG)",
  REVERSE_CHARGE: "EU reverse charge, 0% VAT",
  REGULAR: "19% USt",
};
