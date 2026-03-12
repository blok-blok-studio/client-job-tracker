import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { randomBytes } from "crypto";
import { generateContractBody } from "@/lib/contract-templates";
import { z } from "zod";

const generateSchema = z.object({
  packages: z.array(z.string()).default([]),
  addons: z.array(z.string()).optional().default([]),
  customItems: z.array(z.object({
    name: z.string().min(1).max(200),
    price: z.number().min(0),
    recurring: z.boolean().optional().default(false),
  })).optional().default([]),
  customTerms: z.string().max(5000).optional(),
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
      select: { id: true, name: true, company: true },
    });

    if (!client) {
      return NextResponse.json({ success: false, error: "Client not found" }, { status: 404 });
    }

    const body = await request.json();
    const parsed = generateSchema.parse(body);

    const token = randomBytes(32).toString("hex");
    const contractBody = generateContractBody(
      client.name,
      client.company,
      parsed.packages,
      parsed.addons,
      parsed.customItems,
      parsed.customTerms
    );

    const contract = await prisma.contractSignature.create({
      data: {
        clientId: client.id,
        token,
        contractBody,
      },
    });

    // Log the activity
    await prisma.activityLog.create({
      data: {
        clientId: client.id,
        actor: "chase",
        action: "contract_generated",
        details: `Contract generated for ${client.name}`,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        id: contract.id,
        token: contract.token,
        status: contract.status,
        createdAt: contract.createdAt,
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
