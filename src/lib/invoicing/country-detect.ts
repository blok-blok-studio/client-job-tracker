/**
 * Works out a client's country from whatever is on their record, strongest
 * clue first, and says which clue it used so the owner can see why. Pure,
 * so it is safe on the client and in tests.
 */

export interface CountryClues {
  country?: string | null;
  companyCountry?: string | null;
  companyState?: string | null;
  companyCity?: string | null;
  companyAddress?: string | null;
  companyZip?: string | null;
  taxId?: string | null;
  phone?: string | null;
  timezone?: string | null;
  email?: string | null;
}

export interface CountryGuess {
  country: string;
  /** Plain words, e.g. "phone number +49" */
  source: string;
  /** Saved on the client (vs worked out from clues) */
  onFile: boolean;
}

const WORDS: Array<[RegExp, string]> = [
  [/\b(deutschland|germany|berlin|münchen|munich|hamburg|köln|cologne|frankfurt|stuttgart|düsseldorf|leipzig|dresden)\b/i, "DE"],
  [/\b(usa|u\.s\.a\.|united states|america)\b/i, "US"],
  [/\b(österreich|austria|wien|vienna)\b/i, "AT"],
  [/\b(schweiz|switzerland|suisse|zürich|zurich|geneva|genf)\b/i, "CH"],
  [/\b(nederland|netherlands|holland|amsterdam)\b/i, "NL"],
  [/\b(belgium|belgique|belgien|brussels|brüssel)\b/i, "BE"],
  [/\b(france|frankreich|paris)\b/i, "FR"],
  [/\b(españa|spain|spanien|madrid|barcelona)\b/i, "ES"],
  [/\b(italia|italy|italien|milan|rome)\b/i, "IT"],
  [/\b(portugal|lisbon|lisboa)\b/i, "PT"],
  [/\b(ireland|irland|dublin)\b/i, "IE"],
  [/\b(poland|polska|polen|warsaw)\b/i, "PL"],
  [/\b(sweden|sverige|schweden|stockholm)\b/i, "SE"],
  [/\b(denmark|danmark|dänemark|copenhagen)\b/i, "DK"],
  [/\b(norway|norge|norwegen|oslo)\b/i, "NO"],
  [/\b(finland|suomi|finnland|helsinki)\b/i, "FI"],
  [/\b(united kingdom|england|scotland|wales|uk|great britain|london)\b/i, "GB"],
  [/\b(canada|kanada|toronto|vancouver|montreal)\b/i, "CA"],
  [/\b(mexico|méxico)\b/i, "MX"],
  [/\b(china|prc|beijing|shanghai|shenzhen|guangzhou)\b/i, "CN"],
  [/\b(hong kong)\b/i, "HK"],
  [/\b(philippines|pilipinas|manila|cebu)\b/i, "PH"],
  [/\b(singapore)\b/i, "SG"],
  [/\b(japan|tokyo)\b/i, "JP"],
  [/\b(india|mumbai|delhi|bangalore)\b/i, "IN"],
  [/\b(australia|sydney|melbourne)\b/i, "AU"],
  [/\b(new zealand|auckland)\b/i, "NZ"],
  [/\b(dubai|abu dhabi|united arab emirates|uae)\b/i, "AE"],
  [/\b(israel|tel aviv)\b/i, "IL"],
  [/\b(brazil|brasil|são paulo|sao paulo)\b/i, "BR"],
  [/\b(south africa|cape town|johannesburg)\b/i, "ZA"],
  [/\b(turkey|türkiye|istanbul)\b/i, "TR"],
];

const US_STATES = new Set("AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC".split(" "));
const US_STATE_NAMES = /\b(alabama|alaska|arizona|arkansas|california|colorado|connecticut|delaware|florida|georgia|hawaii|idaho|illinois|indiana|iowa|kansas|kentucky|louisiana|maine|maryland|massachusetts|michigan|minnesota|mississippi|missouri|montana|nebraska|nevada|new hampshire|new jersey|new mexico|new york|north carolina|north dakota|ohio|oklahoma|oregon|pennsylvania|rhode island|south carolina|south dakota|tennessee|texas|utah|vermont|virginia|washington|west virginia|wisconsin|wyoming)\b/i;
const CA_PROVINCES = new Set("AB BC MB NB NL NS NT NU ON PE QC SK YT".split(" "));

// Longest prefixes first so +852 wins over +85, +353 over +35, etc.
const PHONE: Array<[string, string]> = ([
  ["1", "US"], ["49", "DE"], ["43", "AT"], ["41", "CH"], ["44", "GB"], ["33", "FR"], ["31", "NL"], ["32", "BE"], ["34", "ES"], ["39", "IT"],
  ["351", "PT"], ["353", "IE"], ["352", "LU"], ["45", "DK"], ["46", "SE"], ["47", "NO"], ["358", "FI"], ["48", "PL"], ["420", "CZ"], ["36", "HU"],
  ["30", "GR"], ["40", "RO"], ["359", "BG"], ["385", "HR"], ["386", "SI"], ["421", "SK"], ["372", "EE"], ["371", "LV"], ["370", "LT"], ["356", "MT"], ["357", "CY"],
  ["86", "CN"], ["852", "HK"], ["853", "MO"], ["886", "TW"], ["63", "PH"], ["65", "SG"], ["60", "MY"], ["66", "TH"], ["84", "VN"], ["62", "ID"],
  ["81", "JP"], ["82", "KR"], ["91", "IN"], ["971", "AE"], ["972", "IL"], ["90", "TR"], ["61", "AU"], ["64", "NZ"], ["52", "MX"], ["55", "BR"], ["27", "ZA"],
] as Array<[string, string]>).sort((a, b) => b[0].length - a[0].length);

const TLD: Record<string, string> = {
  de: "DE", at: "AT", ch: "CH", fr: "FR", nl: "NL", be: "BE", es: "ES", it: "IT", pt: "PT", ie: "IE", pl: "PL", se: "SE", dk: "DK", no: "NO", fi: "FI",
  cz: "CZ", hu: "HU", gr: "GR", ro: "RO", uk: "GB", cn: "CN", hk: "HK", ph: "PH", sg: "SG", jp: "JP", kr: "KR", in: "IN", au: "AU", nz: "NZ",
  mx: "MX", br: "BR", za: "ZA", tr: "TR", il: "IL", ae: "AE", ca: "CA", lu: "LU",
};

const TZ: Record<string, string> = {
  "Europe/Berlin": "DE", "Europe/Vienna": "AT", "Europe/Zurich": "CH", "Europe/London": "GB", "Europe/Paris": "FR", "Europe/Amsterdam": "NL",
  "Europe/Brussels": "BE", "Europe/Madrid": "ES", "Europe/Rome": "IT", "Europe/Lisbon": "PT", "Europe/Dublin": "IE", "Europe/Warsaw": "PL",
  "Europe/Stockholm": "SE", "Europe/Copenhagen": "DK", "Europe/Oslo": "NO", "Europe/Helsinki": "FI", "Europe/Prague": "CZ", "Europe/Budapest": "HU",
  "Europe/Athens": "GR", "Europe/Istanbul": "TR", "Asia/Shanghai": "CN", "Asia/Hong_Kong": "HK", "Asia/Manila": "PH", "Asia/Singapore": "SG",
  "Asia/Tokyo": "JP", "Asia/Seoul": "KR", "Asia/Kolkata": "IN", "Asia/Dubai": "AE", "Asia/Jerusalem": "IL", "Australia/Sydney": "AU",
  "Australia/Melbourne": "AU", "Pacific/Auckland": "NZ", "America/Toronto": "CA", "America/Vancouver": "CA", "America/Mexico_City": "MX",
  "America/Sao_Paulo": "BR", "Africa/Johannesburg": "ZA",
};

// EU VAT ids start with the country code (Greece uses EL)
const VAT_PREFIX = /^(AT|BE|BG|HR|CY|CZ|DK|EE|FI|FR|DE|EL|HU|IE|IT|LV|LT|LU|MT|NL|PL|PT|RO|SK|SI|ES|SE|GB|CH|NO)[0-9A-Z]{6,}$/;

const clean = (v: string | null | undefined) => (v || "").trim();

export function detectCountry(c: CountryClues): CountryGuess | null {
  const saved = clean(c.country).toUpperCase();
  if (/^[A-Z]{2}$/.test(saved)) return { country: saved, source: "saved on the client", onFile: true };

  const cc = clean(c.companyCountry);
  if (/^[A-Za-z]{2}$/.test(cc)) return { country: cc.toUpperCase() === "UK" ? "GB" : cc.toUpperCase(), source: "company country", onFile: false };
  for (const [re, code] of WORDS) if (cc && re.test(cc)) return { country: code, source: "company country", onFile: false };

  const tax = clean(c.taxId).toUpperCase().replace(/[\s.-]/g, "");
  const vat = tax.match(VAT_PREFIX);
  if (vat) return { country: vat[1] === "EL" ? "GR" : vat[1], source: "VAT ID", onFile: false };
  if (/^\d{2}-?\d{7}$/.test(clean(c.taxId))) return { country: "US", source: "US tax ID (EIN)", onFile: false };

  const state = clean(c.companyState).toUpperCase();
  if (US_STATES.has(state) || US_STATE_NAMES.test(clean(c.companyState))) return { country: "US", source: "US state in the address", onFile: false };
  if (CA_PROVINCES.has(state)) return { country: "CA", source: "Canadian province in the address", onFile: false };

  const address = [c.companyAddress, c.companyCity, c.companyState].map(clean).filter(Boolean).join(" ");
  for (const [re, code] of WORDS) if (address && re.test(address)) return { country: code, source: "address", onFile: false };
  if (US_STATE_NAMES.test(address)) return { country: "US", source: "address", onFile: false };

  const digits = clean(c.phone).replace(/[^\d+]/g, "").replace(/^00/, "+");
  if (digits.startsWith("+")) {
    const num = digits.slice(1);
    for (const [prefix, code] of PHONE) {
      if (num.startsWith(prefix)) {
        // +1 is shared by the US and Canada; the time zone settles it
        if (prefix === "1" && /^America\/(Toronto|Vancouver|Edmonton|Winnipeg|Halifax|Regina|St_Johns|Montreal)$/.test(clean(c.timezone))) return { country: "CA", source: "phone number +1 and Canadian time zone", onFile: false };
        return { country: code, source: `phone number +${prefix}`, onFile: false };
      }
    }
  }

  const tz = clean(c.timezone);
  if (TZ[tz]) return { country: TZ[tz], source: `time zone ${tz}`, onFile: false };
  if (/^(America\/(New_York|Chicago|Denver|Los_Angeles|Phoenix|Anchorage|Detroit|Indiana\/.+|Kentucky\/.+|Boise)|Pacific\/Honolulu)$/.test(tz)) return { country: "US", source: `time zone ${tz}`, onFile: false };

  const tld = clean(c.email).toLowerCase().match(/\.([a-z]{2})$/)?.[1];
  if (tld && TLD[tld]) return { country: TLD[tld], source: `email ending .${tld}`, onFile: false };
  if (/\.co\.uk$/.test(clean(c.email).toLowerCase())) return { country: "GB", source: "email ending .co.uk", onFile: false };

  return null;
}
