import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireOwner, handleError } from "../../../_shared";
import { renderQuotePdf } from "@/lib/invoicing/quotes";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { denied } = await requireOwner();
  if (denied) return denied;
  try {
    const { id } = await params;
    const q = await prisma.quote.findUnique({ where: { id } });
    if (!q) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    const bytes = await renderQuotePdf(q);
    const inline = new URL(request.url).searchParams.get("inline") === "1";
    return new NextResponse(Buffer.from(bytes), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${q.number}.pdf"`, "Cache-Control": "no-store" } });
  } catch (err) {
    return handleError(err, "Failed to render quote");
  }
}
