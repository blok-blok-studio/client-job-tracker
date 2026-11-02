import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { buildStatementView, statementIntegrity } from "@/lib/invoicing/partner-statement";

export const dynamic = "force-dynamic";

// GET — every commission statement issued to this partner (owner)
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (session?.role !== "OWNER") return NextResponse.json({ success: false, error: "Owner only" }, { status: 403 });
  const { id } = await params;
  const rows = await prisma.partnerStatement.findMany({ where: { partnerId: id }, orderBy: { issueDate: "desc" } });
  return NextResponse.json({ success: true, data: rows.map((r) => ({ ...buildStatementView(r), integrity: statementIntegrity(r) })) });
}
