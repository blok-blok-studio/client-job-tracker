/**
 * Pure-function checks for the studio invoicing module + sample PDFs.
 *   npx tsx scripts/test-invoicing.ts [outDir]
 * No database, no network.
 */
import fs from "fs";
import path from "path";
import { computeTotals, formatMoneyPdf, formatMoney } from "../src/lib/invoicing/money";
import { decideVat, templateForCountry, guessCountry, defaultsForTemplate } from "../src/lib/invoicing/vat";
import { buildEpcPayload } from "../src/lib/invoicing/epc-qr";
import { formatInvoiceNumber, nextSequenceFor } from "../src/lib/invoicing/numbering";
import { isValidIban, normalizeInvoiceSettings, missingBankFields, DEFAULT_INVOICE_SETTINGS, isPlausibleVatId, settingsWarnings } from "../src/lib/invoicing/settings-core";
import { renderInvoicePdf } from "../src/lib/invoicing/invoice-pdf";
import type { InvoiceView } from "../src/lib/invoicing/types";

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

check("vat id DE ok", isPlausibleVatId("DE 123 456 789"));
check("vat id DE bad", !isPlausibleVatId("DE12345678"));
check("vat id AT ok", isPlausibleVatId("ATU12345678"));
check("ustIdNr normalised", normalizeInvoiceSettings({ ustIdNr: "de 123456789" }).ustIdNr === "DE123456789");
check("bad ustIdNr warns", settingsWarnings({ ...DEFAULT_INVOICE_SETTINGS, ustIdNr: "DE1" }).some((w) => w.includes("USt-IdNr")));
check("wise link must be wise.com", normalizeInvoiceSettings({ wisePayLink: "https://evil.example/pay" }).wisePayLink === "");

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
  id: "x", token: "sampletoken", number: "BBS-2026-007", status: "ISSUED", vatRate: 0,
  issueDate: "2026-11-02", serviceDateFrom: "2026-10-01", serviceDateTo: "2026-10-31", dueDate: "2026-11-16", dueDays: 14,
  seller, items: computeTotals([
    { description: "Website redesign: 5 pages, responsive, CMS handover and launch support", qty: 1, unitPrice: 5000 },
    { description: "Social media videos (October)", qty: 4, unitPrice: 200 },
    { description: "Additional development hours", qty: 2.5, unitPrice: 90 },
  ], 0).items,
  subtotal: 6025, vatAmount: 0, total: 6025, paymentMethod: "BANK", paymentUrl: null,
  notes: "Zahlbar innerhalb von 14 Tagen ohne Abzug.", sentAt: null, sentTo: null, paidAt: null, paidMethod: null, voidedAt: null, voidReason: null,
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
  for (const [name, v] of [["sample-de.pdf", deView], ["sample-us.pdf", usView], ["sample-de-2027-paid.pdf", de27View]] as const) {
    const bytes = await renderInvoicePdf(v);
    fs.writeFileSync(path.join(outDir, name), bytes);
    check(`pdf ${name}`, bytes.length > 5000, bytes.length);
  }
  console.log(`\n${pass} passed, ${fail} failed. PDFs in ${outDir}`);
  process.exit(fail ? 1 : 0);
})();
