/**
 * The client's legal details as they appear in contracts.
 *
 * The onboarding form collects them (every field required), the contract
 * builder refuses to draft until they are complete, and every contract body
 * carries them in a CLIENT DETAILS block right after the opening paragraph.
 */

import { detectCountry } from "@/lib/invoicing/country-detect";

export const CLIENT_PARTY_SELECT = {
  id: true,
  name: true,
  email: true,
  company: true,
  companyAddress: true,
  companyCity: true,
  companyState: true,
  companyZip: true,
  companyCountry: true,
  taxId: true,
  noTaxId: true,
  onboardedAt: true,
} as const;

export interface ClientParty {
  name: string;
  email: string | null;
  company: string | null;
  companyAddress: string | null;
  companyCity: string | null;
  companyState: string | null;
  companyZip: string | null;
  companyCountry: string | null;
  taxId: string | null;
  noTaxId: boolean;
}

/** Countries whose addresses need a state / province / region line. */
export const STATE_REQUIRED_COUNTRIES = ["US", "CA", "AU", "MX", "BR", "IN"];

/**
 * ISO code for whatever is saved: "DE", "uk" (the old form offered it; ISO
 * says GB), or older free text like "Deutschland" / "USA". Null when it
 * cannot tell, so the contract screen asks for it instead of guessing.
 */
export function normalizeCountry(value: string | null | undefined): string | null {
  const raw = (value || "").trim();
  if (!raw) return null;
  if (/^[A-Za-z]{2}$/.test(raw)) {
    const c = raw.toUpperCase();
    return c === "UK" ? "GB" : c;
  }
  const byName = countryOptions().find((o) => o.name.toLowerCase() === raw.toLowerCase());
  if (byName) return byName.code;
  return detectCountry({ companyCountry: raw })?.country || null;
}

const has = (v: string | null | undefined) => !!v && v.trim().length > 0;

/** Labels of what is still missing. Empty list = ready for a contract. */
export function missingPartyDetails(c: ClientParty): string[] {
  const missing: string[] = [];
  const country = normalizeCountry(c.companyCountry);
  if (!has(c.name)) missing.push("Contact name");
  if (!has(c.email)) missing.push("Email");
  if (!has(c.company)) missing.push("Legal / company name");
  if (!has(c.companyAddress)) missing.push("Street address");
  if (!has(c.companyCity)) missing.push("City");
  if (!has(c.companyZip)) missing.push("Postal code");
  if (!country) missing.push("Country");
  if (country && STATE_REQUIRED_COUNTRIES.includes(country) && !has(c.companyState)) missing.push("State / region");
  if (!has(c.taxId) && !c.noTaxId) missing.push("VAT / tax ID (or confirm they have none)");
  return missing;
}

function countryName(code: string): string {
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(code) || code;
  } catch {
    return code;
  }
}

/** One-line postal address in the usual order for the country. */
export function partyAddressLine(c: ClientParty): string {
  const country = normalizeCountry(c.companyCountry);
  const street = (c.companyAddress || "").trim();
  const city = (c.companyCity || "").trim();
  const zip = (c.companyZip || "").trim();
  const state = (c.companyState || "").trim();
  // US style puts the ZIP after the state; most of Europe puts the postal code before the city
  const locality =
    country && ["US", "CA", "AU"].includes(country)
      ? [city, [state, zip].filter(Boolean).join(" ")].filter(Boolean).join(", ")
      : [[zip, city].filter(Boolean).join(" "), state].filter(Boolean).join(", ");
  return [street, locality, country ? countryName(country) : ""].filter(Boolean).join(", ");
}

/** The block every contract carries. Plain text, no em dashes. */
export function clientPartyBlock(c: ClientParty): string {
  const legal = (c.company || "").trim() || c.name.trim();
  const lines = ["CLIENT DETAILS", `Legal name: ${legal}`];
  if (legal.toLowerCase() !== c.name.trim().toLowerCase()) lines.push(`Represented by: ${c.name.trim()}`);
  const address = partyAddressLine(c);
  if (address) lines.push(`Address: ${address}`);
  if (has(c.taxId)) lines.push(`VAT / tax ID: ${c.taxId!.trim()}`);
  else if (c.noTaxId) lines.push("VAT / tax ID: none (confirmed by the Client)");
  if (has(c.email)) lines.push(`Email: ${c.email!.trim()}`);
  return lines.join("\n");
}

/**
 * Put the block right after the paragraph that names the Client. Falls back to
 * just under the title when no paragraph says ("Client").
 */
export function insertClientPartyBlock(body: string, block: string): string {
  if (!block || body.includes("CLIENT DETAILS\nLegal name:")) return body;
  const at = body.indexOf('("Client")');
  if (at !== -1) {
    const end = body.indexOf("\n\n", at);
    if (end !== -1) return `${body.slice(0, end)}\n\n${block}${body.slice(end)}`;
    return `${body}\n\n${block}`;
  }
  const firstBreak = body.indexOf("\n\n");
  if (firstBreak === -1) return `${body}\n\n${block}`;
  return `${body.slice(0, firstBreak)}\n\n${block}${body.slice(firstBreak)}`;
}

/**
 * After AI drafting: the exact block must survive. If the model rewrote or
 * dropped it, take its version out and put the exact one back.
 */
export function ensureClientPartyBlock(body: string, block: string): string {
  if (!block || body.includes(block)) return body;
  const stripped = body.replace(/(^|\n\n)CLIENT DETAILS\n[\s\S]*?(?=\n\n|$)/, "$1").replace(/\n{3,}/g, "\n\n");
  return insertClientPartyBlock(stripped, block);
}

/** Every ISO 3166-1 alpha-2 country, so no client is left without their country. */
const ISO_COUNTRIES =
  "AD AE AF AG AI AL AM AO AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GT GU GW GY HK HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG US UY UZ VA VC VE VG VI VN VU WF WS XK YE YT ZA ZM ZW".split(" ");

/** [code, English name] sorted by name. */
export function countryOptions(): Array<{ code: string; name: string }> {
  return ISO_COUNTRIES.map((code) => ({ code, name: code === "XK" ? "Kosovo" : countryName(code) })).sort((a, b) =>
    a.name.localeCompare(b.name)
  );
}
