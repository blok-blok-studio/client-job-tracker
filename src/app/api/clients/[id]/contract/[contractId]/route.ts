import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; contractId: string }> }
) {
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

    await prisma.contractSignature.delete({ where: { id: contractId } });

    await prisma.activityLog.create({
      data: {
        clientId: id,
        actor: "chase",
        action: "deleted_contract",
        details: `Deleted contract (${contract.status})`,
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
