import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { z } from "zod";
import { onContractSigned } from "@/lib/pipeline";

const ALLOWED_ORIGINS = [
  "https://blokblokstudio.com",
  "https://www.blokblokstudio.com",
  "https://client-job-tracker.vercel.app",
  ...(process.env.NODE_ENV === "development" ? ["http://localhost:3000", "http://localhost:3001"] : []),
];

function corsHeaders(request: NextRequest): Record<string, string> {
  const origin = request.headers.get("origin") || "";
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : null;
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
  if (allowed) headers["Access-Control-Allow-Origin"] = allowed;
  return headers;
}

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(request) });
}

// GET — Fetch contract for signing
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;

    const contract = await prisma.contractSignature.findUnique({
      where: { token },
      include: {
        client: {
          select: { name: true, company: true },
        },
      },
    });

    if (!contract) {
      return NextResponse.json(
        { success: false, error: "Invalid or expired contract link" },
        { status: 404, headers: corsHeaders(request) }
      );
    }

    return NextResponse.json(
      {
        success: true,
        data: {
          clientName: contract.client.name,
          company: contract.client.company,
          contractBody: contract.contractBody,
          status: contract.status,
          signedName: contract.signedName,
          signedAt: contract.signedAt,
          createdAt: contract.createdAt,
        },
      },
      { headers: corsHeaders(request) }
    );
  } catch (error) {
    console.error("Contract GET error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch contract" },
      { status: 500, headers: corsHeaders(request) }
    );
  }
}

const signSchema = z.object({
  signedName: z.string().min(2, "Please type your full legal name").max(200),
});

// POST — Sign the contract
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;

    const contract = await prisma.contractSignature.findUnique({
      where: { token },
      include: {
        client: { select: { id: true, name: true } },
      },
    });

    if (!contract) {
      return NextResponse.json(
        { success: false, error: "Invalid or expired contract link" },
        { status: 404, headers: corsHeaders(request) }
      );
    }

    if (contract.status === "SIGNED") {
      return NextResponse.json(
        { success: false, error: "This contract has already been signed" },
        { status: 400, headers: corsHeaders(request) }
      );
    }

    const body = await request.json();
    const parsed = signSchema.parse(body);

    // Capture IP and user agent
    const forwarded = request.headers.get("x-forwarded-for");
    const ipAddress = forwarded ? forwarded.split(",")[0].trim() : request.headers.get("x-real-ip") || "unknown";
    const userAgent = request.headers.get("user-agent") || "unknown";

    // Sign the contract
    await prisma.contractSignature.update({
      where: { token },
      data: {
        signedName: parsed.signedName,
        signedAt: new Date(),
        ipAddress,
        userAgent,
        status: "SIGNED",
      },
    });

    // Trigger pipeline: auto-check checklist + create content calendar task
    onContractSigned(contract.client.id).catch((err) =>
      console.error("[Pipeline] onContractSigned error:", err)
    );

    // Log the activity
    await prisma.activityLog.create({
      data: {
        clientId: contract.client.id,
        actor: "client",
        action: "contract_signed",
        details: `${contract.client.name} signed the service agreement (IP: ${ipAddress})`,
      },
    });

    return NextResponse.json(
      { success: true, message: "Contract signed successfully" },
      { headers: corsHeaders(request) }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: "Validation failed", details: error.issues },
        { status: 400, headers: corsHeaders(request) }
      );
    }
    console.error("Contract sign error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to sign contract" },
      { status: 500, headers: corsHeaders(request) }
    );
  }
}
