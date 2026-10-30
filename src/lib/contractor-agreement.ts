/**
 * Baseline agreements we send TO contractors.
 *
 * Deliberately separate from src/lib/contract-templates.ts (client service
 * agreements): different party, different risks. The clauses here track the
 * research already captured in the compliance catalog:
 *  - bare "work made for hire" does NOT carry websites/code in the US, so the
 *    IP section uses a present-tense assignment as the operative grant
 *  - German copyright cannot be assigned (§29 UrhG), so DE contractors get an
 *    exclusive, unrestricted, transferable Nutzungsrechte grant instead
 *  - NY / IL / CA freelance-hiring acts want both parties' names + addresses,
 *    itemized services, rate, and a payment due date — with payment inside 30
 *    days, so the template defaults to 15
 *  - US-style liability caps are void in German AGB, so the DE variant limits
 *    liability by the statutory (foreseeable-damage) standard instead
 *
 * Output is plain text in the same shape the PDF renderer and the on-screen
 * reader expect: "SECTION n. TITLE" headings and a closing ACKNOWLEDGMENT
 * AND ACCEPTANCE block.
 */

export type ContractorContractKind = "IC_AGREEMENT" | "NDA" | "SOW" | "REFERRAL_PARTNER";

export const CONTRACTOR_CONTRACT_KINDS: {
  key: ContractorContractKind;
  label: string;
  title: string;
  blurb: string;
}[] = [
  {
    key: "IC_AGREEMENT",
    label: "Contractor Agreement",
    title: "Independent Contractor Agreement",
    blurb: "Full IC agreement — classification, IP assignment, confidentiality, payment terms.",
  },
  {
    key: "NDA",
    label: "NDA",
    title: "Mutual Non-Disclosure Agreement",
    blurb: "Standalone confidentiality agreement, for talks before any work starts.",
  },
  {
    key: "SOW",
    label: "Statement of Work",
    title: "Statement of Work",
    blurb: "Scope, fee, and dates for one engagement under an existing agreement.",
  },
  {
    key: "REFERRAL_PARTNER",
    label: "Sales Partner Agreement",
    title: "Sales Partnership Agreement",
    blurb: "Commission schedule, registration rules, payout timing and compliance for a referral / closing partner.",
  },
];

export const DEFAULT_PROVIDER_LEGAL_NAME = "Blok Blok Studio LLC";

export interface ContractorAgreementOptions {
  contractorName: string;
  company?: string | null;
  /** ISO 3166-1 alpha-2. "US" and "DE" have tailored clauses; anything else uses the international variant. */
  country?: string | null;
  contractorAddress?: string | null;
  providerLegalName?: string | null;
  providerAddress?: string | null;
  /** What they're being engaged to do — free text, becomes the itemized services clause. */
  services?: string | null;
  /** Free text: "$65/hour", "€500 per video, invoiced monthly". Left out entirely when blank. */
  compensation?: string | null;
  /** Days from a correct invoice to payment. Capped at 30 by the freelance acts. */
  paymentDays?: number;
  effectiveDate?: Date;
  /** Appended verbatim as the final numbered section. */
  extraTerms?: string | null;
  /** Sales-partner commission terms; required for the REFERRAL_PARTNER kind. */
  partnerTerms?: PartnerAgreementTerms | null;
}

export interface PartnerAgreementTerms {
  partnerName: string;
  partnerLegalName?: string | null;
  /** percent of project fee when the partner books the call and we close */
  rateProjectHandoff: number;
  /** percent of the first $15,000 when an approved partner rep closes */
  rateProjectClose: number;
  rateBrandGuideHandoff: number;
  rateBrandGuideClose: number;
  /** percent of each eligible plan payment */
  ratePlan: number;
  /** calendar months from the first eligible plan payment */
  planMonths: number;
  /** days from our receipt of the client payment to the commission being paid */
  payoutDays: number;
  /** "the United States" */
  territory: string;
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

function partyLine(name: string, company?: string | null, address?: string | null): string {
  const who = company ? `${name} / ${company}` : name;
  return address ? `${who}, ${address}` : who;
}

/** Section numbering that stays correct when optional sections drop out. */
function sectionWriter() {
  let n = 0;
  return (title: string, body: string) => {
    n += 1;
    return `SECTION ${n}. ${title.toUpperCase()}\n\n${body.trim()}\n\n`;
  };
}

const CLOSING = `

ACKNOWLEDGMENT AND ACCEPTANCE

By signing below, both Parties acknowledge that they have read this Agreement in its entirety, understand its terms and conditions, and agree to be bound by them. Both Parties confirm that they have the authority to enter into this Agreement and that they do so voluntarily. An electronic signature captured with the signer's name, timestamp, and IP address has the same force as a handwritten one.

PROVIDER:
Name: ____________________
Date: ____________________

CONTRACTOR:
Name: ____________________
Date: ____________________

`;

// ─────────────────────────────────────────────────────────────────────────────
// Independent Contractor Agreement
// ─────────────────────────────────────────────────────────────────────────────

function ipSection(country: string, contractorLabel: string): { title: string; body: string } {
  if (country === "DE") {
    return {
      title: "Rights in the Work (Nutzungsrechte)",
      body: `German law does not permit copyright itself to be transferred (§ 29 UrhG). Accordingly, the Contractor grants the Provider, upon creation of each work and for the full term of protection, the exclusive right of use (ausschließliches Nutzungsrecht) in every work, design, code, footage, text, and other deliverable created in connection with this Agreement — unrestricted in territory, time, and content (räumlich, zeitlich und inhaltlich unbeschränkt), for all known types of use and, to the extent permitted by § 31a UrhG, for types of use not yet known at the time of this Agreement.

The grant includes the right to edit, adapt, translate, combine with other works, and to reproduce, distribute, publicly display, and make the work available online, and the right to transfer these rights or grant sublicenses to third parties (including the Provider's clients) without further consent or additional payment.

To the extent legally permissible, the Contractor waives the right to be named as author (§ 13 UrhG) and any right to object to modifications of the work, save for distortions that would seriously prejudice the Contractor's legitimate interests. The fee agreed in this Agreement compensates the grant of rights in full.

The Contractor may display the work in a personal portfolio once the work is public, unless the Provider asks otherwise in writing on a client's behalf.`,
    };
  }
  return {
    title: "Intellectual Property",
    body: `All deliverables created by the ${contractorLabel} in connection with this Agreement — including source code, designs, layouts, illustrations, photography, video, audio, copy, and documentation — are works created for the Provider and its clients.

To the extent any deliverable qualifies as a "work made for hire" under 17 U.S.C. § 101, it is a work made for hire owned by the Provider. Because that doctrine does not reach every category of work, the Contractor additionally and irrevocably ASSIGNS to the Provider, effective upon creation and without further consideration, all right, title, and interest worldwide in and to every deliverable, including all copyrights, trademarks, patent rights, trade secrets, and all rights to sue for past infringement. This present-tense assignment is the operative grant and survives any determination that a deliverable is not a work made for hire.

The Contractor will sign any further documents the Provider reasonably requests to record or perfect this assignment, and to the extent permitted by law waives all moral rights and rights of attribution or integrity in the deliverables.

Pre-existing materials the Contractor owns and incorporates into a deliverable remain the Contractor's, but the Contractor grants the Provider a perpetual, worldwide, royalty-free, transferable, sublicensable license to use, modify, and distribute those materials as part of the deliverable. The Contractor will identify any such materials in writing before delivery.

The Contractor may display the work in a personal portfolio once the work is public, unless the Provider asks otherwise in writing on a client's behalf.`,
  };
}

function classificationSection(country: string): string {
  const base = `The Contractor is an independent contractor, not an employee, partner, agent, or joint venturer of the Provider. Nothing in this Agreement creates an employment relationship.

The Contractor controls the manner, method, and means of performing the work, sets their own working hours, supplies their own equipment and software, and may work for other clients, including other studios, during the term of this Agreement. The Provider specifies the result to be achieved and the deadline; it does not supervise how the work is carried out.

The Contractor is not entitled to employee benefits of any kind — no health coverage, paid leave, retirement contributions, unemployment insurance, or workers' compensation — and is responsible for their own insurance.`;

  if (country === "US") {
    return `${base}

The Contractor is solely responsible for all federal, state, and local taxes on amounts paid under this Agreement, including self-employment tax and estimated tax payments. The Provider does not withhold taxes. The Contractor will provide a current Form W-9 directly to the Provider's accountant, and the Provider will issue a Form 1099-NEC where required by law.`;
  }
  if (country === "DE") {
    return `${base}

Die Parteien sind sich einig, dass kein Arbeitsverhältnis begründet wird. The Contractor confirms that they are registered as self-employed, work for more than one client, are not integrated into the Provider's organisation, are not bound by instructions as to time and place beyond agreed deadlines and delivery requirements, and bear their own entrepreneurial risk. The Contractor will inform the Provider without undue delay if this ceases to be the case — in particular if the Provider becomes their predominant source of income — so that both Parties can review the arrangement (Scheinselbstständigkeit, § 7 SGB IV; pension-insurance obligation for one-client contractors, § 2 No. 9 SGB VI).

The Contractor is responsible for their own income tax, VAT (where applicable), social-security contributions, and any artists' social-security matters. Invoices must carry the details required by § 14 UStG, including a tax number or VAT ID, or a note under § 19 UStG where the small-business rule applies. The Contractor will provide a Form W-8BEN (or W-8BEN-E) directly to the Provider's accountant.`;
  }
  return `${base}

The Contractor is solely responsible for all taxes, social contributions, and registrations required in their country of residence, and will provide a Form W-8BEN (or W-8BEN-E) directly to the Provider's accountant so that payments from the United States can be made correctly.`;
}

function liabilitySection(country: string): string {
  if (country === "DE") {
    return `Each Party is liable without limitation for damage caused intentionally or by gross negligence, for injury to life, body, or health, and where liability is mandatory by law. For slight negligence, each Party is liable only for breach of a material contractual obligation (Kardinalpflicht) and only for the damage typical for this type of contract and foreseeable at the time of contracting.

The Contractor indemnifies the Provider against third-party claims arising from the Contractor's breach of the warranties in this Agreement, in particular claims that a deliverable infringes third-party rights, subject to the standard above.`;
  }
  // Texas enforces B2B liability caps only where they are CONSPICUOUS and, to
  // cover a party's own negligence, say so expressly (the express negligence
  // doctrine). Hence the capitals — they are doing legal work, not shouting.
  return `NEITHER PARTY IS LIABLE TO THE OTHER FOR INDIRECT, INCIDENTAL, SPECIAL, PUNITIVE, OR CONSEQUENTIAL DAMAGES, OR FOR LOST PROFITS, ARISING OUT OF THIS AGREEMENT, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGES.

EXCEPT FOR THE CARVE-OUTS BELOW, EACH PARTY'S TOTAL LIABILITY UNDER THIS AGREEMENT — INCLUDING LIABILITY ARISING FROM THAT PARTY'S OWN NEGLIGENCE — IS LIMITED TO THE TOTAL FEES PAID TO THE CONTRACTOR UNDER THIS AGREEMENT IN THE TWELVE MONTHS PRECEDING THE CLAIM.

The cap above does not apply to: the Contractor's indemnity obligations in this section; damages caused by a Party's gross negligence or willful misconduct; or breach of the confidentiality or data-protection obligations of this Agreement.

The Contractor will defend and indemnify the Provider and its clients against any third-party claim that a deliverable infringes a copyright, trademark, patent, or trade secret, that the Contractor failed to hold a required licence for material incorporated into a deliverable, or that arises from the Contractor's breach of the confidentiality obligations of this Agreement.`;
}

function governingLawSection(country: string, providerLegalName: string): string {
  if (country === "US" || !country) {
    return `This Agreement is governed by the laws of the State of Texas, without regard to its conflict-of-laws rules. The Parties submit to the exclusive jurisdiction of the state and federal courts located in Texas for any dispute arising out of this Agreement. Before filing suit, the Parties will attempt in good faith to resolve the dispute by direct discussion for at least 30 days.`;
  }
  if (country === "DE") {
    return `This Agreement is governed by the laws of the State of Texas, United States, where ${providerLegalName} is organised, except that mandatory provisions of German law that protect the Contractor — including mandatory copyright, social-security, and consumer-protection rules — continue to apply and prevail where they conflict. The Parties will attempt in good faith to resolve any dispute by direct discussion for at least 30 days before commencing proceedings.`;
  }
  return `This Agreement is governed by the laws of the State of Texas, United States, without regard to its conflict-of-laws rules, except where mandatory law in the Contractor's country of residence provides otherwise. The Parties will attempt in good faith to resolve any dispute by direct discussion for at least 30 days before commencing proceedings.`;
}

function buildIcAgreement(opts: ContractorAgreementOptions): string {
  const {
    contractorName,
    company,
    country: rawCountry,
    contractorAddress,
    providerLegalName: rawProvider,
    providerAddress,
    services,
    compensation,
    paymentDays = 15,
    effectiveDate = new Date(),
    extraTerms,
  } = opts;

  const country = (rawCountry || "").toUpperCase();
  const providerLegalName = rawProvider?.trim() || DEFAULT_PROVIDER_LEGAL_NAME;
  const days = Math.min(Math.max(paymentDays, 1), 30);
  const section = sectionWriter();

  let out = `INDEPENDENT CONTRACTOR AGREEMENT

This Independent Contractor Agreement ("Agreement") is entered into as of ${fmtDate(effectiveDate)} by and between ${partyLine(providerLegalName, null, providerAddress)} ("Provider") and ${partyLine(contractorName, company, contractorAddress)} ("Contractor"). Together referred to as the "Parties."

This Agreement sets the terms under which the Contractor performs work for the Provider and for the Provider's clients. It applies to every engagement between the Parties unless a later written agreement says otherwise.

`;

  out += section(
    "Services",
    `The Contractor will perform the following services:

${services?.trim() || "Creative and technical production work assigned by the Provider from time to time — the specific deliverables, scope, and deadline for each engagement are agreed in writing (including by email or through the Provider's contractor portal) before work begins."}

Each engagement is accepted when the Contractor confirms scope and deadline in writing. The Contractor will deliver work in the agreed formats, with source files, and will not subcontract any part of the work without the Provider's prior written consent — and where consent is given, the Contractor remains responsible for the subcontractor's work and ensures the same obligations flow down.`
  );

  out += section("Independent Contractor Status", classificationSection(country));

  out += section(
    "Fees and Payment",
    `${compensation?.trim() ? `${compensation.trim()}\n\n` : ""}The Contractor invoices the Provider through the Provider's contractor portal, recording the invoice number, invoice date, amount, and the work covered. The Provider pays each correct and undisputed invoice within ${days} days of receipt, by the method agreed between the Parties.

Where the Provider disputes part of an invoice in good faith, it will notify the Contractor within 7 days and pay the undisputed part on the normal schedule. The Contractor bears their own business expenses; expenses are reimbursed only where the Provider approved them in writing in advance. Time-based work is recorded through the portal's hours log; those records are the reference for invoiced time.`
  );

  const ip = ipSection(country, "Contractor");
  out += section(ip.title, ip.body);

  out += section(
    "Third-Party Material and Licences",
    `The Contractor warrants that every font, stock asset, plugin, library, template, sound, and image incorporated into a deliverable is either original, properly licensed for commercial use by the Provider and its client, or open-source under a licence compatible with commercial distribution.

On delivery the Contractor provides a written list of third-party materials used, with the licence type and, where relevant, the licence key or purchase reference. The Contractor will not incorporate material under a copyleft licence that would require the Provider or its client to publish their own source code without flagging it in writing first.

Where the Contractor uses generative AI tools in producing a deliverable, the Contractor remains responsible for the result — including that it does not infringe third-party rights — and will disclose that use on request.`
  );

  out += section(
    "Confidentiality",
    `The Contractor will keep confidential all non-public information received from the Provider or its clients, including business plans, pricing, client lists, unreleased work, technical architecture, credentials, and personal data. Confidential information may be used only to perform this Agreement and may not be disclosed to anyone else without written consent.

The Contractor will store credentials securely, will not share access with anyone, and will return or securely delete confidential material within 14 days of the end of an engagement on request. This obligation survives termination indefinitely for trade secrets, and for five years for other confidential information. It does not cover information that is public through no fault of the Contractor, or that the Contractor must disclose by law.`
  );

  out += section(
    "Data Protection",
    `Where the Contractor handles personal data on behalf of the Provider or its clients, the Contractor acts only on the Provider's documented instructions, applies appropriate technical and organisational security measures, does not transfer the data outside the agreed regions, and will not engage a sub-processor without prior written consent.

The Contractor notifies the Provider without undue delay and in any case within 24 hours of becoming aware of any personal-data breach, and assists the Provider in meeting its own obligations under applicable data-protection law (including the GDPR and applicable US state privacy laws). Where required, the Parties will sign a separate data-processing agreement, which prevails over this section for the processing it covers.`
  );

  out += section(
    "Client Non-Solicitation",
    `During the term of this Agreement and for twelve months after its end, the Contractor will not directly solicit work from a client of the Provider that the Contractor was introduced to, or worked on, through the Provider — except with the Provider's written consent.

This clause does not restrict the Contractor's right to work in their field, to accept unsolicited approaches unconnected to the Provider's introduction, or to work for any other studio or client. Nothing in this Agreement is a non-compete.`
  );

  out += section(
    "Warranties",
    `The Contractor warrants that: the work is original except for properly licensed third-party material; the work does not infringe the rights of any third party; the Contractor has the right to enter into this Agreement and is not bound by a conflicting obligation; the work will be performed with the skill and care expected of a professional in the Contractor's field; and the Contractor holds any registration, permit, or insurance required to perform the work where they are based.

The Contractor will correct defects in a deliverable that are reported within 30 days of delivery and that stem from a failure to meet the agreed specification, at no additional charge.`
  );

  out += section(
    "Term and Termination",
    `This Agreement starts on the date above and continues until either Party terminates it with 14 days' written notice. Either Party may terminate immediately for a material breach that is not cured within 10 days of written notice.

On termination the Provider pays for all work accepted or in progress up to the termination date, and the Contractor delivers all work in progress, source files, and access credentials. The sections on rights in the work, confidentiality, warranties, indemnity, and governing law survive termination.`
  );

  out += section("Liability and Indemnity", liabilitySection(country));

  out += section(
    "Records and Compliance",
    `Invoices, logged hours, and signed documents are kept as legal records in the Provider's contractor portal and are not deleted on request; corrections are made by adding a new, timestamped record rather than editing the original.

Tax forms that carry a tax identification number (Form W-9, Form W-8BEN / W-8BEN-E) are sent by the Contractor directly to the Provider's accountant. The Provider records only that the form was completed and does not store the form or the number itself. The Contractor keeps their own copies of invoices and tax records for the period their law requires.`
  );

  out += section("Governing Law", governingLawSection(country, providerLegalName));

  out += section(
    "General",
    `This Agreement, together with the written scope agreed for each engagement, is the entire agreement between the Parties and replaces any prior understanding on the same subject. Changes must be in writing and signed by both Parties.

If any provision is held unenforceable, the rest remains in force and the unenforceable provision is replaced by an enforceable one that comes closest to its intent. Neither Party may assign this Agreement without the other's written consent, except that the Provider may assign it to a successor of its business. A failure to enforce a provision is not a waiver of it. Notices go to the email addresses the Parties use for day-to-day work.`
  );

  if (extraTerms?.trim()) {
    out += section("Additional Terms", extraTerms.trim());
  }

  return out + CLOSING;
}

// ─────────────────────────────────────────────────────────────────────────────
// Mutual NDA
// ─────────────────────────────────────────────────────────────────────────────

function buildNda(opts: ContractorAgreementOptions): string {
  const {
    contractorName,
    company,
    contractorAddress,
    providerLegalName: rawProvider,
    providerAddress,
    effectiveDate = new Date(),
    extraTerms,
    country: rawCountry,
  } = opts;
  const providerLegalName = rawProvider?.trim() || DEFAULT_PROVIDER_LEGAL_NAME;
  const country = (rawCountry || "").toUpperCase();
  const section = sectionWriter();

  let out = `MUTUAL NON-DISCLOSURE AGREEMENT

This Mutual Non-Disclosure Agreement ("Agreement") is entered into as of ${fmtDate(effectiveDate)} by and between ${partyLine(providerLegalName, null, providerAddress)} and ${partyLine(contractorName, company, contractorAddress)}. Together referred to as the "Parties." Each Party may act as the disclosing or the receiving Party.

The Parties wish to discuss a possible working relationship and will exchange confidential information for that purpose.

`;

  out += section(
    "Confidential Information",
    `"Confidential Information" means any non-public information disclosed by one Party to the other, in any form, that a reasonable person would understand to be confidential — including unreleased work, client names and briefs, pricing, business plans, technical architecture, credentials, personal data, and the existence and content of the Parties' discussions.

It does not include information that is public through no fault of the receiving Party, was already lawfully known to the receiving Party without a duty of confidence, is independently developed without use of the Confidential Information, or is lawfully received from a third party free to disclose it.`
  );

  out += section(
    "Obligations",
    `The receiving Party will use Confidential Information only to evaluate and carry out the possible working relationship, will protect it with at least the care it applies to its own confidential information, and will not disclose it to anyone except employees or contractors who need it and are bound by equivalent obligations.

Where disclosure is required by law or court order, the receiving Party will give the disclosing Party prompt notice where legally permitted, so that protection can be sought, and will disclose only what is required.`
  );

  out += section(
    "Term, Return, and Ownership",
    `This Agreement applies to information exchanged for two years from the date above. Confidentiality obligations last for five years from disclosure, and indefinitely for anything that qualifies as a trade secret${country === "DE" ? " or as a Geschäftsgeheimnis under the GeschGehG" : ""}.

On request, the receiving Party will return or securely delete Confidential Information, keeping only copies required by law or routine backup, which stay subject to this Agreement. Nothing here transfers ownership, grants a licence, or obliges either Party to enter into any further agreement.`
  );

  out += section(
    "General",
    `This Agreement is governed by the laws of the State of Texas, United States${country === "DE" ? ", save for mandatory provisions of German law that apply in the Contractor's favour" : ""}. Changes must be in writing and signed by both Parties. If any provision is unenforceable, the rest remains in force. Damages may not be an adequate remedy for a breach, and either Party may seek injunctive relief in addition to any other remedy.`
  );

  if (extraTerms?.trim()) {
    out += section("Additional Terms", extraTerms.trim());
  }

  return out + CLOSING;
}

// ─────────────────────────────────────────────────────────────────────────────
// Statement of Work
// ─────────────────────────────────────────────────────────────────────────────

function buildSow(opts: ContractorAgreementOptions): string {
  const {
    contractorName,
    company,
    contractorAddress,
    providerLegalName: rawProvider,
    providerAddress,
    services,
    compensation,
    paymentDays = 15,
    effectiveDate = new Date(),
    extraTerms,
  } = opts;
  const providerLegalName = rawProvider?.trim() || DEFAULT_PROVIDER_LEGAL_NAME;
  const days = Math.min(Math.max(paymentDays, 1), 30);
  const section = sectionWriter();

  let out = `STATEMENT OF WORK

This Statement of Work ("SOW") is entered into as of ${fmtDate(effectiveDate)} between ${partyLine(providerLegalName, null, providerAddress)} ("Provider") and ${partyLine(contractorName, company, contractorAddress)} ("Contractor").

This SOW is governed by the Independent Contractor Agreement between the Parties. Where this SOW and that agreement conflict, the Independent Contractor Agreement controls, except for scope, fee, and dates, which this SOW sets.

`;

  out += section(
    "Scope of This Engagement",
    services?.trim() ||
      "To be itemised: deliverables, formats, and the acceptance criteria for each. Anything not listed here is out of scope and needs a new SOW or a written change."
  );

  out += section(
    "Fee and Payment",
    `${compensation?.trim() || "Fee to be stated here, together with any milestone split."}

The Contractor invoices through the Provider's contractor portal. The Provider pays each correct and undisputed invoice within ${days} days of receipt. Expenses are reimbursed only where approved in writing in advance.`
  );

  out += section(
    "Schedule and Acceptance",
    `The Parties agree the delivery dates in writing before work starts. The Provider reviews each deliverable within 5 business days of delivery and either accepts it or gives written notice of what does not meet the agreed specification. Work not rejected within that window is treated as accepted.

Delays caused by late feedback, missing assets, or scope changes move the remaining dates by the length of the delay.`
  );

  out += section(
    "Rights and Confidentiality",
    "The rights in the work, confidentiality, data-protection, warranty, and liability terms of the Independent Contractor Agreement apply to everything produced under this SOW."
  );

  if (extraTerms?.trim()) {
    out += section("Additional Terms", extraTerms.trim());
  }

  return out + CLOSING;
}

// ─────────────────────────────────────────────────────────────────────────────
// Sales Partnership Agreement (referral / closing partners such as MBMedSolutions)
// ─────────────────────────────────────────────────────────────────────────────

const pct = (v: number) => `${Number.isInteger(v) ? v : v.toFixed(2)}%`;

function buildReferralPartnerAgreement(opts: ContractorAgreementOptions): string {
  const {
    contractorName,
    company,
    country: rawCountry,
    contractorAddress,
    providerLegalName: rawProvider,
    providerAddress,
    effectiveDate = new Date(),
    extraTerms,
  } = opts;
  const t: PartnerAgreementTerms = opts.partnerTerms || {
    partnerName: company || contractorName,
    rateProjectHandoff: 9,
    rateProjectClose: 18,
    rateBrandGuideHandoff: 5,
    rateBrandGuideClose: 10,
    ratePlan: 15,
    planMonths: 16,
    payoutDays: 30,
    territory: "the United States",
  };

  const country = (rawCountry || "US").toUpperCase();
  const providerLegalName = rawProvider?.trim() || DEFAULT_PROVIDER_LEGAL_NAME;
  const partnerEntity = t.partnerLegalName?.trim() || company || contractorName;
  const section = sectionWriter();

  let out = `SALES PARTNERSHIP AGREEMENT

This Sales Partnership Agreement ("Agreement") is entered into as of ${fmtDate(effectiveDate)} by and between ${partyLine(providerLegalName, null, providerAddress)} ("Blok Blok" or the "Provider") and ${partyLine(contractorName, partnerEntity, contractorAddress)} ("Partner"). Together referred to as the "Parties."

Blok Blok designs, builds and maintains websites and digital services. The Partner operates a sales organization and will introduce prospective clients to Blok Blok and, once approved, close sales of Blok Blok's services on Blok Blok's standard terms. This Agreement sets out how introductions are registered, how commissions are calculated and paid, and what each Party is responsible for.

`;

  out += section(
    "Relationship of the Parties",
    `The Parties are independent contractors. Nothing in this Agreement creates an employment, joint venture, franchise or agency relationship. The Partner has no authority to bind Blok Blok to any contract, price, scope, delivery date or guarantee, and will not represent otherwise. The Partner alone engages, manages, compensates and is responsible for its own sales representatives and appointment setters ("Partner Reps"). Blok Blok has no payment obligation to any Partner Rep.

This Agreement is non-exclusive. The Partner may represent other products and services, and Blok Blok may accept clients from any other source, provided neither Party uses the other's confidential information to do so.`
  );

  out += section(
    "Definitions",
    `"Registered Practice" means a prospective client that the Partner has registered through Blok Blok's partner portal under Section 3 and that Blok Blok has not already been in contact with.

"Handoff Close" means a sale to a Registered Practice where the Partner or a Partner Rep booked and qualified the sales call and Blok Blok conducted the close.

"Partner Close" means a sale to a Registered Practice closed by the Partner or by a Partner Rep that Blok Blok has approved in writing as a closer, using the contract and payment links generated through the partner portal.

"Project Fee" means the one-time fee for a website or similar project in Blok Blok's partner price list. "Brand Guide Fee" means the one-time fee for a brand strategy guide. "Plan Payment" means a monthly payment under one of Blok Blok's monthly plans.

"Eligible Receipts" means amounts actually received by Blok Blok from a Registered Practice, excluding sales and similar taxes and excluding Pass-Through Costs. "Pass-Through Costs" means hosting beyond what a package includes, domain registration, telephony, SMS, AI usage, advertising spend and any other third-party service billed at cost or billed directly to the client.`
  );

  out += section(
    "Registering a Practice",
    `The Partner registers each prospective client in Blok Blok's partner portal before Blok Blok has any contact with that practice. Registration records the practice name, contact details, the Partner Rep and the date. The first Party to register a practice holds it: a practice already known to Blok Blok, already a client, or already registered by another source does not qualify, and Blok Blok will say so at registration.

A registration is valid for twelve (12) months. If the practice has not signed a Blok Blok agreement within that period the registration lapses and the practice may be registered again by any party. Blok Blok may approve exceptions in writing.

No commission is earned on a client that contacts Blok Blok on its own, on an existing Blok Blok client, or on any sale that is not tied to a valid registration.`
  );

  out += section(
    "Pricing, Approved Closers and the Standard Agreement",
    `Blok Blok supplies the Partner with an approved price list, package descriptions and sales materials (the "Kit"), and will update the Kit in writing when prices or packages change. The Partner and Partner Reps present only the approved price list and inclusions and make no promises about search rankings, patient or customer volume, timelines or results beyond what the Kit states.

Blok Blok may approve the Partner and named Partner Reps as closers in writing and may withdraw that approval at any time. An approved closer may generate Blok Blok's standard Service Agreement and payment links for a Registered Practice through the partner portal. The Service Agreement is Blok Blok's unmodified standard form at list prices with a fifty percent (50%) deposit and fifty percent (50%) balance on completion; it may not be edited, discounted or supplemented by the Partner. Blok Blok reviews every contract generated through the portal and may void one before the client signs.

Every client contract is between Blok Blok and the client. All client payments are made to ${providerLegalName} only. The Partner never collects, holds or forwards client money.`
  );

  out += section(
    "Commission Schedule",
    `Blok Blok pays the Partner commission on Eligible Receipts from Registered Practices as follows.

(a) Project Fee, Handoff Close: ${pct(t.rateProjectHandoff)} of the Project Fee.

(b) Project Fee, Partner Close: ${pct(t.rateProjectClose)} of the first $15,000 of the Project Fee, ten percent (10%) of the portion from $15,000 to $50,000, and five percent (5%) of the portion above $50,000.

(c) Brand Guide Fee: ${pct(t.rateBrandGuideHandoff)} on a Handoff Close and ${pct(t.rateBrandGuideClose)} on a Partner Close. A brand guide sold together with a project is commissioned separately at these rates and is not added to the Project Fee for the purposes of (a) or (b).

(d) Plan Payments: ${pct(t.ratePlan)} of each Plan Payment received, whether the plan was a Handoff Close or a Partner Close, for ${t.planMonths} calendar months starting on the date of the first Plan Payment from that practice. The window runs once per practice: a plan upgrade, downgrade, pause or restart does not restart it, and no commission is due for a month in which no Plan Payment is received. A plan qualifies when it is the practice's first plan and is started at introduction or within ninety (90) days of the practice's project deposit.

The applicable Handoff or Partner Close rate for a practice is the one in force on the date the client signs. Commission percentages apply to Eligible Receipts only. Payment processing fees are Blok Blok's cost and are not deducted.`
  );

  out += section(
    "When Commission Is Earned and Paid",
    `Project and brand guide commission is earned in full when Blok Blok receives the client's deposit, so that the Partner can pay its Partner Reps promptly. Plan commission is earned when each Plan Payment is received.

Blok Blok pays earned commission within ${t.payoutDays} days of receiving the client payment that earned it, in United States dollars, by transfer to the Stripe Connect account the Partner opens for this purpose. Blok Blok may group payments into a single monthly payout provided every item is paid inside its ${t.payoutDays}-day window. Each payout is accompanied by a statement listing the practice, the payment that earned the commission, the rate and the amount. The Partner's own payout statements and payment history are available in the partner portal at any time.

Refunds, chargebacks and uncollected balances reduce commission in the same proportion. If a client is refunded, or the engagement ends before the balance is collected, the commission attributable to the refunded or uncollected amount is reversed and netted against the Partner's next payouts. If the Partner's net balance is negative, no payout is made until later commissions cover it. Blok Blok will not withhold commission on money it has received and kept.`
  );

  out += section(
    "Partner Responsibilities",
    `The Partner will:

(a) qualify each practice against the criteria Blok Blok provides before booking a call, and register the practice before the call;

(b) represent Blok Blok, its services and prices accurately, using only approved materials, and make no guarantee of results;

(c) conduct all outreach lawfully, including compliance with the Telephone Consumer Protection Act, the Telemarketing Sales Rule, CAN-SPAM, state telemarketing and do-not-call rules, and the rules of any platform used for outreach, and keep records sufficient to show compliance;

(d) not request, receive or store any protected health information or patient data in the course of this Agreement;

(e) employ or engage, train, supervise and pay its Partner Reps, and be solely responsible for their wages, commissions, taxes, benefits and conduct;

(f) keep its Stripe Connect account, tax information and contact details current.

The Partner will indemnify and hold harmless Blok Blok from any third-party claim, fine or loss arising from the Partner's or a Partner Rep's outreach practices, misrepresentations, or breach of this Agreement.`
  );

  out += section(
    "Blok Blok Responsibilities",
    `Blok Blok will: take booked and qualified sales calls promptly and professionally; keep the partner portal and Kit available and current; confirm in the portal when a Registered Practice signs and when each payment is received, and in any case within five (5) business days of a request; keep accurate records of Eligible Receipts and make the relevant payment details available to the Partner on request; deliver the services it sells to its clients under its own contracts; and pay commission as set out in Sections 5 and 6.`
  );

  out += section(
    "Taxes and Paperwork",
    `The Partner is responsible for all taxes on commission it receives. Before the first payout the Partner provides a completed IRS Form W-9 (or the applicable W-8 form) and completes Stripe Connect onboarding. Blok Blok will issue Form 1099-NEC where required. Each Party bears its own costs under this Agreement.`
  );

  out += section(
    "Term and Termination",
    `This Agreement starts on the effective date and runs for twelve (12) months, then renews automatically for successive twelve-month terms unless either Party gives thirty (30) days' written notice of non-renewal. Either Party may terminate this Agreement for convenience on thirty (30) days' written notice, and immediately on written notice if the other Party materially breaches this Agreement and does not cure the breach within fifteen (15) days of notice, or acts in a way that exposes the other Party to legal liability or reputational harm.

On termination: no new practices may be registered; a practice validly registered before termination that signs within ninety (90) days after termination still earns commission under this Agreement; plan commission continues to be paid for the remainder of each practice's ${t.planMonths}-month window; and all earned commission is paid in the ordinary course. Sections 1, 6 (as to amounts earned), 7, 11, 12 and 13 survive termination.`
  );

  out += section(
    "Confidentiality and Non-Circumvention",
    `Each Party will keep confidential the other Party's non-public business information, including client lists, pricing, commission terms, sales materials and performance data, use it only for this Agreement, and protect it with at least reasonable care, for the term of this Agreement and two (2) years after. The Partner will not, during the term and for twelve (12) months after, divert a Registered Practice or Blok Blok client to a competing website or digital services provider.

Blok Blok may name the Partner as a sales partner, and the Partner may describe itself as an authorized sales partner of Blok Blok, in each case subject to the other Party's reasonable brand guidelines and withdrawn on termination.`
  );

  out += section(
    "Limitation of Liability",
    `Neither Party is liable to the other for indirect, incidental, special, consequential or punitive damages, or for lost profits, arising out of this Agreement. Each Party's total liability under this Agreement is limited to the commission paid or payable under it in the twelve (12) months before the claim, except for a Party's indemnity obligations, breach of confidentiality, or liability that cannot be limited by law.`
  );

  out += section("Governing Law and Disputes", governingLawSection(country, providerLegalName).replace("the Contractor", "the Partner"));

  out += section(
    "General",
    `This Agreement, including its commission schedule, is the entire agreement between the Parties about its subject and replaces every earlier proposal, draft agreement, deck and discussion. Commission rates and the price list may be changed only by a written amendment signed by both Parties; a change applies to practices that sign after the change takes effect and never reduces commission already earned. Notices are given by email to the addresses each Party designates. Neither Party may assign this Agreement without the other's written consent, except to a successor of its business. If a provision is unenforceable the rest remains in effect. Signatures exchanged electronically are binding.`
  );

  if (extraTerms?.trim()) {
    out += section("Additional Terms", extraTerms.trim());
  }

  out += `
EXHIBIT A. COMMISSION SCHEDULE SUMMARY

Territory: ${t.territory}
Project fee, Handoff Close (Partner books, Blok Blok closes): ${pct(t.rateProjectHandoff)}
Project fee, Partner Close (approved Partner Rep closes): ${pct(t.rateProjectClose)} on the first $15,000, 10% from $15,000 to $50,000, 5% above $50,000
Brand strategy guide: ${pct(t.rateBrandGuideHandoff)} Handoff Close, ${pct(t.rateBrandGuideClose)} Partner Close
Monthly plans: ${pct(t.ratePlan)} of each plan payment received, ${t.planMonths} calendar months from the first plan payment
Earned: project and brand guide commission on the client's deposit; plan commission on each plan payment
Paid: within ${t.payoutDays} days of Blok Blok receiving the client payment, by Stripe Connect transfer, with a statement
Client terms: Blok Blok's standard Service Agreement at list price, 50% deposit, 50% on completion; all payments to ${providerLegalName}

`;

  out += `

ACKNOWLEDGMENT AND ACCEPTANCE

By signing below, both Parties acknowledge that they have read this Agreement in its entirety, understand its terms and conditions, and agree to be bound by them. Both Parties confirm that they have the authority to enter into this Agreement and that they do so voluntarily. An electronic signature captured with the signer's name, timestamp, and IP address has the same force as a handwritten one.

PROVIDER:
Name: ____________________
Date: ____________________

PARTNER:
Name: ____________________
Date: ____________________

`;

  return out;
}

/** Build the baseline body for a contractor agreement of the given kind. */
export function generateContractorAgreementBody(
  kind: ContractorContractKind,
  opts: ContractorAgreementOptions
): string {
  if (kind === "NDA") return buildNda(opts);
  if (kind === "SOW") return buildSow(opts);
  if (kind === "REFERRAL_PARTNER") return buildReferralPartnerAgreement(opts);
  return buildIcAgreement(opts);
}

export function defaultTitleForKind(kind: ContractorContractKind): string {
  return (
    CONTRACTOR_CONTRACT_KINDS.find((k) => k.key === kind)?.title || "Contractor Agreement"
  );
}
