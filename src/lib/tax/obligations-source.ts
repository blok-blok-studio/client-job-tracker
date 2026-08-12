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
      "Annual federal return; the single-member LLC and the German freelance activity BOTH report on Schedule C (worldwide income), with Schedule SE (or the totalization exemption statement) and Form 8995 for the QBI deduction (20%, now permanent; new $400 minimum deduction from 2026 — web design is not an SSTB). Reconcile Stripe's 1099-K gross to Schedule C receipts to avoid IRS mismatch letters. Due April 15 (weekend/holiday shifts apply); Form 4868 extends filing to October 15 but not payment. IRS e-file opens late January — the earliest-submission reminder fires then.",
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
      "Estimated federal income + self-employment tax (15.3% SE up to the $184,500 Social Security base for 2026, Medicare uncapped; half deductible), paid quarterly: April 15, June 15, September 15, and January 15 of the following year. Safe harbor against penalties: pay 90% of current-year tax or 100% of prior-year (110% if prior AGI over $150k), or owe under $1,000. WORLDWIDE income counts — include German freelance income in the estimate. The January payment can be skipped if the annual return is filed and fully paid by January 31.",
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
      "Annual Texas franchise filing due May 15 (May 17, 2027 — the 15th is a Saturday). No-tax-due revenue threshold is $2,650,000 for report years 2026-2027 (inflation-adjusted every two years). Below it: no tax and no tax form, but the Public Information Report is STILL due — missing it can forfeit the LLC. Also keep a Texas registered agent continuously (required; lapse risks involuntary termination).",
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
      "IMPORTANT: Texas treats web design/development, website maintenance, hosting — and per the amended Rule 3.330 (effective April 2, 2025) explicitly SEO, social media marketing, and lead generation — as taxable 'data processing services': 80% of the charge is taxable (20% exempt by §151.351), effective ~6.6% at the max 8.25% rate. Selling these to TEXAS clients (e.g. DFW plumbers) requires a sales tax permit and collecting/remitting; once permitted, $0 returns are due every period regardless. Local rate sources to the studio's own location for services; multi-state clients can allocate out-of-state use via exemption certificate. Pure consulting/strategy stays nontaxable — itemize invoices (burden of proof on the seller when bundled). Also self-assess Texas use tax on untaxed out-of-state purchases. Other states: economic nexus typically triggers at $100k of sales into a state — set a tripwire at ~$75k into any single state. Semi-annual check with the CPA.",
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
    name: "Beneficial ownership (BOI) reporting — PERMANENTLY CLOSED",
    formName: "FinCEN BOI",
    description:
      "CLOSED: FinCEN's FINAL rule of August 11, 2026 permanently removed BOI reporting for all US-formed companies and US persons — only foreign-formed entities registered in a US state still report. A Texas LLC has zero BOI obligation, ever, and FinCEN is deleting previously reported US-person data. Kept as a record that this was checked.",
    frequency: "WATCH",
    dueRules: [],
    sourceUrls: [
      "https://www.fincen.gov/news/news-releases/fincen-permanently-ends-beneficial-ownership-reporting-requirements-millions",
    ],
    enabled: false,
  },
  {
    key: "us-de-treaty-totalization",
    country: "US",
    appliesTo: "SELF",
    profileKey: "us-llc",
    name: "US-Germany double taxation + social security coordination",
    formName: "Form 1116 / certificate D/USA 101",
    description:
      "The US taxes citizens on WORLDWIDE income: German freelance earnings go on the 1040, offset via the foreign tax credit (Form 1116; note the separate foreign-branch basket — credits can't cross baskets). Since German rates exceed US rates, FTC usually zeroes the US income tax and banks excess credits. FEIE (Form 2555, $132,900 for 2026) is the alternative but never covers SE tax and revoking it locks you out 5 years — for high-German-tax filers FTC usually wins. Social security: the totalization agreement assigns coverage territorially; get certificate D/USA 101 from the German Krankenkasse and attach it to the 1040 EVERY year with 'Exempt, see attached statement' on Schedule SE — without it the IRS default is US SE tax on top of German contributions (pure 15.3% loss). Convert EUR at the IRS yearly-average rate. The unresolved residence question (where Chase actually lives, day-counted) drives FEIE eligibility, 8938 thresholds ($50k US-resident vs $200k abroad), and German unlimited tax liability — settle and document it with both advisors once.",
    frequency: "WATCH",
    dueRules: [],
    sourceUrls: [
      "https://www.irs.gov/individuals/international-taxpayers/foreign-tax-credit",
      "https://www.irs.gov/individuals/international-taxpayers/self-employment-tax-for-businesses-abroad",
      "https://www.ssa.gov/international/Agreement_Pamphlets/germany.html",
    ],
    verifyWithAdvisor: true,
  },
  {
    key: "us-form-8858",
    country: "US",
    appliesTo: "SELF",
    profileKey: "us-llc",
    name: "Form 8858 — foreign branch information return (LIKELY REQUIRED)",
    formName: "Form 8858 + Schedule M",
    description:
      "Deep research verdict: very likely applies. Since 2018, any US person operating a FOREIGN BRANCH — a business abroad with its own books, no entity needed — files Form 8858 with the 1040. A US citizen freelancing from Germany, registered with the Finanzamt and keeping German books, is the textbook case. Penalty for not filing: $10,000 per year, plus a 10% foreign-tax-credit haircut, plus the statute of limitations stays OPEN on the whole return — and it may already be accruing for past years. Filing protectively costs nothing (it is an information return). For missed past years use the Streamlined Foreign Offshore Procedures or the delinquent-return procedure WITH a reasonable-cause statement — do not quietly attach late forms. Put this in front of the CPA immediately.",
    frequency: "ANNUAL",
    dueRules: [{ month: 4, day: 15 }],
    sourceUrls: ["https://www.irs.gov/instructions/i8858"],
    verifyWithAdvisor: true,
  },
  {
    key: "us-backup-withholding",
    country: "US",
    appliesTo: "CONTRACTOR",
    profileKey: "us-llc",
    name: "Backup withholding + B-notices (missing/mismatched TINs)",
    formName: "Form 945 / CP2100 B-notice",
    description:
      "If a US contractor won't provide a TIN on a W-9: withhold 24% of payments. If the IRS sends a CP2100/CP2100A notice (TIN mismatch on a filed 1099): send the contractor a B-notice within 15 business days and start withholding within 30 business days unless they cure it. Any year backup withholding actually happens, Form 945 is due by Jan 31 of the following year. The W-9-before-first-payment rule normally keeps this dormant.",
    frequency: "WATCH",
    dueRules: [],
    sourceUrls: [
      "https://www.irs.gov/businesses/small-businesses-self-employed/backup-withholding",
      "https://www.irs.gov/individuals/understanding-your-cp2100-or-cp2100a-notice",
    ],
  },
  {
    key: "us-tx-dba",
    country: "US",
    appliesTo: "SELF",
    profileKey: "us-llc",
    name: "Texas assumed name certificate (DBA) check",
    formName: "SOS Form 503",
    description:
      "If the LLC's legal name is not literally the trade name used on contracts, invoices, and marketing ('BlokBlok Studio'), Texas requires an assumed name certificate: Form 503 with the Secretary of State, $25, valid up to 10 years, renew within 6 months of expiry. One-time check: compare the certificate of formation against how the studio actually signs and advertises.",
    frequency: "WATCH",
    dueRules: [],
    sourceUrls: ["https://www.sos.state.tx.us/corp/instructions/503.shtml"],
  },
  {
    key: "us-record-retention",
    country: "US",
    appliesTo: "SELF",
    profileKey: "us-llc",
    name: "US record retention windows",
    description:
      "Never purge early. Actual IRS rules: employment/contractor tax records (incl. W-9s and backup-withholding evidence) — 4 years; audit window 3 years generally, 6 years if income understated over 25%, unlimited for fraud or non-filing. House POLICY on top of that: keep W-9s 4 years after the last 1099 year, returns and IRS correspondence 7 years, bank/card statements 7 years. The tracker's contractor invoices, hours entries, and audit trails are deliberately delete-proof; this entry documents why.",
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
      "Non-US contractors (individuals: W-8BEN; entities: W-8BEN-E) certify foreign status before payment. Services performed ENTIRELY outside the US are foreign-source: no 1099-NEC, no withholding, no Form 1042 — the W-8 documents that position, so also get a written statement that no work is performed on US soil. If a contractor ever works even partly IN the US, that portion becomes US-source: 30% withholding default plus Form 1042/1042-S duties. Validity runs through Dec 31 of the third year after signing (forms signed in 2023 die Dec 31, 2026 — the expiry chaser tracks this).",
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

  // ---------- US — non-tax legal (final completeness sweep, Aug 2026) ----------
  {
    key: "us-tcpa-sms",
    country: "US",
    appliesTo: "CLIENT",
    profileKey: "us-llc",
    name: "TCPA — SMS marketing bright line",
    description:
      "HIGHEST US LIABILITY PER INCIDENT: marketing texts require prior express WRITTEN consent (signed, clear disclosure, not a purchase condition); statutory damages are $500-1,500 PER TEXT, uncapped, private right of action, class-action factory. Opt-outs by any reasonable means must be honored within 10 business days (rules effective Apr 2025). Studio policy: never run SMS campaigns without consent records the studio has verified; keep client campaigns on the client's own Twilio account with consent responsibility and indemnity contractually on the client (matches the existing third-party-fees policy).",
    frequency: "WATCH",
    dueRules: [],
    sourceUrls: [
      "https://www.bclplaw.com/en-US/events-insights-news/the-tcpas-new-opt-out-rules-take-effect-on-april-11-2025-what-does-this-mean-for-businesses.html",
    ],
  },
  {
    key: "us-ada-wcag",
    country: "US",
    appliesTo: "CLIENT",
    profileKey: "us-llc",
    name: "ADA website accessibility — WCAG 2.1 AA as build default",
    description:
      "No federal web regulation exists for private sites (DOJ paused rulemaking), but ~4,300 website ADA suits were filed in 2024 alone and courts treat WCAG 2.1 AA as the benchmark — serial plaintiffs target exactly BlokBlok's client profile (small local businesses). This is the most probable US legal event for a client site. Policy: build to WCAG 2.1 AA by default; MSA states the standard targeted without guaranteeing compliance (keeps the studio from becoming the indemnitor on a demand letter). If a government client (city, school district) is ever signed, WCAG 2.1 AA becomes a hard DOJ Title II requirement (deadlines Apr 2027/2028) — price it as such.",
    frequency: "WATCH",
    dueRules: [],
    sourceUrls: [
      "https://www.adatitleiii.com/2026/04/doj-extends-ada-title-ii-website-accessibility-deadlines-for-governmental-entities-but-litigation-and-compliance-risks-remain/",
    ],
  },
  {
    key: "us-can-spam",
    country: "US",
    appliesTo: "CLIENT",
    profileKey: "us-llc",
    name: "CAN-SPAM — client newsletters the studio sends",
    description:
      "The studio is liable as the 'initiator' of client newsletters ALONGSIDE the client — liability cannot be contracted away. Per-email requirements: accurate header/from, non-deceptive subject, ad identification, valid postal address, working opt-out honored within 10 business days. FTC penalty up to $53,088 PER EMAIL. Policy: postal address + unsubscribe check on every client list, suppression-list hygiene, and clients contractually warrant list provenance (no purchased lists) with indemnity.",
    frequency: "WATCH",
    dueRules: [],
    sourceUrls: ["https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business"],
  },
  {
    key: "us-tdpsa-processor",
    country: "US",
    appliesTo: "CLIENT",
    profileKey: "us-llc",
    name: "Texas privacy law (TDPSA) — processor rider for client work",
    description:
      "BlokBlok itself is exempt as a controller (small-business carve-out) EXCEPT it may never sell sensitive personal data without consent — watch ad-tech/analytics arrangements ('sale' includes any valuable consideration). The real duty is as a PROCESSOR for in-scope clients: §541.104 requires a written data-processing contract (instructions, purpose, data types, duration, confidentiality, subcontractor flow-down). Storing client-customer form submissions = processing on the client's behalf. Add a short DPA rider to the MSA (pairs with the GDPR Art. 28 AVV for German clients). Enforcement: TX AG, 30-day cure, $7,500/violation — and the TX AG is the most aggressive state privacy enforcer.",
    frequency: "WATCH",
    dueRules: [],
    sourceUrls: [
      "https://www.texasattorneygeneral.gov/consumer-protection/file-consumer-complaint/consumer-privacy-rights/texas-data-privacy-and-security-act",
    ],
    verifyWithAdvisor: true,
  },
  {
    key: "us-client-msa-essentials",
    country: "US",
    appliesTo: "CLIENT",
    profileKey: "us-llc",
    name: "Client contract load-bearing clauses (one lawyer session)",
    description:
      "The AI-drafted contracts likely miss these. Texas: liability caps are enforceable B2B but must be CONSPICUOUS (bold/caps) with express negligence language; stack = cap at 12 months' fees + mutual consequential-damages waiver + carve-outs for IP/confidentiality/indemnity. Client content warranty: client warrants it owns supplied text/images/lists and indemnifies. IP assigns to client on FULL payment. Accessibility/privacy responsibility allocated explicitly. CAUTION for German clients: a standard template is 'AGB' under German law even B2B — blanket liability exclusions are VOID and one bad sub-clause kills the whole clause; use a German-reviewed variant or defensible Texas choice-of-law. Get the templates through one lawyer session.",
    frequency: "WATCH",
    dueRules: [],
    sourceUrls: [
      "https://freemanlaw.com/can-a-professional-services-firm-limit-its-liability-by-contract-a-look-at-texas-new-mexico-and-oklahoma-law/",
    ],
    verifyWithAdvisor: true,
  },
  {
    key: "us-coppa-screen",
    country: "US",
    appliesTo: "CLIENT",
    profileKey: "us-llc",
    name: "COPPA screen on client intake (child-directed sites)",
    description:
      "The amended COPPA rule is fully in force (compliance deadline Apr 22, 2026): child-directed sites need parental consent flows, a written infosec program, and a written retention policy; penalties ~$53k/violation. The operator is the client, but an agency running the data collection can be an operator too. One intake question: 'Is any part of this site directed at children under 13?' (tutoring, kids' camps, youth sports). If yes: decline or price as specialty work.",
    frequency: "WATCH",
    dueRules: [],
    sourceUrls: [
      "https://www.federalregister.gov/documents/2025/04/22/2025-05904/childrens-online-privacy-protection-rule",
    ],
  },
  {
    key: "us-freelance-hiring-laws",
    country: "US",
    appliesTo: "CONTRACTOR",
    profileKey: "us-llc",
    name: "State freelance-protection laws (bind BlokBlok by contractor's state)",
    description:
      "Hiring a freelancer who sits in NY, IL, or CA binds BlokBlok to that state's freelance act: written contract required above $800 (NY, incl. 120-day aggregate), $500 (IL), or $250 (CA SB 988); payment by the contract date or within 30 days of completion; contract must state both parties' names/addresses, itemized services, value, rate, and payment due date. Nonpayment = double damages + attorney fees; no written contract = statutory damages. Compliance is nearly free: ONE contractor agreement template with those fields and a ≤30-day payment term, used for every US contractor regardless of state — which the tracker's enforced CONTRACTOR_AGREEMENT requirement already operationalizes. Record contractor state at onboarding; keep contracts 2+ years.",
    frequency: "WATCH",
    dueRules: [],
    sourceUrls: [
      "https://dol.ny.gov/freelance-isnt-free-act",
      "https://labor.illinois.gov/laws-rules/legal/freelance-worker-protection-act.html",
    ],
  },
  {
    key: "us-contractor-ip-assignment",
    country: "US",
    appliesTo: "CONTRACTOR",
    profileKey: "us-llc",
    name: "Contractor IP: 'work for hire' does NOT transfer website copyright",
    description:
      "Verified against 17 U.S.C. §101: an independent contractor's work is 'made for hire' only within nine statutory categories — website code/design does not cleanly fit, so a bare work-for-hire clause FAILS and the contractor keeps copyright by default. Every contractor agreement needs an express present-tense assignment ('Contractor hereby assigns all right, title and interest...') as the operative clause, with the client MSA completing the chain (assignment to client on full payment). GERMAN contractors: copyright is non-transferable under §29 UrhG — an assignment clause is void; use an exclusive, unrestricted, sublicensable, worldwide, perpetual usage-rights (Nutzungsrechte) grant expressly covering unknown use types, and pay more than a token fee (German authors have a statutory fair-remuneration claim). Fix the agreement template once.",
    frequency: "WATCH",
    dueRules: [],
    sourceUrls: [
      "https://www.copyright.gov/circs/circ30.pdf",
      "https://www.gesetze-im-internet.de/urhg/__29.html",
    ],
    verifyWithAdvisor: true,
  },
  {
    key: "us-dmca-agent",
    country: "US",
    appliesTo: "SELF",
    profileKey: "us-llc",
    name: "DMCA agent registration ($6) if hosting user-generated content",
    description:
      "The §512(c) safe harbor against copyright claims over user-posted material requires a registered DMCA agent. Private contact-form submissions don't need it, but if any hosted client site has PUBLIC user content (comments, reviews, forums, uploads), register at copyright.gov ($6, renew every 3 years or protection lapses) and post a takedown + repeat-infringer policy. Also: license hygiene per delivered site — webfonts are per-domain/per-licensee (agency licenses usually do NOT cover client sites; Adobe Fonts requires the client's own subscription), stock licenses are licensee-specific, and delivering GPL code to a client is 'distribution' with source obligations. Keep a per-site license register.",
    frequency: "WATCH",
    dueRules: [],
    sourceUrls: ["https://www.copyright.gov/dmca-directory/"],
  },

  // ---------- DE — own filings (freelancer, Kleinunternehmer, via Steuerberater) ----------
  {
    key: "de-est-steuerberater",
    country: "DE",
    appliesTo: "SELF",
    profileKey: "de-freelancer",
    name: "Einkommensteuererklärung (German income tax return)",
    formName: "Einkommensteuererklärung + Anlage S + Anlage EÜR",
    description:
      "With a Steuerberater the return for tax year N is due at the end of February of year N+2 — the 2025 return lands March 1, 2027 (Feb 28 is a Sunday). Without an advisor it would be July 31 of N+1. Must include Anlage S and the standardized Anlage EÜR (mandatory for every Freiberufler, no minimum threshold, via ELSTER). Make sure the §138 Abs. 2 AO notice about the US LLC rides along with the return (see the LLC entries). This reminder is for delivering records to the Steuerberater well ahead of the deadline.",
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
      "Quarterly check of German revenue against the Kleinunternehmer limits (both NET figures since 2025): EUR 25,000 total in the PRIOR year, and a HARD EUR 100,000 cap in the CURRENT year — the very transaction that crosses 100k is already taxable (regular VAT from that moment, not retroactive). While in the regime: no Voranmeldungen, no annual VAT return, no Zusammenfassende Meldung even for EU B2B clients (§18a Abs. 4 UStG), and invoices MUST carry the §19 exemption note (§34a UStDV — statutory since 2025). Exiting the regime flips all of that on at once, including quarterly ZM by the 25th after quarter-end — talk to the Steuerberater BEFORE it happens.",
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
      "Commonly missed and VERIFIED against §18(4a) UStG: the Kleinunternehmer exemption does NOT cover reverse charge. Buying services from foreign providers through the German freelance business (Vercel, Google Ireland, Meta, US SaaS, foreign subcontractors) makes the German recipient owe 19% German VAT under §13b — payable out of pocket, no input-VAT deduction, via a Voranmeldung due the 10th after any period with such purchases. A USt-IdNr (free from BZSt) is needed so EU suppliers issue net reverse-charge invoices instead of charging their local VAT on top. Quarterly reminder: tally foreign B2B service purchases on the German side for the Steuerberater. (Purchases run through the US LLC are not affected.)",
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
    name: "Künstlersozialabgabe (paying German creatives) — annual Meldung",
    formName: "KSK Jahresmeldung",
    description:
      "Commissioning creative work (design, copywriting, photography) from German freelancers via the German side triggers the Künstlersozialabgabe: 4.9% of those fees in 2026, with the ANNUAL Meldung to the Künstlersozialkasse due March 31 for the prior year (register first as abgabepflichtiges Unternehmen; monthly prepayments once assessed; 5-year retroactive collection on discovery). CAUTION: the EUR 1,000 de-minimis does NOT apply to 'typische Verwerter' — businesses like design studios that market others' creative work — which likely includes BlokBlok, so assume first euro counts. Purely technical work (hosting, maintenance) is not covered. Flip side: German clients commissioning design from Chase may owe KSA on his fees (their duty, not his).",
    frequency: "ANNUAL",
    dueRules: [{ month: 3, day: 31 }],
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

  {
    key: "de-llc-typenvergleich",
    country: "DE",
    appliesTo: "SELF",
    profileKey: "de-freelancer",
    name: "US LLC classification in Germany (Typenvergleich) — HIGHEST-RISK OPEN ITEM",
    description:
      "Germany ignores US 'disregarded entity' status and classifies the Texas LLC by comparing its OPERATING AGREEMENT to German company types (BMF letter 19.3.2004, confirmed by the BFH). Many standard single-member agreements come out as a CORPORATION in German eyes. If so, and the LLC is managed from a German desk (place of management = Germany), the LLC itself owes German corporate tax + Gewerbesteuer, draws are taxed AGAIN as dividends, and the US/German taxes attach to different taxpayers so credits misalign — combined burdens can pass 60%. If it compares as TRANSPARENT instead, the income is simply personal business income (clean, but then the LLC gives no German benefit at all). Mitigation: have the Steuerberater run the BMF-2004 comparison on the actual operating agreement NOW, before any Finanzamt inquiry; member-managed structure with automatic profit allocation and restricted transferability points toward transparent; amending the agreement later can trigger a deemed liquidation, so fix it early. If settling in Germany long-term, seriously consider winding the LLC down and operating as a German Freiberufler invoicing US clients directly.",
    frequency: "WATCH",
    dueRules: [],
    sourceUrls: [
      "https://www.roedl.com/insights/usa-llc-limited-liability-company-steuern/",
      "https://www.ey.com/de_de/technical/steuernachrichten/einordnung-einer-llc-als-personen-oder-kapitalgesellschaft",
    ],
    verifyWithAdvisor: true,
  },
  {
    key: "de-138-ao-llc-notice",
    country: "DE",
    appliesTo: "SELF",
    profileKey: "de-freelancer",
    name: "Report the US LLC to the Finanzamt (§138 Abs. 2 AO)",
    description:
      "German residents must report foreign business formations/acquisitions and participations in foreign companies to the Finanzamt — electronically, with the income tax return, at the latest 14 months after year-end. An unreported US LLC is an Ordnungswidrigkeit with fines up to EUR 25,000, and a bad look in any later dispute (especially one about the LLC's classification). Cross-check with the Steuerberater immediately that this notice has been or will be filed.",
    frequency: "WATCH",
    dueRules: [],
    sourceUrls: ["https://www.gesetze-im-internet.de/ao_1977/__138.html"],
    verifyWithAdvisor: true,
  },
  {
    key: "de-social-insurance",
    country: "DE",
    appliesTo: "SELF",
    profileKey: "de-freelancer",
    name: "German social insurance traps (health, pension, KSK insurability)",
    description:
      "Three separate checks. (1) Health insurance is MANDATORY in Germany — as self-employed, freiwillige GKV (~14.6-17.5% on a minimum base of ~EUR 1,318/month) or PKV; being uninsured accrues back-premiums. (2) One-client pension trap (§2 Nr. 9 SGB VI): any self-employed person earning ~5/6+ of revenue from ONE client with no employees owes compulsory pension contributions (~18.6%) — profession-independent, separate from Scheinselbstständigkeit, frequently missed; a start-up exemption exists for the first 3 years. (3) KSK insurability: if the design work is predominantly creative and earns over EUR 3,900/year, Chase himself is OBLIGATORILY insured through the Künstlersozialkasse — a duty but also a benefit, since the KSK pays the 'employer half' of health + pension. Verify all three with the Steuerberater.",
    frequency: "WATCH",
    dueRules: [],
    sourceUrls: [
      "https://www.deutsche-rentenversicherung.de/DRV/DE/Rente/Arbeitnehmer-und-Selbststaendige/03_Selbststaendige/statusfeststellungsverfahren.html",
      "https://www.kuenstlersozialkasse.de/",
    ],
    verifyWithAdvisor: true,
  },
  {
    key: "de-freiberufler-gewerbe",
    country: "DE",
    appliesTo: "SELF",
    profileKey: "de-freelancer",
    name: "Freiberufler vs. Gewerbe classification (contested for web designers)",
    description:
      "Web designer is not a listed Katalogberuf — Freiberufler status rests on the work being predominantly creative/artistic (comparable to a Grafik-Designer). Template-based work, hosting resale, maintenance contracts, or product sales lean gewerblich; reclassification means Gewerbeanmeldung, Gewerbesteuer (EUR 24,500 allowance, largely credited against income tax), IHK membership dues, and retroactive exposure. Protection: keep portfolio evidence of the creative character of the work, and run separable commercial side-activities (hosting margins, affiliate income) as a separate operation with separate records.",
    frequency: "WATCH",
    dueRules: [],
    sourceUrls: [
      "https://www.e-recht24.de/unternehmensgruendung/11066-webdesigner-freiberufler.html",
    ],
    verifyWithAdvisor: true,
  },

  // ---------- DE — client paperwork ----------
  {
    key: "de-bfsg-accessibility",
    country: "DE",
    appliesTo: "CLIENT",
    profileKey: "de-freelancer",
    name: "BFSG accessibility (EU) — consumer/e-commerce client sites",
    description:
      "In force since June 28, 2025: client sites offering e-commerce or bookable services to EU CONSUMERS must meet EN 301 549 (= WCAG 2.1 AA) and carry an accessibility statement — this applies regardless of where the operator sits, so a Texas client selling to German consumers is in scope. Fines up to EUR 100,000 land on the SITE OPERATOR, but a non-compliant build is a contractual DEFECT for the agency (free rework + damages under German law). Microenterprise service providers (under 10 employees AND under EUR 2M turnover) are exempt — verify and DOCUMENT the exemption per client, it is theirs not BlokBlok's. Policy: WCAG 2.1 AA default on consumer-facing EU builds + a contract clause allocating accessibility responsibility.",
    frequency: "WATCH",
    dueRules: [],
    sourceUrls: [
      "https://bfsg-gesetz.de/37-bfsg/",
      "https://www.w3.org/WAI/policies/european-union/",
    ],
    verifyWithAdvisor: true,
  },
  {
    key: "de-market-hygiene",
    country: "DE",
    appliesTo: "CLIENT",
    profileKey: "de-freelancer",
    name: "German market hygiene bundle (cookies, fonts, double opt-in)",
    description:
      "The most FREQUENTLY enforced items for German sites, via competitor Abmahnung letters. (1) Cookie consent, §25 TDDDG: prior, per-purpose consent for anything non-essential; rejecting must be as easy as accepting; no third-party requests before consent; fines to EUR 300k plus GDPR exposure. (2) Fonts: self-host Google Fonts on German builds — remote loading was sanctioned by German courts. (3) Email marketing, UWG §7: German recipients require DOUBLE opt-in with timestamped confirmation logs (BGH standard); never import an unverified list for a German client; each unsolicited email is individually actionable and the studio can be the sender-of-record. Ship every German build with these three by default.",
    frequency: "WATCH",
    dueRules: [],
    sourceUrls: [
      "https://www.dlapiperdataprotection.com/?t=electronic-marketing&c=DE",
    ],
  },
  {
    key: "de-impressum-ddg",
    country: "DE",
    appliesTo: "CLIENT",
    profileKey: "de-freelancer",
    name: "Impressum + website legal hygiene (own site and client sites)",
    description:
      "German sites need a full provider Impressum under §5 DDG (the TMG was repealed May 2024 — update any legacy '§5 TMG' references in footers Chase builds) plus a DSGVO privacy notice; editorial content adds §18 MStV. Fines are theoretical but Abmahnung letters (EUR 500-1,500) are common. As a service matter, every German client site BlokBlok ships should have a correct Impressum + Datenschutzerklärung. Related commercial norm (not law): IT-/Medienhaftpflicht insurance — copyright and photo-license claims are the classic web design loss.",
    frequency: "WATCH",
    dueRules: [],
    sourceUrls: [
      "https://www.it-recht-kanzlei.de/tmg-ttdsg-ausser-kraft-impressum-datenschutz.html",
    ],
  },
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
    name: "German e-invoicing mandate — Kleinunternehmer are EXEMPT from issuing",
    formName: "XRechnung / ZUGFeRD (EN 16931)",
    description:
      "Corrected after deep research: Kleinunternehmer are PERMANENTLY exempt from the e-invoice ISSUANCE mandate (§34a Satz 4 UStDV) — the 2027 (>EUR 800k) and 2028 (everyone) stages never bite while §19 status holds. What DOES apply since Jan 2025: the ability to RECEIVE structured e-invoices (an email inbox suffices) and archiving received e-invoices in their original structured format for 8 years. If Kleinunternehmer status is ever lost, the issuance duty starts (2028 rule, or 2027 only above EUR 800k turnover) in EN 16931 formats — plain PDF does not qualify.",
    frequency: "WATCH",
    dueRules: [],
    sourceUrls: [
      "https://www.etl.de/e-rechnung/regelungen-kleinunternehmer/",
      "https://www.ihk.de/rhein-neckar/recht/steuerrecht/umsatzsteuer/e-rechnungspflicht-5931752",
    ],
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
