import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { z } from "zod";
import { createHash } from "crypto";
import { onContractSigned } from "@/lib/pipeline";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { requestMeta } from "@/lib/request-meta";
import { sendContractSignedAdminEmail, sendContractSignedClientEmail } from "@/lib/email";

const ALLOWED_ORIGINS = [
  "https://blokblokstudio.com",
  "https://www.blokblokstudio.com",
  "https://blokblokstudio-clients.vercel.app",
  "https://app.blokblokstudio.com",
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
  // Rate limit contract token lookups — 20/min per IP
  const ip = getClientIp(request);
  const rl = rateLimit(ip, { max: 20, prefix: "contract-get" });
  if (!rl.allowed) {
    return NextResponse.json(
      { success: false, error: "Too many requests. Please try again later." },
      { status: 429, headers: corsHeaders(request) }
    );
  }

  try {
    const { token } = await params;

    const contract = await prisma.contractSignature.findUnique({
      where: { token },
      include: {
        client: {
          select: { name: true, company: true, type: true },
        },
      },
    });

    if (!contract) {
      return NextResponse.json(
        { success: false, error: "Invalid or expired contract link" },
        { status: 404, headers: corsHeaders(request) }
      );
    }

    // Signed contracts are permanent records — always viewable, even for
    // archived clients or past the original signing deadline
    if (contract.client.type === "ARCHIVED" && contract.status !== "SIGNED") {
      return NextResponse.json(
        { success: false, error: "This contract is no longer available" },
        { status: 410, headers: corsHeaders(request) }
      );
    }

    // Drafts are not yet released to the client — treat as not found until sent
    if (contract.status === "DRAFT") {
      return NextResponse.json(
        { success: false, error: "Invalid or expired contract link" },
        { status: 404, headers: corsHeaders(request) }
      );
    }

    if (contract.status !== "SIGNED" && contract.expiresAt && new Date() > contract.expiresAt) {
      // Update status to EXPIRED
      await prisma.contractSignature.update({
        where: { id: contract.id },
        data: { status: "EXPIRED" },
      });
      return NextResponse.json(
        { success: false, error: "This contract has expired" },
        { status: 410, headers: corsHeaders(request) }
      );
    }

    // Audit log: contract viewed
    const viewMeta = requestMeta(request);
    const viewIp = viewMeta.ipAddress || ip;
    const viewUa = viewMeta.userAgent || "unknown";
    await prisma.contractAuditLog.create({
      data: {
        contractId: contract.id,
        event: "viewed",
        actor: "client",
        ipAddress: viewIp,
        userAgent: viewUa,
      },
    }).catch(() => {}); // non-blocking

    return NextResponse.json(
      {
        success: true,
        data: {
          clientName: contract.client.name,
          company: contract.client.company,
          kind: contract.kind,
          title: contract.title,
          contractBody: contract.contractBody,
          status: contract.status,
          signedName: contract.signedName,
          signatureData: contract.signatureData,
          signedAt: contract.signedAt,
          providerSignedName: contract.providerSignedName,
          providerSignatureData: contract.providerSignatureData,
          providerSignedAt: contract.providerSignedAt,
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
  signatureData: z.string().max(500000).optional(), // Base64 PNG of drawn signature
  // The exact consent sentence shown next to the checkbox the signer ticked
  consentText: z.string().max(2000).optional(),
  // Signer's own clock, as evidence alongside the server's UTC timestamp
  timezone: z.string().max(100).optional(),
  localTime: z.string().max(100).optional(),
});

// POST — Sign the contract
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  // Rate limit contract signing — 5/min per IP
  const signIp = getClientIp(request);
  const signRl = rateLimit(signIp, { max: 5, prefix: "contract-sign" });
  if (!signRl.allowed) {
    return NextResponse.json(
      { success: false, error: "Too many requests. Please try again later." },
      { status: 429, headers: corsHeaders(request) }
    );
  }

  try {
    const { token } = await params;

    const contract = await prisma.contractSignature.findUnique({
      where: { token },
      include: {
        client: { select: { id: true, name: true, email: true, company: true } },
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

    if (contract.status === "DRAFT") {
      return NextResponse.json(
        { success: false, error: "Invalid or expired contract link" },
        { status: 404, headers: corsHeaders(request) }
      );
    }

    if (contract.expiresAt && new Date() > contract.expiresAt) {
      await prisma.contractSignature.update({
        where: { id: contract.id },
        data: { status: "EXPIRED" },
      });
      return NextResponse.json(
        { success: false, error: "This contract has expired" },
        { status: 410, headers: corsHeaders(request) }
      );
    }

    const body = await request.json();
    const parsed = signSchema.parse(body);

    // Capture IP and user agent. The platform-observed address, not the
    // left-most X-Forwarded-For hop (which the signer's side can forge): this
    // is the evidence of who signed.
    const meta = requestMeta(request);
    const ipAddress = meta.ipAddress || "unknown";
    const userAgent = meta.userAgent || "unknown";

    // Tamper detection: verify document hash hasn't changed since creation
    if (contract.documentHash) {
      const currentHash = createHash("sha256").update(contract.contractBody).digest("hex");
      if (currentHash !== contract.documentHash) {
        return NextResponse.json(
          { success: false, error: "Contract integrity check failed. The document may have been tampered with." },
          { status: 409, headers: corsHeaders(request) }
        );
      }
    }

    // Compute signed document hash (proves both signatures are bound to exact same document)
    const signedDocumentHash = createHash("sha256")
      .update(contract.contractBody + "|" + (contract.providerSignedName || "") + "|" + parsed.signedName)
      .digest("hex");

    // Sign the contract. Conditional write: two submits landing together must
    // not produce two signatures on one record. Only the first one wins.
    const signedAt = new Date();
    const applied = await prisma.contractSignature.updateMany({
      where: { id: contract.id, status: { not: "SIGNED" } },
      data: {
        signedName: parsed.signedName,
        signatureData: parsed.signatureData || null,
        signedAt,
        ipAddress,
        userAgent,
        signedDocumentHash,
        consentText: parsed.consentText || null,
        status: "SIGNED",
      },
    });
    if (applied.count === 0) {
      return NextResponse.json(
        { success: false, error: "This contract has already been signed" },
        { status: 400, headers: corsHeaders(request) }
      );
    }

    // Audit log: client signed
    await prisma.contractAuditLog.create({
      data: {
        contractId: contract.id,
        event: "client_signed",
        actor: "client",
        ipAddress,
        userAgent,
        metadata: JSON.stringify({
          signedName: parsed.signedName,
          signedDocumentHash,
          documentHash: contract.documentHash,
          signedAtUtc: signedAt.toISOString(),
          signatureMethod: parsed.signatureData ? "drawn" : "typed",
          consentText: parsed.consentText || null,
          signerTimezone: parsed.timezone || null,
          signerLocalTime: parsed.localTime || null,
        }),
      },
    }).catch((err) => console.error("[Contract] client_signed audit entry failed:", err));

    // Trigger pipeline: auto-check checklist, send emails to client + Chase, cascade onboarding
    // MUST be awaited — serverless runtimes kill the process after response,
    // so fire-and-forget promises may never complete
    if (contract.kind === "SERVICE_AGREEMENT") {
      await onContractSigned(contract.client.id, {
        signedName: parsed.signedName,
        ipAddress,
        token,
      });
    } else {
      // Standard documents (NDA, Social Media agreement) don't start the
      // onboarding pipeline. Both sides just get their signed copy.
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://app.blokblokstudio.com";
      const contractUrl = `${appUrl}/c/${token}`;
      await Promise.allSettled([
        sendContractSignedAdminEmail({
          clientName: contract.client.name,
          company: contract.client.company,
          signedName: parsed.signedName,
          contractUrl,
          signedAt,
          ipAddress,
          documentHash: contract.documentHash,
          signedDocumentHash,
          providerSignedName: contract.providerSignedName,
        }),
        contract.client.email
          ? sendContractSignedClientEmail({
              to: contract.client.email,
              clientName: contract.client.name,
              contractUrl,
              pdfUrl: `${appUrl}/api/contract/${token}/pdf`,
              signedAt,
            })
          : Promise.resolve(null),
      ]).then((results) =>
        results.forEach((r) => {
          if (r.status === "rejected") console.error("[Contract] signed-copy email failed:", r.reason);
        })
      );
    }

    // Log the activity
    await prisma.activityLog.create({
      data: {
        clientId: contract.client.id,
        actor: "client",
        action: "contract_signed",
        details: `${contract.client.name} signed the ${contract.title} (IP: ${ipAddress})`,
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
