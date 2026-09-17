/**
 * Fill-in templates for the standard documents sent to clients for signature:
 * the Mutual NDA and the Social Media Management Services Agreement. These sit
 * next to the AI-drafted custom contract; all three are ContractSignature rows
 * and share the signing link, PDF, certificate and /contracts archive.
 *
 * The Social Media agreement is Amir Gomez's September 2026 agreement with the
 * variable parts (accounts, deliverables, fee, people) lifted into fields. It
 * leans on the Mutual NDA for confidentiality, credentials and the return of
 * client material, so the NDA goes out first or alongside it.
 *
 * Not reviewed by a lawyer yet. Wording rules kept on purpose:
 *  - plain "SECTION n. TITLE" text, which the signing page and the PDF renderer
 *    both lay out, ending in the shared ACKNOWLEDGMENT AND ACCEPTANCE block
 *  - the liability cap is IN CAPITALS: Texas enforces a limit only where it is
 *    conspicuous
 *  - ASCII punctuation only: the PDF font cannot draw curly quotes or dashes
 */

export type ClientAgreementKind = "NDA" | "SOCIAL_MEDIA";

/** kind stored on ContractSignature; SERVICE_AGREEMENT is the AI-drafted custom contract */
export type ContractKind = "SERVICE_AGREEMENT" | ClientAgreementKind;

export const CLIENT_AGREEMENT_KINDS: {
  key: ClientAgreementKind;
  label: string;
  title: string;
  blurb: string;
}[] = [
  {
    key: "NDA",
    label: "Mutual NDA",
    title: "Mutual Non-Disclosure Agreement",
    blurb: "Confidentiality, account credentials, unpublished content, and return of client material. Send before or with a services agreement.",
  },
  {
    key: "SOCIAL_MEDIA",
    label: "Social Media Agreement",
    title: "Social Media Management Services Agreement",
    blurb: "Monthly social media management: accounts, deliverables, flat monthly fee, approvals, ownership, month to month.",
  },
];

export const SERVICE_AGREEMENT_TITLE = "Service Agreement";

export function contractTitle(kind: string | null | undefined): string {
  return CLIENT_AGREEMENT_KINDS.find((k) => k.key === kind)?.title || SERVICE_AGREEMENT_TITLE;
}

export const PROVIDER_LEGAL_NAME = "Blok Blok Studio LLC";
const PROVIDER_LINE = `${PROVIDER_LEGAL_NAME}, a Texas limited liability company`;

export interface SocialMediaFields {
  /** One account per line, e.g. "Instagram: @handle" */
  accounts: string;
  deliverables: string;
  alsoIncluded: string;
  /** Written exactly as typed, e.g. "USD $200.00". Never computed or converted. */
  monthlyFee: string;
  /** Named people with access to the client's accounts */
  authorizedPersonnel: string;
}

export const SOCIAL_MEDIA_DEFAULTS: Omit<SocialMediaFields, "accounts" | "monthlyFee"> = {
  deliverables:
    "Six (6) short-form videos per month (Reels, with cross-posting to Facebook), including scripting, editing, captions, hashtags, scheduling, and publishing.",
  alsoIncluded:
    "Content strategy and content pillars, a monthly content calendar, review and approval workflow via the Blok Blok client portal and the Parties' shared group chat, and periodic performance reporting.",
  authorizedPersonnel: "Chase Haynes (Founder and CEO) and Bridget Perdomo (contractor, account manager)",
};

export interface ClientAgreementOptions {
  clientName: string;
  company?: string | null;
  /** How the client is described after their name, e.g. "an individual residing in Virginia" */
  clientDescriptor?: string | null;
  effectiveDate?: Date;
  social?: SocialMediaFields;
  /** Appended verbatim as the final numbered section */
  extraTerms?: string | null;
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
}

function clientLine(opts: ClientAgreementOptions): string {
  const who = opts.company?.trim() ? `${opts.clientName} / ${opts.company.trim()}` : opts.clientName;
  const descriptor = opts.clientDescriptor?.trim();
  return descriptor ? `${who}, ${descriptor}` : who;
}

/** Section numbering that stays correct when optional sections drop out. */
function sectionWriter() {
  let n = 0;
  return (title: string, body: string) => {
    n += 1;
    return `SECTION ${n}. ${title.toUpperCase()}\n\n${body.trim()}\n\n`;
  };
}

function bullets(text: string): string {
  return text
    .split("\n")
    .map((l) => l.trim().replace(/^[-•]\s*/, ""))
    .filter(Boolean)
    .map((l) => `- ${l}`)
    .join("\n");
}

const CLOSING = `
ACKNOWLEDGMENT AND ACCEPTANCE

By signing below, both Parties acknowledge that they have read this Agreement in its entirety, understand its terms and conditions, and agree to be bound by them. Both Parties confirm that they have the authority to enter into this Agreement and that they do so voluntarily. Each Party agrees to sign and receive this Agreement electronically. An electronic signature captured with the signer's name, the date and time, and the signer's IP address has the same force as a handwritten one.

PROVIDER:
Name: ____________________
Date: ____________________

CLIENT:
Name: ____________________
Date: ____________________

`;

// ─────────────────────────────────────────────────────────────────────────────
// Mutual NDA (client version)
// ─────────────────────────────────────────────────────────────────────────────

function buildClientNda(opts: ClientAgreementOptions): string {
  const effectiveDate = opts.effectiveDate || new Date();
  const section = sectionWriter();

  let out = `MUTUAL NON-DISCLOSURE AGREEMENT

This Mutual Non-Disclosure Agreement ("Agreement") is entered into as of ${fmtDate(effectiveDate)} by and between ${PROVIDER_LINE} ("Blok Blok"), and ${clientLine(opts)} ("Client"). Blok Blok and Client are each a "Party" and together the "Parties." Each Party may act as the disclosing or the receiving Party.

The Parties are discussing, or have entered into, an arrangement under which Blok Blok provides creative, marketing, or software services to Client (the "Services"), and will exchange confidential information for that purpose.

`;

  out += section(
    "Confidential Information",
    `"Confidential Information" means any non-public information disclosed by one Party to the other, in any form, that a reasonable person would understand to be confidential. It includes:

- Account logins, passwords, access tokens, recovery details, and any other credentials ("Credentials")
- Unpublished content, including raw footage, voice notes, photos, scripts, drafts, and content calendars
- Business plans, customer and follower data, analytics, pricing, and financial information
- Personal data about either Party or third parties
- Blok Blok's templates, frameworks, tools, software, and methods
- The terms of the Parties' commercial arrangements

It does not include information that is public through no fault of the receiving Party, was already lawfully known to the receiving Party without a duty of confidence, is independently developed without use of the Confidential Information, or is lawfully received from a third party free to disclose it. Content stops being confidential once it is published with Client's approval.`
  );

  out += section(
    "Obligations",
    `The receiving Party will use Confidential Information only to discuss and perform the Services, will protect it with at least the care it applies to its own confidential information and no less than reasonable care, and will not disclose it to anyone except its employees and contractors who need it for the Services and are bound by written confidentiality obligations at least as strict as this Agreement. Each Party is responsible for the acts of the people it gives access to.

Where disclosure is required by law or court order, the receiving Party will give the disclosing Party prompt notice where legally permitted, so that protection can be sought, and will disclose only what is required.`
  );

  out += section(
    "Credentials and Account Access",
    `Where a platform allows it, access to Client's accounts is given through partner or role-based access rather than shared passwords. Where Credentials are shared, Blok Blok will store them in an encrypted credential store, limit access to the named people working on Client's account, never send them in plain text to anyone outside that group, and never change passwords, email, phone, or recovery settings without Client's consent.

Each Party will tell the other promptly if it learns of or suspects unauthorized access to Credentials or Confidential Information, and will cooperate in containing it.`
  );

  out += section(
    "Term, Return, and Deletion",
    `This Agreement applies to information exchanged from the date above for as long as the Parties work together or discuss doing so. Confidentiality obligations last for five (5) years after the Services end, for as long as they remain valid for Credentials, and indefinitely for anything that qualifies as a trade secret.

When the Services end, or earlier on written request, the receiving Party will within thirty (30) days return or securely delete the other Party's Confidential Information, including Client's raw footage, voice notes, photos, and other source material, and Blok Blok will remove its access to Client's accounts and delete stored Credentials. A Party may keep copies it is required to keep by law and copies in routine backups, which stay subject to this Agreement, and Blok Blok may keep published work for portfolio use where Client has allowed it.

Nothing in this Agreement transfers ownership of any information, grants a license, or obliges either Party to enter into any further agreement.`
  );

  out += section(
    "General",
    `This Agreement is governed by the laws of the State of Texas, without regard to its conflict-of-law rules. Changes must be in writing and agreed by both Parties. If any provision is unenforceable, the rest remains in force. A Party's failure to enforce a term is not a waiver of it. Damages may not be an adequate remedy for a breach, and either Party may seek injunctive relief in addition to any other remedy.`
  );

  if (opts.extraTerms?.trim()) {
    out += section("Additional Terms", opts.extraTerms.trim());
  }

  return out + CLOSING;
}

// ─────────────────────────────────────────────────────────────────────────────
// Social Media Management Services Agreement
// ─────────────────────────────────────────────────────────────────────────────

function buildSocialMedia(opts: ClientAgreementOptions): string {
  const effectiveDate = opts.effectiveDate || new Date();
  const f = opts.social;
  if (!f) throw new Error("Social Media agreement needs its fields");
  const fee = f.monthlyFee.trim();
  const section = sectionWriter();

  let out = `SOCIAL MEDIA MANAGEMENT SERVICES AGREEMENT

This Social Media Management Services Agreement ("Agreement") is entered into as of ${fmtDate(effectiveDate)} (the "Effective Date") between ${PROVIDER_LINE} ("Blok Blok"), and ${clientLine(opts)} ("Client"). Blok Blok and Client are each a "Party" and together the "Parties."

`;

  out += section(
    "Key Terms",
    `Accounts managed (together, the "Accounts"). Additional platforms may be added by written agreement:
${bullets(f.accounts)}

Monthly deliverables: ${f.deliverables.trim()}

Also included: ${f.alsoIncluded.trim()}

Monthly fee: ${fee} per month, flat.

Billing: Invoiced monthly in advance. Due within seven (7) days of the invoice date.

Term: Ongoing, month to month, from the Effective Date until ended under the Term and Termination section.

Governing law: Texas`
  );

  out += section(
    "Services",
    `Blok Blok will provide the following services for the Accounts (the "Services"):

- Strategy. Define and maintain content pillars, tone, and a posting plan aligned with Client's goals, reviewed together roughly every two to three months.
- Scripting and production. Write scripts, hooks, on-screen text, and captions; edit Client-supplied footage and voice notes into finished content; add music and text overlays.
- Publishing. Schedule and post approved content to the Accounts, including via the Blok Blok client portal or the platform's own business tools.
- Reporting. Share performance insights and recommendations on a regular basis.

Work outside this scope (for example paid advertising, additional platforms, community management or DM replies, photography or on-site filming, website work, or more than the monthly deliverables listed in the Key Terms) is not included and will be quoted separately.`
  );

  out += section(
    "Client Responsibilities",
    `Client agrees to:

- Supply raw footage, voice notes, photos, and other source material on a rolling basis, and respond to requests for more material within a reasonable time. Blok Blok's deliverable count depends on Client supplying enough usable material.
- Review and approve or request changes to drafts within five (5) business days of delivery. Blok Blok will not publish content Client has not approved.
- Grant and maintain the account access described in the Account Access and Authorization section.
- Make sure Client has the right to use anything Client supplies, including music, footage of other people, logos, and third-party content.
- Keep Blok Blok informed of any changes to Client's goals, branding, or business that affect the content.`
  );

  out += section(
    "Account Access and Authorization",
    `Client authorizes Blok Blok, including its contractors working under Blok Blok's supervision, to access and post to the Accounts for the purpose of performing the Services. Where the platform allows it, access will be granted through partner or role-based access (such as Meta Business Suite) rather than shared passwords.

Authorized personnel. As of the Effective Date, the Blok Blok personnel authorized to access the Accounts are ${f.authorizedPersonnel.trim()}. Each is bound to Blok Blok by written confidentiality obligations at least as strict as the Parties' Mutual Non-Disclosure Agreement. Blok Blok will notify Client in writing before adding any other person, and will remove a person's access within seven (7) days of that person leaving Blok Blok or the Client engagement. Blok Blok is responsible for the acts of its authorized personnel in the Accounts.

Blok Blok will:

- Use the Accounts only to perform the Services
- Not change passwords, email, phone, or recovery settings without Client's consent
- Not delete existing content, block or message followers, or run paid promotions without Client's written approval
- Remove its access within fourteen (14) days after this Agreement ends

Client remains the owner of the Accounts at all times. Client is responsible for keeping the Accounts in good standing with each platform's terms, and for any actions Client or third parties take in the Accounts.`
  );

  out += section(
    "Fees and Payment",
    `Client will pay Blok Blok ${fee} per month for the Services. Blok Blok will invoice at the start of each monthly period, and payment is due within seven (7) days of the invoice date by the payment method Blok Blok provides.

If an invoice is more than fourteen (14) days past due, Blok Blok may pause the Services until it is paid. Amounts unpaid more than thirty (30) days may accrue a late charge of 1.5% per month or the maximum allowed by law, whichever is lower.

Blok Blok may change the monthly fee with at least thirty (30) days' written notice. Fees are non-refundable once the monthly period has started, except as described in the Term and Termination section.`
  );

  out += section(
    "Approval Process",
    `Blok Blok will deliver drafts through the client portal or the Parties' shared group chat. Client may approve or request changes. Each deliverable includes up to two (2) rounds of revisions; further revisions may be billed at Blok Blok's then-current hourly rate with Client's prior approval.

Approval in the shared group chat, by email, or in the client portal counts as written approval. Content Client has approved is published as approved; Client is responsible for the accuracy of claims and statements in approved content.`
  );

  out += section(
    "Ownership and Rights",
    `Client content. Client owns all footage, voice notes, photos, and other material Client supplies ("Client Materials"). Client grants Blok Blok a non-exclusive license to use, edit, and adapt Client Materials to perform the Services.

Finished deliverables. On payment of the fees for the month in which a deliverable is created, Client owns the final published videos, captions, and scripts produced for the Accounts ("Deliverables"). Until then, Blok Blok retains ownership.

Blok Blok materials. Blok Blok retains ownership of its templates, editing styles, content frameworks, hook formulas, tools, portals, software, and general know-how ("Blok Blok Materials"), including any that are used in the Deliverables. Blok Blok grants Client a perpetual license to use Blok Blok Materials only as embedded in the Deliverables.

Portfolio use. Client grants Blok Blok a non-exclusive, perpetual license to display published Deliverables, Account results, and Client's name and handle in Blok Blok's portfolio, website, social media, case studies, and pitches. Client may withdraw this permission for future use with written notice.

Name and likeness. Client grants Blok Blok permission to use Client's name, image, voice, and likeness as they appear in Client Materials for the purpose of creating and publishing the Deliverables, and for portfolio use as described above.`
  );

  out += section(
    "No Guarantee of Results",
    `Social media platforms control their own algorithms, policies, and features. Blok Blok will perform the Services with professional skill and care but does not guarantee any specific number of followers, views, engagement, leads, sales, or other outcome. Blok Blok is not responsible for platform outages, policy changes, content removals, shadow bans, account restrictions, or other platform actions that are not caused by Blok Blok's breach of this Agreement.`
  );

  out += section(
    "Independent Contractor",
    `Blok Blok is an independent contractor, not an employee, partner, or agent of Client. Blok Blok controls how the Services are performed and may use its own employees and contractors, and is responsible for them. Nothing in this Agreement creates a partnership or joint venture.`
  );

  out += section(
    "Term and Termination",
    `This Agreement runs month to month from the Effective Date. Either Party may end it for any reason with thirty (30) days' written notice (email or the shared group chat counts). Either Party may end it immediately if the other Party materially breaches this Agreement and does not fix the breach within ten (10) days of written notice.

On termination:

- Client pays for Services performed through the end of the notice period
- Blok Blok delivers any completed and paid-for Deliverables not yet handed over
- Blok Blok removes its access to the Accounts and returns or deletes Client Materials as described in the Parties' Mutual Non-Disclosure Agreement
- The Ownership and Rights, No Guarantee of Results, Confidentiality, Indemnity and Limitation of Liability, and General sections survive`
  );

  out += section(
    "Confidentiality",
    `The Parties' Mutual Non-Disclosure Agreement governs confidential information, credentials, and unpublished content exchanged under this Agreement and is incorporated by reference.`
  );

  out += section(
    "Indemnity and Limitation of Liability",
    `Client indemnity. Client will defend and hold Blok Blok harmless from third-party claims arising from Client Materials, from statements or claims in content Client approved, or from Client's products, services, or business.

Blok Blok indemnity. Blok Blok will defend and hold Client harmless from third-party claims that Blok Blok Materials, as delivered and used as intended, infringe a third party's intellectual property.

CAP. EXCEPT FOR INDEMNITY OBLIGATIONS, BREACH OF CONFIDENTIALITY, OR WILLFUL MISCONDUCT, EACH PARTY'S TOTAL LIABILITY UNDER THIS AGREEMENT IS LIMITED TO THE FEES PAID BY CLIENT IN THE THREE (3) MONTHS BEFORE THE CLAIM AROSE. NEITHER PARTY IS LIABLE FOR INDIRECT, INCIDENTAL, OR CONSEQUENTIAL DAMAGES, INCLUDING LOST PROFITS, LOST FOLLOWERS, OR LOST BUSINESS.`
  );

  out += section(
    "General",
    `Governing law. This Agreement is governed by the laws of the State of Texas, without regard to its conflict-of-law rules. The Parties will first try in good faith to resolve any dispute directly before taking legal action.

Entire agreement. This Agreement, together with the Mutual Non-Disclosure Agreement, is the complete agreement between the Parties on the Services and replaces any earlier understanding. Changes must be in writing and agreed by both Parties (email counts).

Notices. Notices may be sent by email to the address each Party uses with the other, or in the Parties' shared group chat.

Severability and waiver. If any part of this Agreement is unenforceable, the rest stays in effect. A Party's failure to enforce a term is not a waiver of it.

Assignment. Neither Party may assign this Agreement without the other's written consent, except to a successor of its business.

Counterparts and e-signatures. This Agreement may be signed in counterparts and electronically through Blok Blok's signing portal, and each counts as an original.`
  );

  if (opts.extraTerms?.trim()) {
    out += section("Additional Terms", opts.extraTerms.trim());
  }

  return out + CLOSING;
}

/** Build the body for a client agreement of the given kind. */
export function generateClientAgreementBody(kind: ClientAgreementKind, opts: ClientAgreementOptions): string {
  const body = kind === "NDA" ? buildClientNda(opts) : buildSocialMedia(opts);
  // The PDF font is WinAnsi-only: keep pasted field text from breaking a render
  return body
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...");
}
