// Shipped tax-compliance catalog. This file is the "reset to source" copy — the DB
// TaxObligation rows are what the reminder engine actually reads, and Chase can edit
// them on /compliance. Researched August 2026; every entry carries its sources.
//
// INFORMATIONAL ONLY — this is a tracking/reminder tool, not tax advice. Entries
// flagged verifyWithAdvisor should be confirmed with the CPA / Steuerberater.

export interface DueRule {
  month?: number; // 1-12; omitted = every month (MONTHLY frequency)
  day: number; // 1-31
  year?: number; // only for ONE_TIME rules
}

export interface ObligationSeed {
  key: string;
  country: string; // ISO 3166-1 alpha-2
  appliesTo: "SELF" | "CONTRACTOR" | "CLIENT";
  profileKey?: "us-llc" | "de-freelancer";
  name: string;
  formName?: string;
  description: string;
  frequency: "ANNUAL" | "QUARTERLY" | "MONTHLY" | "ONE_TIME" | "WATCH";
  dueRules: DueRule[]; // empty for WATCH
  earliestOpen?: { month: number; day: number };
  sourceUrls: string[];
  verifyWithAdvisor?: boolean;
  enabled?: boolean; // default true
}

export interface ProfileSeed {
  key: "us-llc" | "de-freelancer";
  country: string;
  label: string;
  entityType: string;
  flags: Record<string, unknown>;
}

export const PROFILE_SEEDS: ProfileSeed[] = [
  {
    key: "us-llc",
    country: "US",
    label: "BlokBlok LLC (Texas)",
    entityType: "llc",
    flags: { state: "TX", taxation: "sole-proprietor" },
  },
  {
    key: "de-freelancer",
    country: "DE",
    label: "Freelancer (Germany)",
    entityType: "freelancer",
    flags: { kleinunternehmer: true, steuerberater: true },
  },
];

export const OBLIGATION_SEEDS: ObligationSeed[] = [
  // ---------- US — own filings (Texas LLC, taxed as sole proprietor) ----------
  {
    key: "us-1040-schedule-c",
    country: "US",
    appliesTo: "SELF",
    profileKey: "us-llc",
    name: "Federal income tax return",
    formName: "Form 1040 + Schedule C",
    description:
      "Annual federal return; the single-member LLC reports on Schedule C. Due April 15 (weekend/holiday shifts apply). An extension (Form 4868) moves filing to October 15 but not payment. IRS e-file typically opens in late January — the earliest-submission reminder fires then.",
    frequency: "ANNUAL",
    dueRules: [{ month: 4, day: 15 }],
    earliestOpen: { month: 1, day: 27 },
    sourceUrls: ["https://www.irs.gov/filing/individuals/when-to-file"],
  },
  {
    key: "us-1040-es",
    country: "US",
    appliesTo: "SELF",
    profileKey: "us-llc",
    name: "Quarterly estimated tax payments",
    formName: "Form 1040-ES",
    description:
      "Estimated federal income + self-employment tax, paid quarterly: April 15, June 15, September 15, and January 15 of the following year. The January payment can be skipped if the annual return is filed and fully paid by January 31.",
    frequency: "QUARTERLY",
    dueRules: [
      { month: 4, day: 15 },
      { month: 6, day: 15 },
      { month: 9, day: 15 },
      { month: 1, day: 15 },
    ],
    sourceUrls: [
      "https://www.irs.gov/pub/irs-pdf/f1040es.pdf",
      "https://www.kiplinger.com/taxes/tax-deadline/602538/when-estimated-tax-payments-due",
    ],
  },
  {
    key: "us-tx-franchise",
    country: "US",
    appliesTo: "SELF",
    profileKey: "us-llc",
    name: "Texas Franchise Tax / Public Information Report",
    formName: "Texas Comptroller Franchise Report + PIR",
    description:
      "Annual Texas franchise filing due May 15. Since report year 2024 entities under the no-tax-due revenue threshold (about $2.47M) no longer file a No Tax Due Report but still must file the Public Information Report. Confirm the current threshold and which forms apply with the CPA.",
    frequency: "ANNUAL",
    dueRules: [{ month: 5, day: 15 }],
    sourceUrls: ["https://comptroller.texas.gov/taxes/franchise/"],
    verifyWithAdvisor: true,
  },
  {
    key: "us-1099-nec",
    country: "US",
    appliesTo: "SELF",
    profileKey: "us-llc",
    name: "1099-NEC filing for contractors paid",
    formName: "Form 1099-NEC",
    description:
      "File 1099-NEC for each US contractor paid $2,000 or more during the year (threshold raised from $600 by OBBBA for payments after Dec 31, 2025). One deadline for both the IRS copy and the recipient copy: January 31 (shifts to the next business day on weekends — Feb 1, 2027 for tax year 2026). E-filing is required at 10+ information returns. Not required for non-US contractors performing services abroad (collect W-8BEN instead).",
    frequency: "ANNUAL",
    dueRules: [{ month: 1, day: 31 }],
    sourceUrls: [
      "https://www.irs.gov/forms-pubs/about-form-1099-nec",
      "https://www.tax1099.com/blog/1099-nec-filing-deadline-2026/",
    ],
  },

  // ---------- US — contractor paperwork (people we pay) ----------
  {
    key: "us-w9-collection",
    country: "US",
    appliesTo: "CONTRACTOR",
    profileKey: "us-llc",
    name: "W-9 on file before first payment (US contractors)",
    formName: "Form W-9",
    description:
      "Every US contractor must have a completed W-9 on file before their first payment — it supplies the TIN needed for the 1099-NEC. No fixed deadline; the document chaser flags contractors whose W-9 is requested but not received.",
    frequency: "WATCH",
    dueRules: [],
    sourceUrls: ["https://www.irs.gov/forms-pubs/about-form-w-9"],
  },
  {
    key: "us-w8ben-collection",
    country: "US",
    appliesTo: "CONTRACTOR",
    profileKey: "us-llc",
    name: "W-8BEN on file for non-US contractors",
    formName: "Form W-8BEN / W-8BEN-E",
    description:
      "Non-US contractors (individuals: W-8BEN; entities: W-8BEN-E) must certify foreign status before payment — without a valid form the IRS requires 30% withholding. Forms expire after three calendar years; the document chaser warns before expiry. No 1099-NEC is needed for non-US persons working outside the US.",
    frequency: "WATCH",
    dueRules: [],
    sourceUrls: ["https://www.irs.gov/forms-pubs/about-form-w-8-ben"],
  },

  // ---------- US — client paperwork (people who pay us) ----------
  {
    key: "us-own-w9-outbound",
    country: "US",
    appliesTo: "CLIENT",
    profileKey: "us-llc",
    name: "Provide BlokBlok's W-9 to US business clients",
    formName: "Form W-9 (ours)",
    description:
      "US business clients may need BlokBlok's W-9 to issue their own 1099s for payments to us. Keep a current signed W-9 ready and send it on request or at onboarding.",
    frequency: "WATCH",
    dueRules: [],
    sourceUrls: ["https://www.irs.gov/forms-pubs/about-form-w-9"],
  },
  {
    key: "us-year-end-summary",
    country: "US",
    appliesTo: "CLIENT",
    profileKey: "us-llc",
    name: "Year-end payment summaries for clients",
    description:
      "Send each client a summary of what they paid during the prior year for their bookkeeping (the data already lives in Stripe / the Money page). Aim to have these out by the end of January.",
    frequency: "ANNUAL",
    dueRules: [{ month: 1, day: 31 }],
    sourceUrls: [],
  },

  // ---------- DE — own filings (freelancer, Kleinunternehmer, via Steuerberater) ----------
  {
    key: "de-est-steuerberater",
    country: "DE",
    appliesTo: "SELF",
    profileKey: "de-freelancer",
    name: "Einkommensteuererklärung (German income tax return)",
    formName: "Einkommensteuererklärung + Anlage S/EÜR",
    description:
      "With a Steuerberater the return for tax year N is due at the end of February of year N+2 (the 2025 return is due Feb 28, 2027). Filing without an advisor would move it to July 31 of year N+1. The Steuerberater handles the filing — this reminder is for delivering records to them well ahead of the deadline.",
    frequency: "ANNUAL",
    dueRules: [{ month: 2, day: 28 }],
    sourceUrls: [
      "https://www.freelancermap.com/blog/tax-deadlines-due-dates-freelancer-germany/",
      "https://lifetimesdeutschland.de/blog/income-tax-1/german-tax-return-deadline-2026-when-do-you-have-to-file",
    ],
    verifyWithAdvisor: true,
  },
  {
    key: "de-kleinunternehmer-watch",
    country: "DE",
    appliesTo: "SELF",
    profileKey: "de-freelancer",
    name: "Kleinunternehmer revenue-limit check",
    description:
      "Quarterly check of German revenue against the Kleinunternehmer limits: EUR 25,000 total in the PRIOR year, and a HARD EUR 100,000 cap in the CURRENT year — since 2025 the exemption ends immediately with the transaction that crosses 100k (not at year end). Crossing either limit means charging VAT and filing VAT returns; talk to the Steuerberater before that happens.",
    frequency: "QUARTERLY",
    dueRules: [
      { month: 3, day: 31 },
      { month: 6, day: 30 },
      { month: 9, day: 30 },
      { month: 12, day: 31 },
    ],
    sourceUrls: [
      "https://www.finanzamt.nrw.de/steuerinfos/unternehmen/umsatzsteuer/kleinunternehmerinnen-und-kleinunternehmer",
      "https://taxfix.de/ratgeber/selbststaendige/kleinunternehmergrenze/",
    ],
    verifyWithAdvisor: true,
  },
  {
    key: "de-ust-voranmeldung",
    country: "DE",
    appliesTo: "SELF",
    profileKey: "de-freelancer",
    name: "Umsatzsteuer-Voranmeldung (VAT advance return)",
    description:
      "Monthly/quarterly VAT advance returns due the 10th of the following month. NOT required while the Kleinunternehmerregelung applies (§19 UStG excludes the §18(1)-(4) duties). Kept disabled — enable if Kleinunternehmer status ends.",
    frequency: "MONTHLY",
    dueRules: [{ day: 10 }],
    sourceUrls: ["https://www.freelancermap.com/blog/tax-deadlines-due-dates-freelancer-germany/"],
    verifyWithAdvisor: true,
    enabled: false,
  },
  {
    key: "de-est-vorauszahlungen",
    country: "DE",
    appliesTo: "SELF",
    profileKey: "de-freelancer",
    name: "Einkommensteuer-Vorauszahlungen (income tax prepayments)",
    description:
      "Quarterly income tax prepayments due March 10, June 10, September 10, and December 10 — only if the Finanzamt has set prepayments in a Vorauszahlungsbescheid. Kept disabled until that happens.",
    frequency: "QUARTERLY",
    dueRules: [
      { month: 3, day: 10 },
      { month: 6, day: 10 },
      { month: 9, day: 10 },
      { month: 12, day: 10 },
    ],
    sourceUrls: ["https://www.freelancermap.com/blog/tax-deadlines-due-dates-freelancer-germany/"],
    enabled: false,
  },

  // ---------- DE — client paperwork ----------
  {
    key: "de-invoice-vat-notes",
    country: "DE",
    appliesTo: "CLIENT",
    profileKey: "de-freelancer",
    name: "Correct VAT wording on invoices to German clients",
    description:
      "Invoices to German business clients need the right VAT treatment: from the German freelancer profile, the Kleinunternehmer note (no VAT charged per §19 UStG); from the US LLC, typically reverse-charge wording so the German client self-accounts for VAT. Confirm the exact wording per client with the Steuerberater.",
    frequency: "WATCH",
    dueRules: [],
    sourceUrls: ["https://www.finanzamt.nrw.de/steuerinfos/unternehmen/umsatzsteuer/kleinunternehmerinnen-und-kleinunternehmer"],
    verifyWithAdvisor: true,
  },
  {
    key: "de-einvoicing-2027",
    country: "DE",
    appliesTo: "CLIENT",
    profileKey: "de-freelancer",
    name: "German e-invoicing mandate — stage 1",
    formName: "XRechnung / ZUGFeRD (EN 16931)",
    description:
      "Since Jan 2025 German businesses must be able to RECEIVE structured e-invoices. From Jan 1, 2027, businesses with prior-year turnover above EUR 800k must ISSUE them for domestic B2B sales. A plain PDF does not qualify — formats must follow EN 16931 (XRechnung or ZUGFeRD). Check whether German clients expect e-invoices from us before this date.",
    frequency: "ONE_TIME",
    dueRules: [{ month: 1, day: 1, year: 2027 }],
    sourceUrls: [
      "https://www.cleartax.com/de/en/b2b-e-invoicing-germany",
      "https://edicomgroup.com/blog/germany-b2b-electronic-invoice",
    ],
    verifyWithAdvisor: true,
  },
  {
    key: "de-einvoicing-2028",
    country: "DE",
    appliesTo: "CLIENT",
    profileKey: "de-freelancer",
    name: "German e-invoicing mandate — stage 2 (everyone)",
    formName: "XRechnung / ZUGFeRD (EN 16931)",
    description:
      "From Jan 1, 2028 ALL German businesses must issue structured e-invoices for domestic B2B sales, regardless of turnover (small-value invoices up to EUR 250 exempt). Ensure invoicing to German business clients can produce EN 16931 formats by then.",
    frequency: "ONE_TIME",
    dueRules: [{ month: 1, day: 1, year: 2028 }],
    sourceUrls: ["https://www.cleartax.com/de/en/b2b-e-invoicing-germany"],
    verifyWithAdvisor: true,
  },

  // ---------- DE — contractor paperwork ----------
  {
    key: "de-contractor-rechnung",
    country: "DE",
    appliesTo: "CONTRACTOR",
    profileKey: "de-freelancer",
    name: "Compliant invoices from German contractors",
    formName: "Rechnung (Pflichtangaben)",
    description:
      "German contractors' invoices should carry the required German invoice details — their tax number or USt-IdNr, or their own Kleinunternehmer note if they charge no VAT. Keep their invoices complete; confirm edge cases with the Steuerberater.",
    frequency: "WATCH",
    dueRules: [],
    sourceUrls: ["https://www.freelancermap.com/blog/tax-deadlines-due-dates-freelancer-germany/"],
    verifyWithAdvisor: true,
  },
];

// Which inbound/outbound documents a person needs, by their country + relationship.
// Used when a contractor/client gets a country to auto-create TaxDocument rows.
export function requiredDocTypes(opts: {
  kind: "contractor" | "client";
  country: string;
}): { type: string; direction: "INBOUND" | "OUTBOUND"; note: string }[] {
  const { kind, country } = opts;
  if (kind === "contractor") {
    if (country === "US") {
      return [
        {
          type: "W9",
          direction: "INBOUND",
          note: "Completed W-9 required before first payment (feeds the 1099-NEC).",
        },
      ];
    }
    // Any non-US contractor paid by the US LLC
    return [
      {
        type: "W8BEN",
        direction: "INBOUND",
        note: "W-8BEN (individual) or W-8BEN-E (entity) required before first payment; valid 3 years.",
      },
    ];
  }
  // Clients
  if (country === "US") {
    return [
      {
        type: "W9_OURS",
        direction: "OUTBOUND",
        note: "Provide BlokBlok's W-9 if the client needs it for their 1099 filings.",
      },
      {
        type: "PAYMENT_SUMMARY",
        direction: "OUTBOUND",
        note: "Year-end payment summary for the client's bookkeeping (data in Stripe/Money).",
      },
    ];
  }
  if (country === "DE") {
    return [
      {
        type: "RECHNUNG_INFO",
        direction: "OUTBOUND",
        note: "Invoices need German-compatible VAT wording (Kleinunternehmer §19 note or reverse charge). E-invoicing mandate phases in 2027-2028.",
      },
    ];
  }
  return [];
}
