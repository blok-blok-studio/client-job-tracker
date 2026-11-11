import { randomBytes, createHash } from "crypto";
import prisma from "@/lib/prisma";
import { extractContractBilling, type ExtractedBilling } from "@/lib/invoicing/contract-billing-extract";
import { generateAiContractBody } from "@/lib/contract-ai";
import { CLIENT_PARTY_SELECT, clientPartyBlock, ensureClientPartyBlock } from "@/lib/client-party";

/**
 * Re-editing contracts instead of starting over.
 *
 * - Drafts are edited in place: by hand (new text) or by asking the AI for a change.
 *   Nothing has gone to the client yet, so the same draft keeps its id and link.
 * - Anything already sent, signed or expired is never touched (signed = legal record,
 *   sent = the client may have read it). "Edit a copy" makes a new draft from it instead.
 *
 * Every edit re-hashes the text and re-stamps Chase's counter-signature on the new
 * version, so the audit trail always shows exactly which text he approved.
 */

export class ContractEditError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

/** Fee summary the review screen shows, read from a contract's stored params. */
export function contractBillingView(selectedPackages: unknown) {
  const sp = (selectedPackages || {}) as Record<string, unknown>;
  return typeof sp.billingCurrency === "string" && Array.isArray(sp.customItems)
    ? { currency: sp.billingCurrency, customItems: sp.customItems, paymentSchedule: Array.isArray(sp.paymentSchedule) ? sp.paymentSchedule : null }
    : null;
}

/** Prompt-only service agreements carry their fees in the text: re-read them after a change. */
function readsFeesFromText(kind: string, selectedPackages: unknown): boolean {
  if (kind !== "SERVICE_AGREEMENT") return false;
  const sp = (selectedPackages || {}) as Record<string, unknown>;
  const packages = Array.isArray(sp.packages) ? sp.packages : [];
  return packages.length === 0 && (sp.billingSource === "ai" || !Array.isArray(sp.customItems) || sp.customItems.length === 0);
}

function withBilling(selectedPackages: unknown, billing: ExtractedBilling | null) {
  const sp = { ...((selectedPackages || {}) as Record<string, unknown>) };
  delete sp.billingCurrency;
  delete sp.billingSource;
  return {
    ...sp,
    customItems: billing ? billing.customItems : [],
    paymentSchedule: billing ? billing.paymentSchedule : null,
    skipPayment: !billing,
    ...(billing ? { billingCurrency: billing.currency, billingSource: "ai" } : {}),
  };
}

export async function editDraftContract(input: {
  clientId: string;
  contractId: string;
  /** Replace the text with this (hand edit) */
  body?: string;
  /** Or: ask the AI to make this change to the current text */
  instructions?: string;
  editedBy: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}) {
  const contract = await prisma.contractSignature.findFirst({
    where: { id: input.contractId, clientId: input.clientId },
    select: { id: true, kind: true, title: true, status: true, contractBody: true, documentHash: true, providerSignedName: true, selectedPackages: true },
  });
  if (!contract) throw new ContractEditError("Contract not found", 404);
  if (contract.status !== "DRAFT") {
    throw new ContractEditError("Only drafts can be edited. Use \"Edit a copy\" to make a new draft from this one.", 409);
  }

  let newBody: string;
  const mode = input.instructions ? "ai" : "manual";
  if (input.instructions) {
    const client = await prisma.client.findUnique({ where: { id: input.clientId }, select: CLIENT_PARTY_SELECT });
    if (!client) throw new ContractEditError("Client not found", 404);
    const partyBlock = clientPartyBlock(client);
    const ai = await generateAiContractBody({
      baselineBody: contract.contractBody,
      customPrompt: `This contract is already written. Make ONLY the change asked for below and keep every other word, number and section exactly as it is.\n\nCHANGE REQUESTED:\n${input.instructions.trim()}`,
      clientName: client.name,
      companyName: client.company,
      clientDetails: partyBlock,
    });
    // On an edit, a silent fallback would look like "nothing changed": say so instead
    if (!ai.usedAi) throw new ContractEditError(`The AI could not make the change: ${ai.error || "unavailable"}. The draft was not changed.`, 502);
    newBody = ensureClientPartyBlock(ai.body, partyBlock);
  } else {
    newBody = (input.body || "").replace(/\r\n/g, "\n");
  }

  if (!newBody.trim()) throw new ContractEditError("The contract text can't be empty");
  if (newBody === contract.contractBody) {
    throw new ContractEditError(mode === "ai" ? "The AI returned the same text. Try wording the change differently." : "Nothing changed");
  }

  // Fees live in the text for prompt contracts: re-read them so the invoices match the new wording
  let selectedPackages = contract.selectedPackages as object | null;
  let billingError: string | null = null;
  if (readsFeesFromText(contract.kind, contract.selectedPackages)) {
    const r = await extractContractBilling(input.instructions || "", newBody);
    if (r.ok) selectedPackages = withBilling(contract.selectedPackages, r.billing);
    else billingError = `${r.error}. The fees below are from before this edit, check them before sending.`;
  }

  const documentHash = createHash("sha256").update(newBody).digest("hex");
  const ip = input.ipAddress || "unknown";
  const ua = input.userAgent || "unknown";

  // Conditional write: two tabs saving at once can't silently overwrite each other
  const updated = await prisma.contractSignature.updateMany({
    where: { id: contract.id, status: "DRAFT", documentHash: contract.documentHash },
    data: {
      contractBody: newBody,
      documentHash,
      selectedPackages: selectedPackages ?? undefined,
      providerSignedAt: new Date(),
      providerIpAddress: ip,
      providerUserAgent: ua,
    },
  });
  if (updated.count === 0) throw new ContractEditError("This draft changed somewhere else. Close it and open it again.", 409);

  await prisma.contractAuditLog.createMany({
    data: [
      {
        contractId: contract.id,
        event: "edited",
        actor: "provider",
        ipAddress: ip,
        userAgent: ua,
        metadata: JSON.stringify({ mode, previousHash: contract.documentHash, documentHash, editedBy: input.editedBy, instructions: input.instructions?.slice(0, 2000) }),
      },
      {
        contractId: contract.id,
        event: "provider_signed",
        actor: "provider",
        ipAddress: ip,
        userAgent: ua,
        metadata: JSON.stringify({ signedName: contract.providerSignedName, signedBy: input.editedBy, documentHash, afterEdit: true }),
      },
    ],
  });

  await prisma.activityLog.create({
    data: {
      clientId: input.clientId,
      actor: "chase",
      action: "contract_edited",
      details: `${contract.title} draft edited${mode === "ai" ? " with AI" : ""}`,
    },
  });

  return { contractBody: newBody, billing: contractBillingView(selectedPackages), billingError };
}

/** New draft from any contract of this client (sent, signed, expired or another draft). */
export async function copyContractAsDraft(input: {
  clientId: string;
  contractId: string;
  editedBy: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}) {
  const src = await prisma.contractSignature.findFirst({
    where: { id: input.contractId, clientId: input.clientId },
    select: { id: true, kind: true, title: true, contractBody: true, providerSignedName: true, providerSignatureData: true, selectedPackages: true },
  });
  if (!src) throw new ContractEditError("Contract not found", 404);
  if (!src.providerSignedName) throw new ContractEditError("This contract has no provider signature to carry over");

  const documentHash = createHash("sha256").update(src.contractBody).digest("hex");
  const ip = input.ipAddress || "unknown";
  const ua = input.userAgent || "unknown";

  const copy = await prisma.contractSignature.create({
    data: {
      clientId: input.clientId,
      token: randomBytes(16).toString("base64url"),
      kind: src.kind,
      title: src.title,
      contractBody: src.contractBody,
      documentHash,
      status: "DRAFT",
      providerSignedName: src.providerSignedName,
      providerSignatureData: src.providerSignatureData,
      providerSignedAt: new Date(),
      providerIpAddress: ip,
      providerUserAgent: ua,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      selectedPackages: (src.selectedPackages as object | null) ?? undefined,
    },
  });

  await prisma.contractAuditLog.createMany({
    data: [
      {
        contractId: copy.id,
        event: "created",
        actor: "system",
        ipAddress: ip,
        userAgent: ua,
        metadata: JSON.stringify({ documentHash, kind: src.kind, title: src.title, createdBy: input.editedBy, copiedFrom: src.id }),
      },
      {
        contractId: copy.id,
        event: "provider_signed",
        actor: "provider",
        ipAddress: ip,
        userAgent: ua,
        metadata: JSON.stringify({ signedName: src.providerSignedName, signedBy: input.editedBy, documentHash }),
      },
    ],
  });

  await prisma.activityLog.create({
    data: {
      clientId: input.clientId,
      actor: "chase",
      action: "contract_generated",
      details: `${src.title} copied into a new draft for editing`,
    },
  });

  return {
    id: copy.id,
    token: copy.token,
    status: copy.status,
    contractBody: copy.contractBody,
    billing: contractBillingView(copy.selectedPackages),
  };
}
