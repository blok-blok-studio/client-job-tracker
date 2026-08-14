import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { requestMeta } from "@/lib/request-meta";
import { agreementUrl } from "@/lib/contractor-contract";
import { sendContractorAgreementEmail } from "@/lib/email";

// GET /api/contractors/contracts/[id] — full record: body, signatures, audit trail
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const contract = await prisma.contractorContract.findUnique({
      where: { id },
      include: {
        contractor: { select: { id: true, name: true, company: true, email: true, avatarUrl: true } },
        auditLogs: { orderBy: { createdAt: "asc" } },
      },
    });
    if (!contract) {
      return NextResponse.json({ success: false, error: "Agreement not found" }, { status: 404 });
    }
    return NextResponse.json({
      success: true,
      data: { ...contract, url: agreementUrl(contract.token) },
    });
  } catch {
    return NextResponse.json({ success: false, error: "Failed to load agreement" }, { status: 500 });
  }
}

const patchSchema = z.object({
  action: z.enum(["send", "void", "email"]),
  /** send: also email the link to the contractor */
  email: z.boolean().optional().default(false),
});

// PATCH /api/contractors/contracts/[id] — release a draft, re-email the link, or void
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getSession();
    const parsed = patchSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: "Invalid input" }, { status: 400 });
    }
    const { action } = parsed.data;

    const contract = await prisma.contractorContract.findUnique({
      where: { id },
      include: { contractor: { select: { id: true, name: true, email: true } } },
    });
    if (!contract) {
      return NextResponse.json({ success: false, error: "Agreement not found" }, { status: 404 });
    }
    if (contract.status === "SIGNED") {
      return NextResponse.json(
        { success: false, error: "This agreement is signed — signed agreements are permanent records." },
        { status: 400 }
      );
    }

    const { ipAddress, userAgent } = requestMeta(request);
    const actor = session?.name || "team";
    let emailError: string | null = null;

    if (action === "void") {
      await prisma.contractorContract.update({ where: { id }, data: { status: "EXPIRED" } });
      await prisma.contractorContractAudit.create({
        data: {
          contractId: id,
          event: "voided",
          actor: "provider",
          ipAddress,
          userAgent,
          metadata: JSON.stringify({ by: actor }),
        },
      });
      await prisma.activityLog.create({
        data: {
          actor,
          action: "contractor_contract_voided",
          details: `Voided "${contract.title}" for ${contract.contractor.name}`,
        },
      });
      return NextResponse.json({ success: true });
    }

    // send / email
    if (action === "send" && contract.status === "DRAFT") {
      // The signing window runs from release, not from when the draft was
      // written — a draft that sat for a month must not arrive pre-expired.
      const windowDays =
        contract.expiresAt
          ? Math.max(
              1,
              Math.round(
                (contract.expiresAt.getTime() - contract.createdAt.getTime()) / (24 * 60 * 60 * 1000)
              )
            )
          : 30;
      await prisma.contractorContract.update({
        where: { id },
        data: {
          status: "PENDING",
          expiresAt: new Date(Date.now() + windowDays * 24 * 60 * 60 * 1000),
        },
      });
      await prisma.contractorContractAudit.create({
        data: {
          contractId: id,
          event: "sent",
          actor: "provider",
          ipAddress,
          userAgent,
          metadata: JSON.stringify({ by: actor }),
        },
      });
      await prisma.activityLog.create({
        data: {
          actor,
          action: "contractor_contract_sent",
          details: `Sent "${contract.title}" to ${contract.contractor.name} for signature`,
        },
      });
    }

    const wantsEmail = action === "email" || parsed.data.email;
    if (wantsEmail) {
      // Emailing a draft would send a link that 404s — release it first
      if (action === "email" && contract.status === "DRAFT") {
        return NextResponse.json(
          { success: false, error: "Release the agreement for signing before emailing the link." },
          { status: 400 }
        );
      }
      if (!contract.contractor.email) {
        emailError = "No email address on file for this contractor — share the link instead.";
      } else {
        try {
          await sendContractorAgreementEmail({
            to: contract.contractor.email,
            contractorName: contract.contractor.name,
            title: contract.title,
            agreementUrl: agreementUrl(contract.token),
          });
          await prisma.contractorContractAudit.create({
            data: {
              contractId: id,
              event: "emailed",
              actor: "provider",
              ipAddress,
              userAgent,
              metadata: JSON.stringify({ to: contract.contractor.email, by: actor }),
            },
          });
        } catch (err) {
          emailError = err instanceof Error ? err.message : "Failed to send the email";
        }
      }
    }

    return NextResponse.json({ success: true, url: agreementUrl(contract.token), emailError });
  } catch {
    return NextResponse.json({ success: false, error: "Failed to update agreement" }, { status: 500 });
  }
}

// DELETE /api/contractors/contracts/[id] — drafts only. Anything that has been
// sent or signed stays as a record; void it instead.
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getSession();
    const contract = await prisma.contractorContract.findUnique({
      where: { id },
      select: { id: true, status: true, title: true, contractor: { select: { name: true } } },
    });
    if (!contract) {
      return NextResponse.json({ success: false, error: "Agreement not found" }, { status: 404 });
    }
    if (contract.status !== "DRAFT") {
      return NextResponse.json(
        {
          success: false,
          error: "Only unsent drafts can be deleted. Void this agreement instead — sent and signed agreements are kept as records.",
        },
        { status: 400 }
      );
    }

    await prisma.contractorContract.delete({ where: { id } });
    await prisma.activityLog.create({
      data: {
        actor: session?.name || "team",
        action: "contractor_contract_deleted",
        details: `Deleted draft "${contract.title}" for ${contract.contractor.name}`,
      },
    });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ success: false, error: "Failed to delete draft" }, { status: 500 });
  }
}
