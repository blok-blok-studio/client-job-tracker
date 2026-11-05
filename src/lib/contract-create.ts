import { extractContractBilling, type ExtractedBilling } from "@/lib/invoicing/contract-billing-extract";
import { CLIENT_PARTY_SELECT, clientPartyBlock, ensureClientPartyBlock, insertClientPartyBlock, missingPartyDetails } from "@/lib/client-party";
import { randomBytes, createHash } from "crypto";
import prisma from "@/lib/prisma";
import { generateContractBody, type PaymentMilestone, type PackageCustomization, type CustomLineItem } from "@/lib/contract-templates";
import { getCurrencyForCountry } from "@/lib/stripe";
import { generateAiContractBody } from "@/lib/contract-ai";
import { sendContract, type ContractSendResult } from "@/lib/contract-send";
import { contractTitle, generateClientAgreementBody } from "@/lib/client-agreement";

/**
 * Create (and optionally send) a client contract.
 *
 * Shared by the owner's contract route and the sales-partner portal so both
 * produce byte-for-byte the same kind of record: same hashing, same audit
 * trail, same payment-link math in sendContract(). The caller decides who is
 * allowed to call it and with which inputs; this function only builds.
 */

export class ContractCreateError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export interface StandardTemplateInput {
  kind: "NDA" | "SOCIAL_MEDIA";
  clientDescriptor?: string;
  extraTerms?: string;
  social?: {
    accounts: string;
    deliverables: string;
    alsoIncluded: string;
    monthlyFee: string;
    authorizedPersonnel: string;
  };
}

export interface CreateContractInput {
  /**
   * Refuse to draft until the client's legal details are complete (default).
   * Partner closes pass false: they generate the contract live on the call,
   * before the practice has onboarded, and get whatever is on file.
   */
  requireClientDetails?: boolean;
  clientId: string;
  packages: string[];
  addons: string[];
  customItems: CustomLineItem[];
  customTerms?: string;
  customPrompt?: string;
  packageCustomizations?: Record<string, PackageCustomization>;
  providerSignedName: string;
  providerSignatureData?: string | null;
  country: string;
  paymentSchedule?: PaymentMilestone[];
  skipPayment: boolean;
  draft: boolean;
  template?: StandardTemplateInput;
  /** Who is generating: shows in the audit trail and activity log */
  createdBy: string;
  /** Activity-log actor: "chase" for the team, "partner" for a sales-partner rep */
  actor: string;
  ipAddress: string | null;
  userAgent: string | null;
}

export interface CreateContractResult {
  id: string;
  token: string;
  kind: string;
  title: string;
  status: "DRAFT" | "PENDING";
  createdAt: Date;
  contractBody: string;
  isDraft: boolean;
  aiError: string | null;
  paymentLinks: ContractSendResult["paymentLinks"];
  paymentLinkError: string | null;
  /** Fees read from a prompt-only contract (null when none were found) */
  billing?: ExtractedBilling | null;
  billingError?: string | null;
}

export async function createClientContract(input: CreateContractInput): Promise<CreateContractResult> {
  const client = await prisma.client.findUnique({
    where: { id: input.clientId },
    select: { ...CLIENT_PARTY_SELECT, stripeCustomerId: true },
  });
  if (!client) throw new ContractCreateError("Client not found", 404);

  // Every contract names the client in full: legal name, address, tax ID, email.
  // They come from the onboarding form (or Chase fills them in on the contract screen).
  const missingDetails = missingPartyDetails(client);
  if (missingDetails.length > 0 && input.requireClientDetails !== false) {
    throw new ContractCreateError(
      `Client details missing: ${missingDetails.join(", ")}. Send the onboarding form or fill them in first.`,
      409
    );
  }
  const partyBlock = clientPartyBlock(client);

  // Validate payment schedule adds up to 100%
  if (input.paymentSchedule && input.paymentSchedule.length > 0) {
    const totalPercent = input.paymentSchedule.reduce((s, m) => s + m.percent, 0);
    if (totalPercent !== 100) {
      throw new ContractCreateError(`Payment schedule must add up to 100% (got ${totalPercent}%)`);
    }
  }

  if (input.template?.kind === "SOCIAL_MEDIA" && !input.template.social) {
    throw new ContractCreateError(
      "The Social Media agreement needs its accounts, deliverables, fee and people filled in"
    );
  }

  const token = randomBytes(16).toString("base64url");
  const contractCurrency = getCurrencyForCountry(input.country);

  // Fetch live USD→EUR rate for non-USD contracts
  let exchangeRate: number | undefined;
  if (contractCurrency === "eur") {
    try {
      const rateRes = await fetch("https://api.frankfurter.app/latest?from=USD&to=EUR");
      const rateData = await rateRes.json();
      if (rateData.rates?.EUR) exchangeRate = rateData.rates.EUR;
    } catch {
      exchangeRate = 0.92; // fallback
    }
  }

  const kind = input.template?.kind || "SERVICE_AGREEMENT";
  const title = contractTitle(kind);

  const baselineBody = input.template
    ? generateClientAgreementBody(input.template.kind, {
        clientName: client.name,
        company: client.company,
        clientDescriptor: input.template.clientDescriptor,
        social: input.template.social,
        extraTerms: input.template.extraTerms,
      })
    : generateContractBody(
        client.name,
        client.company,
        input.packages,
        input.addons,
        input.customItems,
        input.customTerms,
        input.packageCustomizations,
        input.paymentSchedule,
        contractCurrency,
        exchangeRate
      );

  // If a custom prompt is provided, run the baseline through AI drafting (figures stay locked).
  // Falls back to the baseline body on any AI failure.
  const baselineWithParty = insertClientPartyBlock(baselineBody, partyBlock);
  let contractBody = baselineWithParty;
  let aiError: string | null = null;
  if (!input.template && input.customPrompt && input.customPrompt.trim()) {
    const ai = await generateAiContractBody({
      baselineBody: baselineWithParty,
      customPrompt: input.customPrompt.trim(),
      clientName: client.name,
      companyName: client.company,
      clientDetails: partyBlock,
    });
    contractBody = ensureClientPartyBlock(ai.body, partyBlock);
    if (!ai.usedAi) aiError = ai.error || "AI drafting unavailable — used baseline contract";
  }

  // Prompt-only contracts carry their fees in the text: read them out so the
  // invoices can be prepared when the contract goes out (Chase checks them in
  // the review step; nothing is issued before the client signs and he says yes).
  let billing: ExtractedBilling | null = null;
  let billingError: string | null = null;
  if (!input.template && input.customPrompt?.trim() && !input.packages.length && !(input.customItems || []).length) {
    const r = await extractContractBilling(input.customPrompt, contractBody);
    if (r.ok) billing = r.billing;
    else billingError = r.error;
  }

  // SHA-256 hash of the contract body for tamper detection
  const documentHash = createHash("sha256").update(contractBody).digest("hex");
  const providerIp = input.ipAddress || "unknown";
  const providerUa = input.userAgent || "unknown";

  const contract = await prisma.contractSignature.create({
    data: {
      clientId: client.id,
      token,
      kind,
      title,
      contractBody,
      documentHash,
      status: input.draft ? "DRAFT" : "PENDING",
      providerSignedName: input.providerSignedName,
      providerSignatureData: input.providerSignatureData || null,
      providerSignedAt: new Date(),
      providerIpAddress: providerIp,
      providerUserAgent: providerUa,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      // Persist the full generation params so the contract can be sent later (draft → send)
      selectedPackages: {
        packages: input.packages,
        addons: input.addons || [],
        customItems: billing ? billing.customItems : input.customItems || [],
        packageCustomizations: input.packageCustomizations || {},
        country: input.country,
        paymentSchedule: billing ? billing.paymentSchedule : input.paymentSchedule || null,
        // Standard documents never create payment links; prompt contracts with
        // fees found in the text prepare bank invoices
        skipPayment: input.template ? true : billing ? false : input.skipPayment,
        ...(billing ? { billingCurrency: billing.currency, billingSource: "ai" } : {}),
        exchangeRate: exchangeRate ?? null,
      },
    },
  });

  await prisma.contractAuditLog.createMany({
    data: [
      {
        contractId: contract.id,
        event: "created",
        actor: "system",
        ipAddress: providerIp,
        userAgent: providerUa,
        metadata: JSON.stringify({ documentHash, kind, title, createdBy: input.createdBy }),
      },
      {
        contractId: contract.id,
        event: "provider_signed",
        actor: "provider",
        ipAddress: providerIp,
        userAgent: providerUa,
        metadata: JSON.stringify({ signedName: input.providerSignedName, signedBy: input.createdBy, documentHash }),
      },
    ],
  });

  await prisma.activityLog.create({
    data: {
      clientId: client.id,
      actor: input.actor,
      action: "contract_generated",
      details: `${title} generated and counter-signed by ${input.providerSignedName} for ${client.name}${
        input.actor === "partner" ? ` (via ${input.createdBy})` : ""
      }`,
    },
  });

  // Draft mode: create the contract but DON'T send anything yet.
  let paymentLinks: ContractSendResult["paymentLinks"] = [];
  let paymentLinkError: string | null = null;

  if (!input.draft) {
    const sendResult = await sendContract(contract.id, {
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
      sentBy: input.createdBy,
    });
    paymentLinks = sendResult.paymentLinks;
    paymentLinkError = sendResult.paymentLinkError;
  }

  return {
    id: contract.id,
    token: contract.token,
    kind,
    title,
    status: input.draft ? "DRAFT" : "PENDING",
    createdAt: contract.createdAt,
    contractBody,
    isDraft: input.draft,
    aiError,
    paymentLinks,
    paymentLinkError,
    billing,
    billingError,
  };
}
