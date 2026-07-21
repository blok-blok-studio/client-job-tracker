import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { randomBytes, createHash } from "crypto";
import { generateContractBody } from "@/lib/contract-templates";
import { getCurrencyForCountry } from "@/lib/stripe";
import { generateAiContractBody } from "@/lib/contract-ai";
import { sendContract } from "@/lib/contract-send";
import { z } from "zod";

// Allow up to 120s for exchange rate fetch + Stripe API calls + email sending
export const maxDuration = 300;

const milestoneSchema = z.object({
  label: z.string(), // "deposit" | "milestone" | "completion"
  percent: z.number().min(1).max(100),
});

const generateSchema = z.object({
  packages: z.array(z.string()).default([]),
  addons: z.array(z.string()).optional().default([]),
  customItems: z.array(z.object({
    name: z.string().min(1).max(200),
    price: z.number().min(0),
    recurring: z.boolean().optional().default(false),
  })).optional().default([]),
  customTerms: z.string().max(5000).optional(),
  // Free-form instructions that route the contract through AI drafting on top of the
  // baseline template — large enough to paste a full contract template as the basis
  customPrompt: z.string().max(200000).optional(),
  packageCustomizations: z.record(z.string(), z.object({
    priceOverride: z.number().min(0).optional(),
    excludedDeliverables: z.array(z.number().int().min(0)).optional(),
  })).optional(),
  providerSignedName: z.string().min(1).max(200),
  providerSignatureData: z.string().max(500000).optional(), // Base64 PNG of drawn signature
  // Payment schedule
  country: z.string().length(2).default("US"),
  paymentSchedule: z.array(milestoneSchema).optional(), // e.g. [{label:"deposit",percent:50},{label:"completion",percent:50}]
  skipPayment: z.boolean().optional().default(false), // true = contract only, no payment links
  // true = create the contract but DON'T send to client yet (review first, send later)
  draft: z.boolean().optional().default(false),
});

// POST — Generate a new contract for a client
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const client = await prisma.client.findUnique({
      where: { id },
      select: { id: true, name: true, email: true, company: true, stripeCustomerId: true },
    });

    if (!client) {
      return NextResponse.json({ success: false, error: "Client not found" }, { status: 404 });
    }

    const body = await request.json();
    const parsed = generateSchema.parse(body);

    // Validate payment schedule adds up to 100%
    if (parsed.paymentSchedule && parsed.paymentSchedule.length > 0) {
      const totalPercent = parsed.paymentSchedule.reduce((s, m) => s + m.percent, 0);
      if (totalPercent !== 100) {
        return NextResponse.json(
          { success: false, error: `Payment schedule must add up to 100% (got ${totalPercent}%)` },
          { status: 400 }
        );
      }
    }

    const token = randomBytes(32).toString("hex");
    const contractCurrency = getCurrencyForCountry(parsed.country);

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

    const baselineBody = generateContractBody(
      client.name,
      client.company,
      parsed.packages,
      parsed.addons,
      parsed.customItems,
      parsed.customTerms,
      parsed.packageCustomizations,
      parsed.paymentSchedule,
      contractCurrency,
      exchangeRate
    );

    // If a custom prompt is provided, run the baseline through AI drafting (figures stay locked).
    // Falls back to the baseline body on any AI failure.
    let contractBody = baselineBody;
    let aiError: string | null = null;
    if (parsed.customPrompt && parsed.customPrompt.trim()) {
      const ai = await generateAiContractBody({
        baselineBody,
        customPrompt: parsed.customPrompt.trim(),
        clientName: client.name,
        companyName: client.company,
      });
      contractBody = ai.body;
      if (!ai.usedAi) aiError = ai.error || "AI drafting unavailable — used baseline contract";
    }

    // SHA-256 hash of the contract body for tamper detection
    const documentHash = createHash("sha256").update(contractBody).digest("hex");

    // Capture provider's IP and user agent
    const providerIp = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
      || request.headers.get("x-real-ip")
      || "unknown";
    const providerUa = request.headers.get("user-agent") || "unknown";

    const contract = await prisma.contractSignature.create({
      data: {
        clientId: client.id,
        token,
        contractBody,
        documentHash,
        status: parsed.draft ? "DRAFT" : "PENDING",
        providerSignedName: parsed.providerSignedName,
        providerSignatureData: parsed.providerSignatureData || null,
        providerSignedAt: new Date(),
        providerIpAddress: providerIp,
        providerUserAgent: providerUa,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        // Persist the full generation params so the contract can be sent later (draft → send)
        selectedPackages: {
          packages: parsed.packages,
          addons: parsed.addons || [],
          customItems: parsed.customItems || [],
          packageCustomizations: parsed.packageCustomizations || {},
          country: parsed.country,
          paymentSchedule: parsed.paymentSchedule || null,
          skipPayment: parsed.skipPayment,
          exchangeRate: exchangeRate ?? null,
        },
      },
    });

    // Create audit log entries
    await prisma.contractAuditLog.createMany({
      data: [
        {
          contractId: contract.id,
          event: "created",
          actor: "system",
          ipAddress: providerIp,
          userAgent: providerUa,
          metadata: JSON.stringify({ documentHash }),
        },
        {
          contractId: contract.id,
          event: "provider_signed",
          actor: "provider",
          ipAddress: providerIp,
          userAgent: providerUa,
          metadata: JSON.stringify({ signedName: parsed.providerSignedName }),
        },
      ],
    });

    // Log the activity
    await prisma.activityLog.create({
      data: {
        clientId: client.id,
        actor: "chase",
        action: "contract_generated",
        details: `Contract generated and counter-signed by ${parsed.providerSignedName} for ${client.name}`,
      },
    });

    // Draft mode: create the contract but DON'T send anything yet — owner reviews first,
    // then calls POST /api/clients/[id]/contract/[contractId]/send to dispatch it.
    let paymentLinks: Array<{ milestone: string; url: string; amount: number }> = [];
    let paymentLinkError: string | null = null;

    if (!parsed.draft) {
      const sendResult = await sendContract(contract.id);
      paymentLinks = sendResult.paymentLinks;
      paymentLinkError = sendResult.paymentLinkError;
    }

    return NextResponse.json({
      success: true,
      data: {
        id: contract.id,
        token: contract.token,
        status: parsed.draft ? "DRAFT" : "PENDING",
        createdAt: contract.createdAt,
        contractBody,        // returned so the UI can show a review preview
        isDraft: parsed.draft,
        aiError,
        paymentLinks,
        paymentLinkError,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: "Validation failed", details: error.issues },
        { status: 400 }
      );
    }
    console.error("Contract generation error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to generate contract" },
      { status: 500 }
    );
  }
}

// GET — List all contracts for a client
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const contracts = await prisma.contractSignature.findMany({
      where: { clientId: id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        token: true,
        status: true,
        signedName: true,
        signedAt: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ success: true, data: contracts });
  } catch {
    return NextResponse.json(
      { success: false, error: "Failed to fetch contracts" },
      { status: 500 }
    );
  }
}
