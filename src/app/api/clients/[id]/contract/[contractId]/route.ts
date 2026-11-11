import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { requestMeta } from "@/lib/request-meta";
import { editDraftContract, contractBillingView, ContractEditError } from "@/lib/contract-edit";

// AI edits stream a whole contract back, then re-read the fees
export const maxDuration = 300;

// GET — Fetch a single contract's full body for owner review (e.g. previewing a draft before sending)
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; contractId: string }> }
) {
  const session = await getSession();
  if (session?.role !== "OWNER") {
    return NextResponse.json({ success: false, error: "Owner only" }, { status: 403 });
  }

  const { id, contractId } = await params;

  try {
    const contract = await prisma.contractSignature.findFirst({
      where: { id: contractId, clientId: id },
      select: {
        id: true,
        token: true,
        kind: true,
        title: true,
        status: true,
        contractBody: true,
        providerSignedName: true,
        signedName: true,
        signedAt: true,
        createdAt: true,
        selectedPackages: true,
      },
    });

    if (!contract) {
      return NextResponse.json({ success: false, error: "Contract not found" }, { status: 404 });
    }

    // What this contract bills, for the review screen (fees read from a prompt contract)
    const { selectedPackages: sp, ...rest } = contract;
    const billing = contractBillingView(sp);
    return NextResponse.json({ success: true, data: { ...rest, billing } });
  } catch (error) {
    console.error("Failed to fetch contract:", error);
    return NextResponse.json({ success: false, error: "Failed to fetch contract" }, { status: 500 });
  }
}

const editSchema = z.union([
  z.object({ body: z.string().min(1).max(300000) }),
  z.object({ instructions: z.string().trim().min(1).max(20000) }),
]);

// PATCH — Edit a DRAFT in place: { body } for a hand edit, or { instructions } for an AI change
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; contractId: string }> }
) {
  const session = await getSession();
  if (session?.role !== "OWNER") {
    return NextResponse.json({ success: false, error: "Owner only" }, { status: 403 });
  }

  const { id, contractId } = await params;

  try {
    const parsed = editSchema.parse(await request.json());
    const meta = requestMeta(request);
    const result = await editDraftContract({
      clientId: id,
      contractId,
      ...("body" in parsed ? { body: parsed.body } : { instructions: parsed.instructions }),
      editedBy: session.email,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: "Send either new text or a change to make" }, { status: 400 });
    }
    if (error instanceof ContractEditError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    }
    console.error("Failed to edit contract:", error);
    return NextResponse.json({ success: false, error: "Failed to edit contract" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; contractId: string }> }
) {
  const session = await getSession();
  if (session?.role !== "OWNER") {
    return NextResponse.json({ success: false, error: "Owner only" }, { status: 403 });
  }

  const { id, contractId } = await params;

  try {
    // Verify contract belongs to this client
    const contract = await prisma.contractSignature.findFirst({
      where: { id: contractId, clientId: id },
    });

    if (!contract) {
      return NextResponse.json(
        { success: false, error: "Contract not found" },
        { status: 404 }
      );
    }

    // A signed contract is a permanent legal record, with its audit trail
    if (contract.status === "SIGNED") {
      return NextResponse.json(
        { success: false, error: "Signed contracts are permanent records and can't be deleted." },
        { status: 409 }
      );
    }

    const { cancelContractBilling } = await import("@/lib/invoicing/contract-billing");
    await cancelContractBilling([contractId]);
    await prisma.contractSignature.delete({ where: { id: contractId } });

    await prisma.activityLog.create({
      data: {
        clientId: id,
        actor: "chase",
        action: "deleted_contract",
        details: `Deleted ${contract.title} (${contract.status})`,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete contract:", error);
    return NextResponse.json(
      { success: false, error: "Failed to delete contract" },
      { status: 500 }
    );
  }
}
