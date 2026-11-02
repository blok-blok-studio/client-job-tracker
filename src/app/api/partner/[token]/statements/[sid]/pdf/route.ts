import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { findRepByToken } from "@/lib/partner-portal";
import { buildStatementView, renderStatementPdf } from "@/lib/invoicing/partner-statement";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string; sid: string }> }) {
  const rl = rateLimit(getClientIp(request), { max: 30, prefix: "partner-statement-pdf" });
  if (!rl.allowed) return NextResponse.json({ success: false, error: "Too many requests" }, { status: 429 });
  const { token, sid } = await params;
  const rep = await findRepByToken(token);
  if (!rep || !rep.isAdmin) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  const row = await prisma.partnerStatement.findFirst({ where: { id: sid, partnerId: rep.partnerId } });
  if (!row) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  const bytes = await renderStatementPdf(buildStatementView(row));
  return new NextResponse(Buffer.from(bytes), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${row.number}.pdf"`, "Cache-Control": "no-store" },
  });
}
