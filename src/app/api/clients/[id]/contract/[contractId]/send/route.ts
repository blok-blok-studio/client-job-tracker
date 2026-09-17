import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { sendContract } from "@/lib/contract-send";
import { getSession } from "@/lib/auth";
import { requestMeta } from "@/lib/request-meta";

// Allow time for Stripe API calls + email sending
export const maxDuration = 300;

// POST — Send a previously-created draft contract to the client (payment links + signing/onboarding emails)
export async function POST(
  request: NextRequest,
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
      select: { id: true, status: true, title: true },
    });

    if (!contract) {
      return NextResponse.json({ success: false, error: "Contract not found" }, { status: 404 });
    }

    if (contract.status !== "DRAFT") {
      return NextResponse.json(
        { success: false, error: `Contract is already ${contract.status.toLowerCase()} — can only send drafts.` },
        { status: 409 }
      );
    }

    const result = await sendContract(contract.id, { ...requestMeta(request), sentBy: session.email });

    await prisma.activityLog.create({
      data: {
        clientId: id,
        actor: "chase",
        action: "contract_sent",
        details: `${contract.title} reviewed and sent to client`,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        id: contract.id,
        status: "PENDING",
        paymentLinks: result.paymentLinks,
        paymentLinkError: result.paymentLinkError,
      },
    });
  } catch (error) {
    console.error("Failed to send contract:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to send contract" },
      { status: 500 }
    );
  }
}
