import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { requestMeta } from "@/lib/request-meta";
import { createClientContract, ContractCreateError } from "@/lib/contract-create";

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
  // Fill-in standard document (Mutual NDA, Social Media agreement) instead of an
  // AI-drafted custom contract. No packages, no payment links, no AI rewrite: the
  // body is the template with these fields, so what gets signed is predictable.
  template: z.object({
    kind: z.enum(["NDA", "SOCIAL_MEDIA"]),
    clientDescriptor: z.string().max(300).optional(),
    extraTerms: z.string().max(5000).optional(),
    social: z.object({
      accounts: z.string().min(1).max(2000),
      deliverables: z.string().min(1).max(2000),
      alsoIncluded: z.string().min(1).max(2000),
      monthlyFee: z.string().min(1).max(100),
      authorizedPersonnel: z.string().min(1).max(1000),
    }).optional(),
  }).optional(),
});

// POST — Generate a new contract for a client (owner-only: contracts carry pricing)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (session?.role !== "OWNER") {
    return NextResponse.json({ success: false, error: "Owner only" }, { status: 403 });
  }

  const { id } = await params;

  try {
    const body = await request.json();
    const parsed = generateSchema.parse(body);
    const meta = requestMeta(request);

    const result = await createClientContract({
      clientId: id,
      packages: parsed.packages,
      addons: parsed.addons,
      customItems: parsed.customItems,
      customTerms: parsed.customTerms,
      customPrompt: parsed.customPrompt,
      packageCustomizations: parsed.packageCustomizations,
      providerSignedName: parsed.providerSignedName,
      providerSignatureData: parsed.providerSignatureData,
      country: parsed.country,
      paymentSchedule: parsed.paymentSchedule,
      skipPayment: parsed.skipPayment,
      draft: parsed.draft,
      template: parsed.template,
      createdBy: session.email,
      actor: "chase",
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: "Validation failed", details: error.issues },
        { status: 400 }
      );
    }
    if (error instanceof ContractCreateError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    }
    console.error("Contract generation error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to generate contract" },
      { status: 500 }
    );
  }
}

// GET — List all contracts for a client (owner-only: exposes signing tokens)
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (session?.role !== "OWNER") {
    return NextResponse.json({ success: false, error: "Owner only" }, { status: 403 });
  }

  const { id } = await params;

  try {
    const contracts = await prisma.contractSignature.findMany({
      where: { clientId: id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        token: true,
        kind: true,
        title: true,
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
