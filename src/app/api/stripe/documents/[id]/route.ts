import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireOwner, handleError } from "@/app/api/studio-invoices/_shared";

// GET — the stored PDF of a Stripe invoice. Owner only.
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { denied } = await requireOwner();
  if (denied) return denied;
  try {
    const { id } = await params;
    const doc = await prisma.stripeDocument.findUnique({ where: { id }, select: { number: true, pdf: true } });
    if (!doc?.pdf) return NextResponse.json({ success: false, error: "No PDF stored" }, { status: 404 });
    return new NextResponse(new Uint8Array(doc.pdf), {
      headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="Stripe-Invoice-${(doc.number || id).replace(/[^\w.-]+/g, "_")}.pdf"`, "Cache-Control": "private, no-store" },
    });
  } catch (err) {
    return handleError(err, "Failed to load the PDF");
  }
}
