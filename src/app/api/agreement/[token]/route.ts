import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { requestMeta } from "@/lib/request-meta";
import { agreementUrl, onContractorAgreementSigned } from "@/lib/contractor-contract";
import { sendContractorAgreementSignedEmail } from "@/lib/email";

// Public, token-scoped contractor agreement: read it, sign it. Same rigor as the
// client contract flow — hash on issue, hash on signature, IP/UA on every event.

// GET — fetch an agreement for signing
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const ip = getClientIp(request);
  const rl = rateLimit(ip, { max: 20, prefix: "agreement-get" });
  if (!rl.allowed) {
    return NextResponse.json(
      { success: false, error: "Too many requests. Please try again later." },
      { status: 429 }
    );
  }

  try {
    const { token } = await params;

    const contract = await prisma.contractorContract.findUnique({
      where: { token },
      include: { contractor: { select: { name: true, company: true, isActive: true } } },
    });

    if (!contract) {
      return NextResponse.json(
        { success: false, error: "Invalid or expired link" },
        { status: 404 }
      );
    }

    // Drafts are not released yet — indistinguishable from a bad token
    if (contract.status === "DRAFT") {
      return NextResponse.json(
        { success: false, error: "Invalid or expired link" },
        { status: 404 }
      );
    }

    // Signed agreements stay readable forever (both sides need the record).
    // Unsigned ones die at their deadline.
    if (contract.status !== "SIGNED") {
      if (contract.status === "EXPIRED") {
        return NextResponse.json(
          { success: false, error: "This agreement is no longer available. Please ask us for a new link." },
          { status: 410 }
        );
      }
      if (contract.expiresAt && new Date() > contract.expiresAt) {
        await prisma.contractorContract.update({
          where: { id: contract.id },
          data: { status: "EXPIRED" },
        });
        return NextResponse.json(
          { success: false, error: "This agreement has expired. Please ask us for a new link." },
          { status: 410 }
        );
      }
    }

    const { ipAddress, userAgent } = requestMeta(request);
    await prisma.contractorContractAudit
      .create({
        data: { contractId: contract.id, event: "viewed", actor: "contractor", ipAddress, userAgent },
      })
      .catch(() => {});

    return NextResponse.json({
      success: true,
      data: {
        contractorName: contract.contractor.name,
        company: contract.contractor.company,
        title: contract.title,
        kind: contract.kind,
        contractBody: contract.contractBody,
        status: contract.status,
        signedName: contract.signedName,
        signatureData: contract.signatureData,
        signedAt: contract.signedAt,
        providerSignedName: contract.providerSignedName,
        providerSignatureData: contract.providerSignatureData,
        providerSignedAt: contract.providerSignedAt,
        expiresAt: contract.expiresAt,
        createdAt: contract.createdAt,
      },
    });
  } catch (error) {
    console.error("Agreement GET error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to load the agreement" },
      { status: 500 }
    );
  }
}

const signSchema = z.object({
  signedName: z.string().min(2, "Please type your full legal name").max(200),
  signatureData: z.string().max(500000).optional(),
});

// POST — sign
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const ip = getClientIp(request);
  const rl = rateLimit(ip, { max: 5, prefix: "agreement-sign" });
  if (!rl.allowed) {
    return NextResponse.json(
      { success: false, error: "Too many requests. Please try again later." },
      { status: 429 }
    );
  }

  try {
    const { token } = await params;

    const contract = await prisma.contractorContract.findUnique({
      where: { token },
      include: { contractor: { select: { id: true, name: true, email: true } } },
    });

    if (!contract || contract.status === "DRAFT") {
      return NextResponse.json(
        { success: false, error: "Invalid or expired link" },
        { status: 404 }
      );
    }
    if (contract.status === "SIGNED") {
      return NextResponse.json(
        { success: false, error: "This agreement has already been signed" },
        { status: 400 }
      );
    }
    if (contract.status === "EXPIRED" || (contract.expiresAt && new Date() > contract.expiresAt)) {
      await prisma.contractorContract.update({
        where: { id: contract.id },
        data: { status: "EXPIRED" },
      });
      return NextResponse.json(
        { success: false, error: "This agreement has expired. Please ask us for a new link." },
        { status: 410 }
      );
    }

    const parsed = signSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message || "Validation failed" },
        { status: 400 }
      );
    }

    // Tamper detection: the body must still hash to what was issued
    if (contract.documentHash) {
      const currentHash = createHash("sha256").update(contract.contractBody).digest("hex");
      if (currentHash !== contract.documentHash) {
        return NextResponse.json(
          {
            success: false,
            error: "Integrity check failed. This document may have been altered — please contact us before signing.",
          },
          { status: 409 }
        );
      }
    }

    const { ipAddress, userAgent } = requestMeta(request);
    const signedDocumentHash = createHash("sha256")
      .update(
        contract.contractBody + "|" + (contract.providerSignedName || "") + "|" + parsed.data.signedName
      )
      .digest("hex");

    // Conditional write: two submits landing together must not produce two
    // signatures on one record. Only the first (status still unsigned) wins.
    const applied = await prisma.contractorContract.updateMany({
      where: { id: contract.id, status: { not: "SIGNED" } },
      data: {
        signedName: parsed.data.signedName,
        signatureData: parsed.data.signatureData || null,
        signedAt: new Date(),
        ipAddress,
        userAgent,
        signedDocumentHash,
        status: "SIGNED",
      },
    });
    if (applied.count === 0) {
      return NextResponse.json(
        { success: false, error: "This agreement has already been signed" },
        { status: 400 }
      );
    }

    await prisma.contractorContractAudit
      .create({
        data: {
          contractId: contract.id,
          event: "contractor_signed",
          actor: "contractor",
          ipAddress,
          userAgent,
          metadata: JSON.stringify({ signedName: parsed.data.signedName, signedDocumentHash }),
        },
      })
      .catch(() => {});

    // Compliance unlock + Slack + activity log. Awaited: serverless kills the
    // process once the response is out.
    await onContractorAgreementSigned(contract.id).catch((err) =>
      console.error("[Agreement] post-sign hooks failed:", err)
    );

    if (contract.contractor.email) {
      await sendContractorAgreementSignedEmail({
        to: contract.contractor.email,
        contractorName: contract.contractor.name,
        title: contract.title,
        agreementUrl: agreementUrl(contract.token),
      }).catch((err) => console.error("[Agreement] signed-copy email failed:", err));
    }

    return NextResponse.json({ success: true, message: "Agreement signed" });
  } catch (error) {
    console.error("Agreement sign error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to sign the agreement" },
      { status: 500 }
    );
  }
}
