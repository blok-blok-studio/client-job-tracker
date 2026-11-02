/**
 * Pure-function checks for the studio invoicing module + sample PDFs.
 *   npx tsx scripts/test-invoicing.ts [outDir]
 * No database, no network.
 */
import fs from "fs";
import path from "path";
import { computeTotals, formatMoneyPdf, formatMoney } from "../src/lib/invoicing/money";
import { decideVat, templateForCountry, guessCountry, defaultsForTemplate, COUNTRY_CURRENCY } from "../src/lib/invoicing/vat";
import { buildEpcPayload } from "../src/lib/invoicing/epc-qr";
import { formatInvoiceNumber, nextSequenceFor } from "../src/lib/invoicing/numbering";
import { isValidIban, normalizeInvoiceSettings, missingBankFields, DEFAULT_INVOICE_SETTINGS, isPlausibleVatId, settingsWarnings, MAIN_CURRENCIES } from "../src/lib/invoicing/settings-core";
import { renderInvoicePdf } from "../src/lib/invoicing/invoice-pdf";
import type { InvoiceView } from "../src/lib/invoicing/types";
import { statementVat, renderStatementPdf, statementNumber, type StatementView } from "../src/lib/invoicing/partner-statement";
import { firstRunAt, advanceRun, fillPeriod } from "../src/lib/invoicing/recurring";
import { stageDue } from "../src/lib/invoicing/reminders";
import { buildCiiXml } from "../src/lib/invoicing/einvoice";
import { parseBankCsv } from "../src/lib/invoicing/reconcile";
import { buildDatevCsv, normalizeDatev } from "../src/lib/invoicing/datev";

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, extra?: unknown) {
  if (ok) pass++;
  else {
    fail++;
    console.log("FAIL", name, extra ?? "");
  }
}

// Totals
const t = computeTotals([{ description: "Website", qty: 1, unitPrice: 5000 }, { description: "Hours", qty: 2.5, unitPrice: 90.1 }], 19);
check("subtotal", t.subtotal === 5225.25, t);
check("vat 19%", t.vatAmount === 992.8, t);
check("total", t.total === 6218.05, t);
check("rounding 1.005", computeTotals([{ description: "x", qty: 1, unitPrice: 1.005 }], 0).subtotal === 1.01);
check("de money pdf", formatMoneyPdf(1234.5, "EUR", "de") === "1.234,50 EUR", formatMoneyPdf(1234.5, "EUR", "de"));
check("us money pdf", formatMoneyPdf(1234.5, "USD", "en") === "$1,234.50", formatMoneyPdf(1234.5, "USD", "en"));
check("en eur money pdf", formatMoneyPdf(1234.5, "EUR", "en") === "EUR 1,234.50", formatMoneyPdf(1234.5, "EUR", "en"));
check("de money web", formatMoney(1234.5, "EUR", "de").includes("1.234,50"), formatMoney(1234.5, "EUR", "de"));

// Templates
check("DE template", templateForCountry("DE") === "DE");
check("AT template", templateForCountry("AT") === "EU");
check("US template", templateForCountry("US") === "US");
check("unknown template", templateForCountry(null) === "US");
check("CH is non-EU", templateForCountry("CH") === "US");
check("guess from text", guessCountry({ country: null, companyCountry: "Germany" }) === "DE");
check("guess from state", guessCountry({ country: null, companyCountry: null, companyState: "Texas" }) === "US");
check("iso wins", guessCountry({ country: "DE", companyCountry: "USA" }) === "DE");
check("defaults DE", JSON.stringify(defaultsForTemplate("DE")) === JSON.stringify({ language: "de", currency: "EUR" }));

// VAT
const s = { kleinunternehmerUntil: "2026-12-31" };
const de26 = decideVat({ template: "DE", issueDate: new Date("2026-11-02"), settings: s });
check("DE 2026 §19", de26.scheme === "KLEINUNTERNEHMER" && de26.rate === 0 && de26.notes[0].includes("§ 19 UStG"));
const de27 = decideVat({ template: "DE", issueDate: new Date("2027-01-01"), settings: s });
check("DE 2027 19%", de27.scheme === "REGULAR" && de27.rate === 19 && de27.notes.length === 0);
const deLast = decideVat({ template: "DE", issueDate: new Date("2026-12-31T23:00:00Z"), settings: s });
check("DE last day still §19", deLast.scheme === "KLEINUNTERNEHMER");
const us = decideVat({ template: "US", issueDate: new Date("2027-03-01"), settings: s });
check("US drittland both notes", us.scheme === "DRITTLAND" && us.rate === 0 && us.notes.length === 2 && us.notes[1].startsWith("No VAT"));
const eu = decideVat({ template: "EU", issueDate: new Date("2026-11-02"), settings: s });
check("EU reverse charge", eu.scheme === "REVERSE_CHARGE" && eu.rate === 0 && eu.requiresClientVatId && !!eu.warning);

// EPC
const payload = buildEpcPayload({ name: "Blok Blok Studio LLC", iban: "DE89 3704 0044 0532 0130 00", bic: "COBADEFFXXX", amount: 1234.5, reference: "BBS-2026-007" });
const lines = payload.split("\n");
check("epc lines", lines.length === 12, lines.length);
check("epc header", lines[0] === "BCD" && lines[1] === "002" && lines[2] === "1" && lines[3] === "SCT");
check("epc iban stripped", lines[6] === "DE89370400440532013000");
check("epc amount", lines[7] === "EUR1234.50");
check("epc reference", lines[10] === "BBS-2026-007");
let threw = false;
try { buildEpcPayload({ name: "x", iban: "XX00", amount: 1, reference: "r" }); } catch { threw = true; }
check("epc rejects bad iban", threw);

// Numbering
check("number format", formatInvoiceNumber(2026, 7) === "BBS-2026-007");
check("next after 7", nextSequenceFor(2026, 7, { sequenceStartYear: 2026, sequenceStart: 1 }) === 8);
check("first of year honours start", nextSequenceFor(2026, null, { sequenceStartYear: 2026, sequenceStart: 5 }) === 5);
check("other year starts at 1", nextSequenceFor(2027, null, { sequenceStartYear: 2026, sequenceStart: 5 }) === 1);

// Settings
check("iban valid", isValidIban("DE89 3704 0044 0532 0130 00"));
check("iban invalid", !isValidIban("DE89 3704 0044 0532 0130 01"));
const norm = normalizeInvoiceSettings({ eur: { iban: "de89 3704 0044 0532 0130 00" }, defaultDueDays: 400 });
check("normalize iban", norm.eur.iban === "DE89370400440532013000");
check("normalize due cap", norm.defaultDueDays === 90);
check("defaults keep seller", norm.sellerName === "Blok Blok Studio LLC" && norm.steuernummer === "13/334/01938");
check("missing eur bank", missingBankFields(DEFAULT_INVOICE_SETTINGS, "EUR").includes("IBAN"));
check("missing usd bank", missingBankFields(DEFAULT_INVOICE_SETTINGS, "USD").includes("ACH routing number"));
check("complete eur", missingBankFields({ ...DEFAULT_INVOICE_SETTINGS, eur: { holder: "x", iban: "DE89370400440532013000", bic: "", bank: "N26" } }, "EUR").length === 0);

const ov = decideVat({ template: "DE", issueDate: new Date("2026-11-02"), settings: s, override: "REGULAR" });
check("override 19% in 2026 with warning", ov.scheme === "REGULAR" && ov.rate === 19 && !!ov.warning);
check("override AUTO = rule", decideVat({ template: "US", issueDate: new Date("2026-11-02"), settings: s, override: "AUTO" }).scheme === "DRITTLAND");
check("override reverse charge on US", decideVat({ template: "US", issueDate: new Date("2026-11-02"), settings: s, override: "REVERSE_CHARGE" }).requiresClientVatId);
check("vat id DE ok", isPlausibleVatId("DE 123 456 789"));
check("vat id DE bad", !isPlausibleVatId("DE12345678"));
check("vat id AT ok", isPlausibleVatId("ATU12345678"));
check("ustIdNr normalised", normalizeInvoiceSettings({ ustIdNr: "de 123456789" }).ustIdNr === "DE123456789");
check("bad ustIdNr warns", settingsWarnings({ ...DEFAULT_INVOICE_SETTINGS, ustIdNr: "DE1" }).some((w) => w.includes("USt-IdNr")));
check("wise link must be wise.com", normalizeInvoiceSettings({ wisePayLink: "https://evil.example/pay" }).wisePayLink === "");

// Recurring plans
check("first run same month", firstRunAt(new Date("2026-11-02T00:00:00Z"), 15).toISOString().slice(0, 10) === "2026-11-15");
check("first run next month", firstRunAt(new Date("2026-11-20T00:00:00Z"), 15).toISOString().slice(0, 10) === "2026-12-15");
check("first run on the day itself", firstRunAt(new Date("2026-11-15T00:00:00Z"), 15).toISOString().slice(0, 10) === "2026-11-15");
check("advance monthly across year", advanceRun(new Date("2026-12-28T00:00:00Z"), "MONTHLY", 28).toISOString().slice(0, 10) === "2027-01-28");
check("advance quarterly", advanceRun(new Date("2026-11-01T00:00:00Z"), "QUARTERLY", 1).toISOString().slice(0, 10) === "2027-02-01");
check("advance yearly", advanceRun(new Date("2026-11-01T00:00:00Z"), "YEARLY", 1).toISOString().slice(0, 10) === "2027-11-01");
check("fill month en", fillPeriod("Care plan, {month}", new Date("2026-11-01T00:00:00Z"), "MONTHLY", "en") === "Care plan, November 2026");
check("fill month de", fillPeriod("Betreuung {month}", new Date("2026-11-01T00:00:00Z"), "MONTHLY", "de") === "Betreuung November 2026");
check("fill quarter", fillPeriod("{period}", new Date("2026-11-01T00:00:00Z"), "QUARTERLY", "en") === "Q4 2026");
// Dunning stages
const cfg = { beforeDueDays: 3, overdueDays: [7, 14, 30] };
const due = new Date("2026-11-16T00:00:00Z");
check("no reminder 10 days before", stageDue(new Date("2026-11-06T00:00:00Z"), due, 0, cfg) === null);
check("due soon at -3d", stageDue(new Date("2026-11-13T00:00:00Z"), due, 0, cfg)?.kind === "due_soon");
check("due soon not repeated", stageDue(new Date("2026-11-14T00:00:00Z"), due, 1, cfg) === null);
check("nothing on due day", stageDue(new Date("2026-11-16T00:00:00Z"), due, 1, cfg) === null);
check("overdue at +7", stageDue(new Date("2026-11-23T00:00:00Z"), due, 1, cfg)?.stage === 2);
check("skip straight to +14 if never reminded", stageDue(new Date("2026-11-30T12:00:00Z"), due, 0, cfg)?.stage === 3);
check("final at +30", stageDue(new Date("2026-12-16T00:00:00Z"), due, 3, cfg)?.kind === "final");
check("final not repeated", stageDue(new Date("2027-01-16T00:00:00Z"), due, 4, cfg) === null);
check("other currency bank missing", missingBankFields(DEFAULT_INVOICE_SETTINGS, "GBP").some((m) => m.includes("GBP")));
check("other currency bank ok", missingBankFields({ ...DEFAULT_INVOICE_SETTINGS, otherBanks: [{ currency: "GBP", holder: "x", bank: "Wise", lines: [{ label: "Sort code", value: "23-14-70" }] }] }, "GBP").length === 0);
check("gbp pdf money", formatMoneyPdf(1234.5, "GBP", "en") === "£1,234.50", formatMoneyPdf(1234.5, "GBP", "en"));
check("jpy no decimals", formatMoneyPdf(1234, "JPY", "en") === "JPY 1,234", formatMoneyPdf(1234, "JPY", "en"));
check("normalize other banks drops EUR", normalizeInvoiceSettings({ otherBanks: [{ currency: "eur", lines: [] }, { currency: "gbp", holder: "h", bank: "b", lines: [{ label: "Sort code", value: "1" }] }] }).otherBanks.length === 1);

// Bank CSV parsing
const wise = `"ID","Status","Direction","Created on","Finished on","Source fee amount","Source fee currency","Target fee amount","Target fee currency","Source name","Source amount (after fees)","Source currency","Target name","Target amount (after fees)","Target currency","Exchange rate","Reference","Batch"
"TRANSFER-1","COMPLETED","IN","2026-11-03 10:00:00","2026-11-03 10:00:00","0","USD","0","USD","Bronco Plumbing","900.00","USD","Blok Blok Studio LLC","900.00","USD","1","BBS-2026-007",""
"TRANSFER-2","COMPLETED","OUT","2026-11-04 10:00:00","2026-11-04 10:00:00","0","USD","0","USD","Blok Blok Studio LLC","50.00","USD","Vendor","50.00","USD","1","rent",""`;
const pw = parseBankCsv(wise, "USD");
check("wise csv: 1 credit", pw.rows.length === 1 && pw.rows[0].amount === 900 && pw.rows[0].currency === "USD", pw);
check("wise csv: reference", pw.rows[0]?.reference === "BBS-2026-007");
const sparkasse = `Auftragskonto;Buchungstag;Valutadatum;Buchungstext;Verwendungszweck;Beguenstigter/Zahlungspflichtiger;Kontonummer/IBAN;BIC (SWIFT-Code);Betrag;Waehrung;Info
DE12;02.11.2026;02.11.2026;GUTSCHRIFT;Rechnung BBS-2026-005 Musterfirma;Musterfirma GmbH;DE89;COBADEFF;"5.800,00";EUR;Umsatz gebucht
DE12;03.11.2026;03.11.2026;LASTSCHRIFT;Miete;Vermieter;DE11;COBADEFF;"-1.200,00";EUR;Umsatz gebucht`;
const ps = parseBankCsv(sparkasse);
check("german csv: 1 credit, german decimals", ps.rows.length === 1 && ps.rows[0].amount === 5800 && ps.source === "de-bank", ps);
check("german csv: date dd.mm.yyyy", ps.rows[0]?.bookedAt.toISOString().slice(0, 10) === "2026-11-02");
check("german csv: counterparty", ps.rows[0]?.counterparty === "Musterfirma GmbH");
check("csv without columns errors", !!parseBankCsv("a,b\n1,2").error);
// DATEV
const datev = buildDatevCsv([
  { number: "BBS-2026-005", total: 5800 as never, eurAmount: 5800 as never, currency: "EUR", fxRateToEur: null, vatScheme: "KLEINUNTERNEHMER", issueDate: new Date("2026-11-02T00:00:00Z"), dueDate: new Date("2026-11-16T00:00:00Z"), serviceDateTo: null, kind: "INVOICE", clientLabel: "Musterfirma GmbH" } as never,
  { number: "BBS-2026-009", total: -119 as never, eurAmount: -119 as never, currency: "EUR", fxRateToEur: null, vatScheme: "REGULAR", issueDate: new Date("2026-11-05T00:00:00Z"), dueDate: null, serviceDateTo: null, kind: "CORRECTION", clientLabel: "Musterfirma GmbH" } as never,
], { from: new Date("2026-11-01T00:00:00Z"), to: new Date("2026-12-01T00:00:00Z"), year: 2026 }, normalizeDatev(null));
const dl = datev.split("\r\n");
check("datev header EXTF 700", dl[0].startsWith('"EXTF";700;21;"Buchungsstapel"'), dl[0]);
check("datev 116 columns", dl[1].split(";").length === 116, dl[1].split(";").length);
check("datev row: amount, S, debtor, 8195", dl[2].startsWith('5800,00;"S";"EUR";;;;10000;8195;;0211;"BBS-2026-005"'), dl[2]);
check("datev correction is H", dl[3].startsWith('119,00;"H";"EUR";;;;10000;8400;;0511;"BBS-2026-009"'), dl[3]);
check("datev skr04 default", normalizeDatev({ skr: "SKR04" }).accounts.REGULAR === "4400");

check("CN + PH map to their currency", COUNTRY_CURRENCY.CN === "CNY" && COUNTRY_CURRENCY.PH === "PHP");
check("china text -> CN, non-EU template", guessCountry({ companyCountry: "China" }) === "CN" && templateForCountry("CN") === "US");
check("philippines text -> PH, non-EU template", guessCountry({ companyCountry: "Philippines" }) === "PH" && templateForCountry("PH") === "US");
check("cny pdf money", formatMoneyPdf(12345.5, "CNY", "en") === "CNY 12,345.50", formatMoneyPdf(12345.5, "CNY", "en"));
check("php pdf money", formatMoneyPdf(12345.5, "PHP", "en") === "PHP 12,345.50", formatMoneyPdf(12345.5, "PHP", "en"));
check("main currencies", MAIN_CURRENCIES.map((c) => c.label).join() === "EUR,USD,RMB,PHP");
check("cny needs an account", missingBankFields(DEFAULT_INVOICE_SETTINGS, "CNY").some((m) => m.includes("CNY")));

// Partner statements
check("statement US = drittland, 0%", statementVat({ country: "US", chargesVat: false }).scheme === "DRITTLAND" && statementVat({ country: "US", chargesVat: false }).rate === 0);
check("statement DE no vat", statementVat({ country: "DE", chargesVat: false }).scheme === "KLEINUNTERNEHMER_PARTNER");
check("statement DE vat 19", statementVat({ country: "DE", chargesVat: true }).rate === 19);
check("statement AT reverse charge", statementVat({ country: "AT", chargesVat: false }).scheme === "REVERSE_CHARGE");
check("statement number", statementNumber(2026, 3) === "BBS-PS-2026-003");

// Sample PDFs (dummy bank details: this is a render test, nothing real)
const outDir = process.argv[2] || path.join(process.cwd(), ".invoice-samples");
fs.mkdirSync(outDir, { recursive: true });
const seller = {
  sellerName: "Blok Blok Studio LLC",
  contactName: "Chase Haynes",
  email: "chase@blokblokstudio.com",
  website: "blokblokstudio.com",
  addressLines: ["Max-Beer-Straße 50", "10119 Berlin", "Deutschland / Germany"],
  steuernummer: "13/334/01938",
  ustIdNr: "",
  eur: { holder: "Blok Blok Studio LLC", iban: "DE89370400440532013000", bic: "COBADEFFXXX", bank: "Beispielbank (TEST)" },
  usd: { holder: "Blok Blok Studio LLC", bank: "Wise US Inc. (TEST)", routing: "000000000", account: "0000000000", swift: "TESTUS00", bankAddress: "30 W. 26th Street, New York NY 10010" },
  wisePayLink: "https://wise.com/pay/business/example",
};
const base: Omit<InvoiceView, "language" | "currency" | "template" | "vatScheme" | "vatNotes" | "billTo" | "qrPayload" | "qrKind"> = {
  id: "x", token: "sampletoken", number: "BBS-2026-007", kind: "INVOICE", corrects: null, milestone: null, status: "ISSUED", vatRate: 0,
  issueDate: "2026-11-02", serviceDateFrom: "2026-10-01", serviceDateTo: "2026-10-31", dueDate: "2026-11-16", dueDays: 14,
  seller, items: computeTotals([
    { description: "Website redesign: 5 pages, responsive, CMS handover and launch support", qty: 1, unitPrice: 5000 },
    { description: "Social media videos (October)", qty: 4, unitPrice: 200 },
    { description: "Additional development hours", qty: 2.5, unitPrice: 90 },
  ], 0).items,
  subtotal: 6025, vatAmount: 0, total: 6025, paymentMethod: "BANK", paymentUrl: null,
  notes: "Zahlbar innerhalb von 14 Tagen ohne Abzug.", sentAt: null, sentTo: null, paidAt: null, paidMethod: null, voidedAt: null, voidReason: null,
  paymentReportedAt: null, paymentReportedNote: null, eurAmount: null, fxRateToEur: null, receiptSentAt: null,
  publicUrl: "https://app.blokblokstudio.com/b/sampletoken", createdAt: new Date().toISOString(),
};
const deView: InvoiceView = {
  ...base, language: "de", currency: "EUR", template: "DE", vatScheme: "KLEINUNTERNEHMER",
  vatNotes: ["Gemäß § 19 UStG wird keine Umsatzsteuer berechnet."],
  billTo: { name: "Max Mustermann", company: "Musterfirma GmbH", addressLines: ["Beispielstraße 1", "10115 Berlin", "Deutschland"], email: "max@musterfirma.de", vatId: null, country: "DE" },
  qrPayload: buildEpcPayload({ name: seller.eur.holder, iban: seller.eur.iban, bic: seller.eur.bic, amount: 6025, reference: "BBS-2026-007" }), qrKind: "EPC",
};
const usView: InvoiceView = {
  ...base, number: "BBS-2026-008", language: "en", currency: "USD", template: "US", vatScheme: "DRITTLAND",
  vatNotes: ["Keine Umsatzsteuer gemäß § 3a Abs. 2 UStG (Leistung an ein Drittland).", "No VAT charged according to § 3a (2) UStG for services supplied to a non-EU country."],
  billTo: { name: "Jane Doe", company: "Bronco Plumbing DFW", addressLines: ["123 Main St", "Dallas, TX 75201", "USA"], email: "jane@example.com", vatId: null, country: "US" },
  notes: "Payment by ACH or wire. Card payments available on request (processing fee applies).",
  qrPayload: seller.wisePayLink, qrKind: "URL",
};
const de27View: InvoiceView = {
  ...deView, number: "BBS-2027-001", issueDate: "2027-01-05", dueDate: "2027-01-19", vatScheme: "REGULAR", vatRate: 19, vatNotes: [],
  vatAmount: 1144.75, total: 7169.75, status: "PAID", paidAt: "2027-01-12T10:00:00Z",
  seller: { ...seller, ustIdNr: "DE000000000" },
  qrPayload: buildEpcPayload({ name: seller.eur.holder, iban: seller.eur.iban, bic: seller.eur.bic, amount: 7169.75, reference: "BBS-2027-001" }), qrKind: "EPC",
};
(async () => {
  const corrView: InvoiceView = { ...deView, number: "BBS-2026-009", kind: "CORRECTION", corrects: { number: "BBS-2026-007", issueDate: "2026-11-02" }, status: "PAID", paidAt: "2026-11-05T00:00:00Z", eurAmount: -6025, items: deView.items.map((i) => ({ ...i, unitPrice: -i.unitPrice, lineTotal: -i.lineTotal })), subtotal: -6025, total: -6025, notes: "Falsche Leistungsperiode", qrPayload: null, qrKind: null };
  const xml = buildCiiXml(deView);
  check("xml: en16931 profile", xml.includes("urn:cen.eu:en16931:2017"));
  check("xml: § 19 is category E", xml.includes("<ram:CategoryCode>E</ram:CategoryCode>") && xml.includes("§ 19 UStG"));
  check("xml: total + iban", xml.includes("<ram:GrandTotalAmount>6025.00</ram:GrandTotalAmount>") && xml.includes("DE89370400440532013000"));
  check("xml: buyer zip + city parsed", xml.includes("<ram:PostcodeCode>10115</ram:PostcodeCode>") && xml.includes("<ram:CityName>Berlin</ram:CityName>"), xml.slice(0, 0));
  check("xml: correction type 381, nothing due", buildCiiXml(corrView).includes("<ram:TypeCode>381</ram:TypeCode>") && buildCiiXml(corrView).includes("<ram:DuePayableAmount>0.00</ram:DuePayableAmount>"));
  check("xml: escapes", buildCiiXml({ ...deView, items: [{ description: "A & B <x>", qty: 1, unitPrice: 1, lineTotal: 1 }] }).includes("A &amp; B &lt;x&gt;"));
  const cb = await renderInvoicePdf(corrView);
  fs.writeFileSync(path.join(outDir, "sample-correction.pdf"), cb);
  check("correction pdf", cb.length > 5000);
  const qb = await renderInvoicePdf({ ...usView, number: "BBS-Q-2026-001" }, { docType: "QUOTE", validUntil: "2026-12-02", schedule: [{ label: "Deposit at signing", percent: 50 }, { label: "On completion", percent: 50 }], acceptUrl: "https://app.blokblokstudio.com/q/sampletoken" });
  fs.writeFileSync(path.join(outDir, "sample-quote.pdf"), qb);
  check("quote pdf", qb.length > 5000);
  for (const [name, v] of [["sample-de.pdf", deView], ["sample-us.pdf", usView], ["sample-de-2027-paid.pdf", de27View]] as const) {
    const bytes = await renderInvoicePdf(v);
    fs.writeFileSync(path.join(outDir, name), bytes);
    check(`pdf ${name}`, bytes.length > 5000, bytes.length);
  }
  const st: StatementView = {
    id: "s", number: "BBS-PS-2026-001", payoutId: "p", issueDate: "2026-12-05", periodFrom: "2026-11-12", periodTo: "2026-11-28", currency: "USD",
    partner: { name: "MBMedSolutions", legalName: "MBMedSolutions LLC", contactName: "Eric Mbualungu", email: "eric@example.test", addressLines: ["123 Main St", "Richmond, VA 23220", "USA"], country: "US", taxId: "12-3456789" },
    seller: { sellerName: seller.sellerName, contactName: seller.contactName, email: seller.email, website: seller.website, addressLines: seller.addressLines, steuernummer: seller.steuernummer, ustIdNr: "" },
    lines: [
      { description: "Project commission (handoff) on $6,500", client: "Smile Dental", kind: "PROJECT", eventAt: "2026-11-12T00:00:00Z", basisAmount: 6500, rate: 9, amount: 585 },
      { description: "Plan commission on $1,200 — Growth plan", client: "Smile Dental", kind: "PLAN", eventAt: "2026-11-20T00:00:00Z", basisAmount: 1200, rate: 15, amount: 180 },
      { description: "Refund clawback: Brand guide", client: "Oak Family Practice", kind: "BRAND_GUIDE", eventAt: "2026-11-28T00:00:00Z", basisAmount: 1000, rate: 5, amount: -50 },
    ],
    gross: 765, clawbacks: -50, net: 715, vatScheme: "DRITTLAND", vatRate: 0, vatAmount: 0,
    vatNotes: statementVat({ country: "US", chargesVat: false }).notes, total: 715, stripeTransferId: "tr_test_123", wiseTransferId: null, contentHash: "a".repeat(64), createdAt: new Date().toISOString(),
  };
  const sb = await renderStatementPdf(st);
  fs.writeFileSync(path.join(outDir, "sample-partner-statement.pdf"), sb);
  check("statement pdf", sb.length > 5000);
  console.log(`\n${pass} passed, ${fail} failed. PDFs in ${outDir}`);
  process.exit(fail ? 1 : 0);
})();
