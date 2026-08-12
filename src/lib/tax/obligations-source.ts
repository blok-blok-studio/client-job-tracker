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
      "File 1099-NEC for each US contractor paid $2,000 or more during the year (threshold raised from $600 by OBBBA for payments after Dec 31, 2025). One deadline for both the IRS copy and the recipient copy: January 31 (shifts to the next business day on weekends — Feb 1, 2027 for tax year 2026). E-filing is required at 10+ information returns. Not required for non-US contractors performing services abroad (collect W-8BEN instead). Payments made by credit card or PayPal-type processors are EXCLUDED — the processor reports those on 1099-K, so track how each contractor gets paid.",
    frequency: "ANNUAL",
    dueRules: [{ month: 1, day: 31 }],
    sourceUrls: [
      "https://www.irs.gov/forms-pubs/about-form-1099-nec",
      "https://www.tax1099.com/blog/1099-nec-filing-deadline-2026/",
    ],
  },

  {
    key: "us-fbar",
    country: "US",
    appliesTo: "SELF",
    profileKey: "us-llc",
    name: "FBAR — foreign bank account report",
    formName: "FinCEN Form 114",
    description:
      "Required if the combined value of all non-US financial accounts (including any German bank account) exceeded $10,000 at ANY point during the year. Filed with FinCEN separately from the tax return; due April 15 with an automatic extension to October 15. Penalties are severe: $16,500+ per non-willful violation, far worse if willful. The German freelance operation makes this very likely to apply.",
    frequency: "ANNUAL",
    dueRules: [{ month: 4, day: 15 }],
    sourceUrls: [
      "https://www.fincen.gov/report-foreign-bank-and-financial-accounts",
      "https://www.taxesforexpats.com/articles/fbar-fatca/a-detailed-look-at-the-foreign-bank-account-report-fbar-form.html",
    ],
    verifyWithAdvisor: true,
  },
  {
    key: "us-form-8938",
    country: "US",
    appliesTo: "SELF",
    profileKey: "us-llc",
    name: "FATCA foreign asset statement (with the 1040)",
    formName: "Form 8938",
    description:
      "Separate from the FBAR and filed WITH the federal return: required when foreign financial assets exceed the Form 8938 thresholds ($50,000+ for single filers living in the US; higher abroad). Check the threshold each year against German account balances — many people must file both 8938 and FBAR.",
    frequency: "WATCH",
    dueRules: [],
    sourceUrls: ["https://www.irs.gov/forms-pubs/about-form-8938"],
    verifyWithAdvisor: true,
  },
  {
    key: "us-tx-sales-tax-check",
    country: "US",
    appliesTo: "SELF",
    profileKey: "us-llc",
    name: "Texas sales tax on web services — permit and collection check",
    description:
      "IMPORTANT: Texas treats web design, development, and hosting as taxable 'data processing services' — 80% of the charge is taxable (20% exempt) at the local rate up to 8.25%. Selling web work to TEXAS clients (e.g. DFW plumbers) likely requires a Texas sales tax permit and collecting/remitting tax on those invoices. The definition was expanded again Oct 2025. Semi-annual check: confirm permit status and which client invoices need tax with the CPA. Out-of-state clients are generally not affected; multi-state clients can give an exemption certificate.",
    frequency: "ANNUAL",
    dueRules: [
      { month: 2, day: 15 },
      { month: 8, day: 15 },
    ],
    sourceUrls: [
      "https://comptroller.texas.gov/taxes/publications/94-127.php",
      "https://www.smoothfusion.com/texas-sales-tax",
      "https://www.grantthornton.com/insights/alerts/tax/2025/salt/p-t/tx-updates-data-processing-services-tax-rule-04-11",
    ],
    verifyWithAdvisor: true,
  },
  {
    key: "us-tx-sales-tax-filing",
    country: "US",
    appliesTo: "SELF",
    profileKey: "us-llc",
    name: "Texas sales tax return",
    description:
      "Once a Texas sales tax permit exists, returns are due the 20th of the month after each period (most small filers are quarterly: Jan 20, Apr 20, Jul 20, Oct 20). Disabled until the permit question above is settled — enable and adjust the cadence to match the Comptroller's assigned filing frequency.",
    frequency: "QUARTERLY",
    dueRules: [
      { month: 1, day: 20 },
      { month: 4, day: 20 },
      { month: 7, day: 20 },
      { month: 10, day: 20 },
    ],
    sourceUrls: ["https://comptroller.texas.gov/taxes/sales/"],
    verifyWithAdvisor: true,
    enabled: false,
  },
  {
    key: "us-boi-cta",
    country: "US",
    appliesTo: "SELF",
    profileKey: "us-llc",
    name: "Beneficial ownership (BOI) reporting — currently EXEMPT",
    formName: "FinCEN BOI",
    description:
      "Status checked Aug 2026: FinCEN's March 2025 interim final rule EXEMPTS all US-formed companies (including this LLC) from BOI reporting — only foreign companies registered in a US state still file. FinCEN intends to finalize the rule in 2026; if the final rule changes course, domestic reporting could return. Nothing to file today; keep an eye on the final rule.",
    frequency: "WATCH",
    dueRules: [],
    sourceUrls: [
      "https://www.fincen.gov/boi",
      "https://www.fincen.gov/news/news-releases/fincen-removes-beneficial-ownership-reporting-requirements-us-companies-and-us",
    ],
  },
  {
    key: "us-de-treaty-totalization",
    country: "US",
    appliesTo: "SELF",
    profileKey: "us-llc",
    name: "US-Germany double taxation + social security coordination",
    formName: "Form 1116 / certificate of coverage",
    description:
      "The US taxes citizens on WORLDWIDE income: German freelance earnings must appear on the 1040, with German income tax offset via the foreign tax credit (Form 1116) under the US-Germany treaty. Separately, the US-Germany totalization agreement decides WHERE self-employment/social contributions are owed — without a certificate of coverage the same income can be hit by US self-employment tax AND German contributions. This is the single most important structural question for the two-country setup: have the CPA and Steuerberater agree on the arrangement once, then it mostly runs itself.",
    frequency: "WATCH",
    dueRules: [],
    sourceUrls: [
      "https://www.irs.gov/individuals/international-taxpayers/foreign-tax-credit",
      "https://www.ssa.gov/international/Agreement_Pamphlets/germany.html",
    ],
    verifyWithAdvisor: true,
  },
  {
    key: "us-record-retention",
    country: "US",
    appliesTo: "SELF",
    profileKey: "us-llc",
    name: "US record retention windows",
    description:
      "Never purge early: W-9s — keep 3 years after the last year a 1099 was filed for that contractor. Employment/contractor tax records — 4 years minimum. Business returns and IRS correspondence — 7 years. Bank/credit card statements and cancelled checks — 7 years. The tracker's contractor invoices, hours entries, and audit trails are deliberately delete-proof; this entry documents why.",
    frequency: "WATCH",
    dueRules: [],
    sourceUrls: [
      "https://www.irs.gov/businesses/small-businesses-self-employed/employment-tax-recordkeeping",
      "https://www.taxinformationreporting.com/css-article/how-long-should-you-retain-forms-w-9",
    ],
  },

  // ---------- US — contractor paperwork (people we pay) ----------
  {
    key: "us-contractor-classification",
    country: "US",
    appliesTo: "CONTRACTOR",
    profileKey: "us-llc",
    name: "Contractor classification review (misclassification risk)",
    description:
      "Semi-annual check that contractors genuinely qualify as independent contractors, not employees. The DOL's 2026 proposed rule re-centers the economic reality test on two core factors: degree of CONTROL over the work, and the worker's opportunity for profit/loss from their own initiative and investment. Protective practices already built into this tracker: hours are self-reported (not scheduled or monitored), contractors invoice for their work, and a signed independent contractor agreement is required on file. Keep it that way — do not set contractors' schedules, provide their tools, or make them exclusive.",
    frequency: "ANNUAL",
    dueRules: [
      { month: 1, day: 15 },
      { month: 7, day: 15 },
    ],
    sourceUrls: [
      "https://www.dol.gov/agencies/whd/flsa/misclassification",
      "https://www.butlersnow.com/news-and-events/revisiting-independent-contractor-classification-what-the-dols-2026-proposed-rule-means-for-businesses",
    ],
    verifyWithAdvisor: true,
  },
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

  {
    key: "de-13b-reverse-charge",
    country: "DE",
    appliesTo: "SELF",
    profileKey: "de-freelancer",
    name: "Reverse-charge VAT on foreign services (§13b) — Kleinunternehmer NOT exempt",
    description:
      "Commonly missed: the Kleinunternehmer exemption does NOT cover reverse charge. Buying services from foreign providers through the German freelance business (Vercel, Google Ads, US SaaS, foreign subcontractors) makes the German recipient owe 19% German VAT on those purchases under §13b UStG — payable out of pocket, with no input-VAT deduction, via a Voranmeldung filed just for those periods. Quarterly reminder: tally foreign B2B service purchases on the German side and hand the list to the Steuerberater. (Purchases run through the US LLC are not affected.)",
    frequency: "QUARTERLY",
    dueRules: [
      { month: 1, day: 10 },
      { month: 4, day: 10 },
      { month: 7, day: 10 },
      { month: 10, day: 10 },
    ],
    sourceUrls: [
      "https://onlinebilanz.de/reverse-charge-kleinunternehmer/",
      "https://buchhaltung-effizient.de/?p=493",
    ],
    verifyWithAdvisor: true,
  },
  {
    key: "de-ksa-abgabe",
    country: "DE",
    appliesTo: "CONTRACTOR",
    profileKey: "de-freelancer",
    name: "Künstlersozialabgabe check (paying German creatives)",
    formName: "KSK Meldung",
    description:
      "German businesses that regularly commission creative work (design, copywriting, photography) from German freelancers owe the Künstlersozialabgabe — 4.9% of those fees in 2026, reported to the Künstlersozialkasse; the 2026 de-minimis threshold is EUR 1,000/year. Purely technical website maintenance is generally not covered. Check applies if the GERMAN freelance side commissions German creatives. Flip side worth knowing: German clients commissioning design from Chase may owe KSA on his fees (their duty, not his).",
    frequency: "WATCH",
    dueRules: [],
    sourceUrls: [
      "https://www.kuenstlersozialkasse.de/unternehmen-und-verwerter/faq-unternehmen-und-verwerter",
      "https://www.sparkasse.de/aktuelles/kuenstlersozialabgabe.html",
    ],
    verifyWithAdvisor: true,
  },
  {
    key: "de-scheinselbststaendigkeit",
    country: "DE",
    appliesTo: "CONTRACTOR",
    profileKey: "de-freelancer",
    name: "Scheinselbstständigkeit check (German contractors)",
    description:
      "Germany's version of misclassification: a 'contractor' who works like an employee (one main client, fixed hours, integrated into operations, no own business risk) can be reclassified, triggering back social-security contributions. For German contractors: keep engagements project-based, let them work their own hours (the self-reported hours log helps document this), and keep their signed contractor agreements on file. A Statusfeststellungsverfahren with the Deutsche Rentenversicherung can settle doubtful cases in advance.",
    frequency: "WATCH",
    dueRules: [],
    sourceUrls: [
      "https://www.deutsche-rentenversicherung.de/DRV/DE/Experten/Arbeitgeber-und-Steuerberater/statusfeststellung/statusfeststellung.html",
    ],
    verifyWithAdvisor: true,
  },
  {
    key: "de-record-retention",
    country: "DE",
    appliesTo: "SELF",
    profileKey: "de-freelancer",
    name: "German record retention (GoBD)",
    description:
      "Never purge early: invoices (incoming and outgoing) and booking documents — 8 years (reduced from 10 by the 2025 Bureaucracy Relief Act). Books, records, and annual statements — 10 years. Retention must be GoBD-compliant (unchangeable, complete, retrievable) — the tracker's append-only invoice/hours records with audit trails are built to that standard. This entry documents the windows.",
    frequency: "WATCH",
    dueRules: [],
    sourceUrls: [
      "https://www.ihk.de/konstanz/recht-und-steuern/steuer-und-finanzpolitik/finverwal/aufbewahrung-von-geschaeftsunterlagen-1672476",
      "https://www.d-velop.de/blog/compliance/gobd-konforme-aufbewahrung-von-rechnungen/",
    ],
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
    key: "de-gdpr-dsgvo",
    country: "DE",
    appliesTo: "CLIENT",
    profileKey: "de-freelancer",
    name: "GDPR / DSGVO paperwork for EU clients",
    formName: "AVV / DPA (Art. 28 DSGVO)",
    description:
      "Not tax, but real legal exposure with EU clients: processing personal data on a client's behalf (hosting their site, handling their form submissions or customer lists) requires a signed Auftragsverarbeitungsvertrag (data processing agreement) with that client, and BlokBlok's own sites/processes need a compliant privacy notice. German clients increasingly ask for the AVV up front — having a standard one ready is both protection and a sales asset. Have a lawyer produce the template once.",
    frequency: "WATCH",
    dueRules: [],
    sourceUrls: ["https://gdpr.eu/what-is-data-processing-agreement/"],
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
// Used when a contractor/client gets a country (or, for the country-independent
// base set, is created at all) to auto-create TaxDocument rows. The exchange is
// deliberately two-way: what they owe us AND what we owe them.
export function requiredDocTypes(opts: {
  kind: "contractor" | "client";
  country: string | null;
}): { type: string; direction: "INBOUND" | "OUTBOUND"; note: string }[] {
  const { kind, country } = opts;
  if (kind === "contractor") {
    // Country-independent base set for every contractor:
    // - a signed independent contractor agreement (incl. IP assignment) is the
    //   core legal cover — classification defense, ownership, payment terms
    // - they get their countersigned copy back, and our billing details so
    //   their invoices to us are compliant
    const base: { type: string; direction: "INBOUND" | "OUTBOUND"; note: string }[] = [
      {
        type: "CONTRACTOR_AGREEMENT",
        direction: "INBOUND",
        note: "Signed independent contractor agreement (incl. IP assignment) required before work starts.",
      },
      {
        type: "COUNTERSIGNED_AGREEMENT",
        direction: "OUTBOUND",
        note: "Their copy of the fully signed agreement — send it back once countersigned.",
      },
      {
        type: "COMPANY_INFO",
        direction: "OUTBOUND",
        note: "Blok Blok's billing details sheet (legal name, address) so their invoices to us are compliant.",
      },
    ];
    if (country === "US") {
      return [
        ...base,
        {
          type: "W9",
          direction: "INBOUND",
          note: "Completed W-9 required before first payment (feeds the 1099-NEC).",
        },
        {
          type: "1099_NEC_COPY",
          direction: "OUTBOUND",
          note: "Copy of their 1099-NEC due to them by Jan 31 if paid $2,000+ during the year.",
        },
      ];
    }
    if (country) {
      // Any non-US contractor paid by the US LLC
      return [
        ...base,
        {
          type: "W8BEN",
          direction: "INBOUND",
          note: "W-8BEN (individual) or W-8BEN-E (entity) required before first payment; valid 3 years.",
        },
      ];
    }
    return base;
  }
  if (!country) return [];
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
      {
        type: "DPA_AVV",
        direction: "OUTBOUND",
        note: "Signed Auftragsverarbeitungsvertrag (GDPR data processing agreement) if we host or process personal data for this client.",
      },
    ];
  }
  return [];
}
