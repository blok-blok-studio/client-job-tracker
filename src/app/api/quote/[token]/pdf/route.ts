import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { renderQuotePdf } from "@/lib/invoicing/quotes";

export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[\w-]{16,64}$/.test(token)) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  const q = await prisma.quote.findUnique({ where: { token } });
  if (!q || q.status === "DRAFT") return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  const bytes = await renderQuotePdf(q);
  return new NextResponse(Buffer.from(bytes), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${q.number}.pdf"`, "Cache-Control": "no-store" } });
}
