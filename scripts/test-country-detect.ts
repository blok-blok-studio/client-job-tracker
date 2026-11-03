// Country detection from client clues: npx tsx scripts/test-country-detect.ts
import { detectCountry } from "../src/lib/invoicing/country-detect";
const cases: Array<[string, Parameters<typeof detectCountry>[0], string | null]> = [
  ["saved wins", { country: "DE", phone: "+1 555" }, "DE"],
  ["company country word", { companyCountry: "Deutschland" }, "DE"],
  ["company country UK", { companyCountry: "UK" }, "GB"],
  ["EU VAT id", { taxId: "ATU12345678" }, "AT"],
  ["Greek VAT EL", { taxId: "EL123456789" }, "GR"],
  ["EIN", { taxId: "33-1774265" }, "US"],
  ["US state code", { companyState: "TX" }, "US"],
  ["CA province", { companyState: "ON" }, "CA"],
  ["address city", { companyCity: "Berlin" }, "DE"],
  ["phone +49", { phone: "+49 30 1234567" }, "DE"],
  ["phone 0049", { phone: "0049 30 1234567" }, "DE"],
  ["phone +852 beats +85", { phone: "+852 1234 5678" }, "HK"],
  ["phone +86", { phone: "+86 138 0000 0000" }, "CN"],
  ["phone +1 Toronto", { phone: "+1 416 555", timezone: "America/Toronto" }, "CA"],
  ["phone +1", { phone: "+1 817 650 8455" }, "US"],
  ["tz Berlin", { timezone: "Europe/Berlin" }, "DE"],
  ["tz Chicago", { timezone: "America/Chicago" }, "US"],
  ["email .de", { email: "max@firma.de" }, "DE"],
  ["email .co.uk", { email: "a@b.co.uk" }, "GB"],
  ["email .com nothing", { email: "a@b.com" }, null],
  ["phone without + ignored", { phone: "030 1234567" }, null],
  ["empty", {}, null],
];
let f = 0;
for (const [n, c, want] of cases) { const got = detectCountry(c)?.country ?? null; if (got !== want) { f++; console.log("FAIL", n, got, "want", want); } }
console.log(`${cases.length - f}/${cases.length} ok`);
