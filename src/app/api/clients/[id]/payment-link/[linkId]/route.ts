import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; linkId: string }> }
) {
  const { id, linkId } = await params;

  try {
    // Verify payment link belongs to this client
    const link = await prisma.paymentLink.findFirst({
      where: { id: linkId, clientId: id },
    });

    if (!link) {
      return NextResponse.json(
        { success: false, error: "Payment link not found" },
        { status: 404 }
      );
    }

    await prisma.paymentLink.delete({ where: { id: linkId } });

    await prisma.activityLog.create({
      data: {
        clientId: id,
        actor: "chase",
        action: "deleted_payment_link",
        details: `Deleted payment link: ${link.description} ($${(link.amount / 100).toFixed(2)})`,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete payment link:", error);
    return NextResponse.json(
      { success: false, error: "Failed to delete payment link" },
      { status: 500 }
    );
  }
}
