import { NextRequest, NextResponse } from "next/server";
import { createHash, randomBytes } from "crypto";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { requestMeta } from "@/lib/request-meta";
import {
  generateContractorAgreementBody,
  defaultTitleForKind,
  DEFAULT_PROVIDER_LEGAL_NAME,
  type ContractorContractKind,
} from "@/lib/contractor-agreement";
import { generateAiContractorAgreementBody } from "@/lib/contract-ai";
import { getSetting, setSetting } from "@/lib/lifecycle/settings";

// AI drafting on a long pasted template can take a while
export const maxDuration = 300;

// GET /api/contractors/contracts — every contractor agreement, newest first.
// Bodies are omitted; the detail view fetches the one it needs.
export async function GET() {
  try {
    const contracts = await prisma.contractorContract.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        contractorId: true,
        token: true,
        kind: true,
        title: true,
        status: true,
        country: true,
        providerSignedName: true,
        providerSignedAt: true,
        signedName: true,
        signedAt: true,
        expiresAt: true,
        createdAt: true,
        documentHash: true,
        signedDocumentHash: true,
        contractor: { select: { id: true, name: true, company: true, avatarUrl: true } },
      },
    });

    // Provider identity is remembered between agreements so the form pre-fills
    const [legalName, address] = await Promise.all([
      getSetting<string>("provider_legal_name", DEFAULT_PROVIDER_LEGAL_NAME),
      getSetting<string>("provider_address", ""),
    ]);

    return NextResponse.json({
      success: true,
      data: contracts,
      provider: { legalName, address },
    });
  } catch {
    return NextResponse.json(
      { success: false, error: "Failed to load contractor agreements" },
      { status: 500 }
    );
  }
}

const createSchema = z.object({
  contractorId: z.string().min(1),
  kind: z.enum(["IC_AGREEMENT", "NDA", "SOW"]).default("IC_AGREEMENT"),
  title: z.string().max(200).optional(),
  services: z.string().max(5000).optional(),
  compensation: z.string().max(2000).optional(),
  paymentDays: z.number().int().min(1).max(30).optional(),
  extraTerms: z.string().max(10000).optional(),
  // Free-form instructions that route the baseline through AI drafting.
  // Large enough to paste a full agreement template as the basis.
  customPrompt: z.string().max(200000).optional(),
  contractorAddress: z.string().max(500).optional(),
  providerLegalName: z.string().max(200).optional(),
  providerAddress: z.string().max(500).optional(),
  /** Remember the provider legal name/address for next time */
  saveProviderDetails: z.boolean().optional().default(true),
  providerSignedName: z.string().min(1).max(200),
  providerSignatureData: z.string().max(500000).optional(),
  expiresInDays: z.number().int().min(1).max(365).optional().default(30),
  /** true (default) = create but don't release the link yet */
  draft: z.boolean().optional().default(true),
});

// POST /api/contractors/contracts — draft an agreement for a contractor and
// counter-sign it on the spot. Nothing reaches the contractor until it's sent.
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    const body = await request.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message || "Invalid input" },
        { status: 400 }
      );
    }
    const d = parsed.data;

    const contractor = await prisma.contractor.findUnique({
      where: { id: d.contractorId },
      select: { id: true, name: true, company: true, country: true, location: true },
    });
    if (!contractor) {
      return NextResponse.json({ success: false, error: "Contractor not found" }, { status: 404 });
    }

    const providerLegalName =
      d.providerLegalName?.trim() ||
      (await getSetting<string>("provider_legal_name", DEFAULT_PROVIDER_LEGAL_NAME));
    const providerAddress =
      d.providerAddress?.trim() || (await getSetting<string>("provider_address", ""));

    const kind = d.kind as ContractorContractKind;
    const baselineBody = generateContractorAgreementBody(kind, {
      contractorName: contractor.name,
      company: contractor.company,
      country: contractor.country,
      contractorAddress: d.contractorAddress?.trim() || contractor.location || null,
      providerLegalName,
      providerAddress: providerAddress || null,
      services: d.services,
      compensation: d.compensation,
      paymentDays: d.paymentDays,
      extraTerms: d.extraTerms,
    });

    // Custom instructions route the baseline through AI drafting; any failure
    // falls back to the baseline so generation never hard-fails.
    let contractBody = baselineBody;
    let aiError: string | null = null;
    if (d.customPrompt && d.customPrompt.trim()) {
      const ai = await generateAiContractorAgreementBody({
        baselineBody,
        customPrompt: d.customPrompt.trim(),
        contractorName: contractor.name,
        companyName: contractor.company,
        country: contractor.country,
        documentType: defaultTitleForKind(kind),
      });
      contractBody = ai.body;
      if (!ai.usedAi) aiError = ai.error || "AI drafting unavailable — used the baseline agreement";
    }

    const documentHash = createHash("sha256").update(contractBody).digest("hex");
    const { ipAddress, userAgent } = requestMeta(request);

    const contract = await prisma.contractorContract.create({
      data: {
        contractorId: contractor.id,
        token: randomBytes(16).toString("base64url"),
        kind,
        title: d.title?.trim() || defaultTitleForKind(kind),
        contractBody,
        documentHash,
        status: d.draft ? "DRAFT" : "PENDING",
        country: contractor.country,
        providerSignedName: d.providerSignedName,
        providerSignatureData: d.providerSignatureData || null,
        providerSignedAt: new Date(),
        providerIpAddress: ipAddress,
        providerUserAgent: userAgent,
        expiresAt: new Date(Date.now() + d.expiresInDays * 24 * 60 * 60 * 1000),
      },
    });

    await prisma.contractorContractAudit.createMany({
      data: [
        {
          contractId: contract.id,
          event: "created",
          actor: "provider",
          ipAddress,
          userAgent,
          metadata: JSON.stringify({ documentHash, kind, by: session?.name || "team" }),
        },
        {
          contractId: contract.id,
          event: "provider_signed",
          actor: "provider",
          ipAddress,
          userAgent,
          metadata: JSON.stringify({ signedName: d.providerSignedName }),
        },
        ...(d.draft
          ? []
          : [
              {
                contractId: contract.id,
                event: "sent",
                actor: "provider" as const,
                ipAddress,
                userAgent,
                metadata: JSON.stringify({ by: session?.name || "team" }),
              },
            ]),
      ],
    });

    await prisma.activityLog.create({
      data: {
        actor: session?.name || "team",
        action: "contractor_contract_created",
        details: `${d.draft ? "Drafted" : "Sent"} "${contract.title}" for ${contractor.name}`,
      },
    });

    if (d.saveProviderDetails) {
      const actor = session?.name || "team";
      if (providerLegalName) await setSetting("provider_legal_name", providerLegalName, actor);
      if (providerAddress) await setSetting("provider_address", providerAddress, actor);
    }

    return NextResponse.json({
      success: true,
      data: {
        id: contract.id,
        token: contract.token,
        title: contract.title,
        status: contract.status,
        contractBody,
        aiError,
      },
    });
  } catch (error) {
    console.error("Contractor agreement generation error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to create the agreement" },
      { status: 500 }
    );
  }
}
