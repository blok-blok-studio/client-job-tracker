import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { buildStatementView, renderStatementPdf } from "@/lib/invoicing/partner-statement";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string; sid: string }> }) {
  const session = await getSession();
  if (session?.role !== "OWNER") return NextResponse.json({ success: false, error: "Owner only" }, { status: 403 });
  const { id, sid } = await params;
  const row = await prisma.partnerStatement.findFirst({ where: { id: sid, partnerId: id } });
  if (!row) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  const bytes = await renderStatementPdf(buildStatementView(row));
  const inline = new URL(request.url).searchParams.get("inline") === "1";
  return new NextResponse(Buffer.from(bytes), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${row.number}.pdf"`, "Cache-Control": "no-store" },
  });
}
