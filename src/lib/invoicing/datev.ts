import type { StudioInvoice } from "@prisma/client";

/**
 * DATEV "Buchungsstapel" (EXTF, format 700) for the tax advisor's import.
 * One line per issued invoice: gross amount against the revenue account for
 * its VAT treatment, invoice number as Belegfeld 1. SKR03 defaults, every
 * account editable in settings. The advisor should confirm the accounts
 * before the first import; the file layout itself is the standard one.
 */
export interface DatevSettings {
  skr: "SKR03" | "SKR04";
  debtorAccount: string; // Sammeldebitor
  accounts: { KLEINUNTERNEHMER: string; REGULAR: string; REVERSE_CHARGE: string; DRITTLAND: string };
  beraterNr: string;
  mandantNr: string;
  accountLength: number; // Sachkontenlänge (4..8)
}

export const DEFAULT_DATEV: DatevSettings = {
  skr: "SKR03",
  debtorAccount: "10000",
  accounts: { KLEINUNTERNEHMER: "8195", REGULAR: "8400", REVERSE_CHARGE: "8336", DRITTLAND: "8338" },
  beraterNr: "",
  mandantNr: "",
  accountLength: 4,
};

const SKR04 = { KLEINUNTERNEHMER: "4185", REGULAR: "4400", REVERSE_CHARGE: "4336", DRITTLAND: "4338" };

export function normalizeDatev(raw: unknown): DatevSettings {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const skr = r.skr === "SKR04" ? "SKR04" : "SKR03";
  const base = skr === "SKR04" ? SKR04 : DEFAULT_DATEV.accounts;
  const acc = (r.accounts && typeof r.accounts === "object" ? r.accounts : {}) as Record<string, unknown>;
  const pick = (k: keyof DatevSettings["accounts"]) => (typeof acc[k] === "string" && /^\d{4,8}$/.test(acc[k] as string) ? (acc[k] as string) : base[k]);
  return {
    skr,
    debtorAccount: typeof r.debtorAccount === "string" && /^\d{4,9}$/.test(r.debtorAccount) ? r.debtorAccount : DEFAULT_DATEV.debtorAccount,
    accounts: { KLEINUNTERNEHMER: pick("KLEINUNTERNEHMER"), REGULAR: pick("REGULAR"), REVERSE_CHARGE: pick("REVERSE_CHARGE"), DRITTLAND: pick("DRITTLAND") },
    beraterNr: typeof r.beraterNr === "string" ? r.beraterNr.replace(/\D/g, "").slice(0, 7) : "",
    mandantNr: typeof r.mandantNr === "string" ? r.mandantNr.replace(/\D/g, "").slice(0, 5) : "",
    accountLength: Math.min(8, Math.max(4, Number(r.accountLength) || 4)),
  };
}

const q = (v: string | number | null | undefined) => (v == null || v === "" ? "" : `"${String(v).replace(/"/g, '""')}"`);
const de = (n: number) => n.toFixed(2).replace(".", ",");
const ddmm = (d: Date) => `${String(d.getUTCDate()).padStart(2, "0")}${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
const yyyymmdd = (d: Date) => `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;

/** Rows = issued invoices (incl. corrections, excl. drafts/void) in the period; `eurOf` gives the booked EUR amount. */
export function buildDatevCsv(
  rows: Array<StudioInvoice & { clientLabel: string }>,
  period: { from: Date; to: Date; year: number },
  cfg: DatevSettings
): string {
  const now = new Date();
  const stamp = `${yyyymmdd(now)}${String(now.getUTCHours()).padStart(2, "0")}${String(now.getUTCMinutes()).padStart(2, "0")}${String(now.getUTCSeconds()).padStart(2, "0")}000`;
  const toExcl = new Date(period.to.getTime() - 86_400_000);
  const header = [
    q("EXTF"), 700, 21, q("Buchungsstapel"), 12, stamp, "", q("BB"), q("Blok Blok CC"), "", cfg.beraterNr || "", cfg.mandantNr || "", `${period.year}0101`, cfg.accountLength,
    yyyymmdd(period.from), yyyymmdd(toExcl), q(`Rechnungen ${period.from.toISOString().slice(0, 7)}`), q("BB"), 1, 0, 0, q("EUR"), "", "", "", "", q(""), "", "", "", "",
  ].join(";");
  const columns = [
    "Umsatz (ohne Soll/Haben-Kz)", "Soll/Haben-Kennzeichen", "WKZ Umsatz", "Kurs", "Basis-Umsatz", "WKZ Basis-Umsatz", "Konto", "Gegenkonto (ohne BU-Schlüssel)", "BU-Schlüssel", "Belegdatum", "Belegfeld 1", "Belegfeld 2", "Skonto", "Buchungstext",
    "Postensperre", "Diverse Adressnummer", "Geschäftspartnerbank", "Sachverhalt", "Zinssperre", "Beleglink", "Beleginfo - Art 1", "Beleginfo - Inhalt 1", "Beleginfo - Art 2", "Beleginfo - Inhalt 2", "Beleginfo - Art 3", "Beleginfo - Inhalt 3", "Beleginfo - Art 4", "Beleginfo - Inhalt 4", "Beleginfo - Art 5", "Beleginfo - Inhalt 5", "Beleginfo - Art 6", "Beleginfo - Inhalt 6", "Beleginfo - Art 7", "Beleginfo - Inhalt 7", "Beleginfo - Art 8", "Beleginfo - Inhalt 8",
    "KOST1 - Kostenstelle", "KOST2 - Kostenstelle", "Kost-Menge", "EU-Land u. UStID", "EU-Steuersatz", "Abw. Versteuerungsart", "Sachverhalt L+L", "Funktionsergänzung L+L", "BU 49 Hauptfunktionstyp", "BU 49 Hauptfunktionsnummer", "BU 49 Funktionsergänzung",
    "Zusatzinformation - Art 1", "Zusatzinformation- Inhalt 1", "Zusatzinformation - Art 2", "Zusatzinformation- Inhalt 2", "Zusatzinformation - Art 3", "Zusatzinformation- Inhalt 3", "Zusatzinformation - Art 4", "Zusatzinformation- Inhalt 4", "Zusatzinformation - Art 5", "Zusatzinformation- Inhalt 5", "Zusatzinformation - Art 6", "Zusatzinformation- Inhalt 6", "Zusatzinformation - Art 7", "Zusatzinformation- Inhalt 7", "Zusatzinformation - Art 8", "Zusatzinformation- Inhalt 8", "Zusatzinformation - Art 9", "Zusatzinformation- Inhalt 9", "Zusatzinformation - Art 10", "Zusatzinformation- Inhalt 10", "Zusatzinformation - Art 11", "Zusatzinformation- Inhalt 11", "Zusatzinformation - Art 12", "Zusatzinformation- Inhalt 12", "Zusatzinformation - Art 13", "Zusatzinformation- Inhalt 13", "Zusatzinformation - Art 14", "Zusatzinformation- Inhalt 14", "Zusatzinformation - Art 15", "Zusatzinformation- Inhalt 15", "Zusatzinformation - Art 16", "Zusatzinformation- Inhalt 16", "Zusatzinformation - Art 17", "Zusatzinformation- Inhalt 17", "Zusatzinformation - Art 18", "Zusatzinformation- Inhalt 18", "Zusatzinformation - Art 19", "Zusatzinformation- Inhalt 19", "Zusatzinformation - Art 20", "Zusatzinformation- Inhalt 20",
    "Stück", "Gewicht", "Zahlweise", "Forderungsart", "Veranlagungsjahr", "Zugeordnete Fälligkeit", "Skontotyp", "Auftragsnummer", "Buchungstyp", "USt-Schlüssel (Anzahlungen)", "EU-Land (Anzahlungen)", "Sachverhalt L+L (Anzahlungen)", "EU-Steuersatz (Anzahlungen)", "Erlöskonto (Anzahlungen)", "Herkunft-Kz", "Buchungs GUID", "KOST-Datum", "SEPA-Mandatsreferenz", "Skontosperre", "Gesellschaftername", "Beteiligtennummer", "Identifikationsnummer", "Zeichnernummer", "Postensperre bis", "Bezeichnung SoBil-Sachverhalt", "Kennzeichen SoBil-Buchung", "Festschreibung", "Leistungsdatum", "Datum Zuord. Steuerperiode",
  ];
  const lines = [header, columns.join(";")];
  for (const r of rows) {
    const gross = Number(r.total);
    // Unpaid invoices and their offset corrections have no booked EUR amount yet
    const offset = r.kind === "CORRECTION" && r.paidMethod === "offset";
    const eur = r.eurAmount != null && !offset ? Number(r.eurAmount) : r.currency === "EUR" ? gross : null;
    const amountForBooking = eur ?? gross; // non-EUR without a stored rate: advisor sees WKZ and converts
    const sh = amountForBooking >= 0 ? "S" : "H"; // debtor is debited for a sale, credited for a correction
    const revenue = cfg.accounts[(r.vatScheme as keyof DatevSettings["accounts"]) || "DRITTLAND"] || cfg.accounts.DRITTLAND;
    const row: Array<string | number> = new Array(columns.length).fill("");
    row[0] = de(Math.abs(amountForBooking));
    row[1] = q(sh);
    row[2] = q(eur != null ? "EUR" : r.currency);
    row[3] = eur != null && r.currency !== "EUR" && r.fxRateToEur ? String(Number(r.fxRateToEur)).replace(".", ",") : "";
    row[4] = eur != null && r.currency !== "EUR" ? de(Math.abs(gross)) : "";
    row[5] = eur != null && r.currency !== "EUR" ? q(r.currency) : "";
    row[6] = cfg.debtorAccount;
    row[7] = revenue;
    row[9] = r.issueDate ? ddmm(r.issueDate) : "";
    row[10] = q(r.number || "");
    row[11] = r.dueDate ? q(ddmm(r.dueDate)) : "";
    row[13] = q(`${r.clientLabel}${r.kind === "CORRECTION" ? " (Storno)" : ""}`.slice(0, 60));
    row[113] = r.serviceDateTo ? yyyymmdd(r.serviceDateTo) : r.issueDate ? yyyymmdd(r.issueDate) : "";
    lines.push(row.join(";"));
  }
  return lines.join("\r\n") + "\r\n";
}
