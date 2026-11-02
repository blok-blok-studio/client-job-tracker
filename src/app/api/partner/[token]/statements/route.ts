import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { findRepByToken } from "@/lib/partner-portal";
import { buildStatementView } from "@/lib/invoicing/partner-statement";

export const dynamic = "force-dynamic";

// GET — the partner admin's own commission statements (token-scoped)
export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const rl = rateLimit(getClientIp(request), { max: 60, prefix: "partner-statements" });
  if (!rl.allowed) return NextResponse.json({ success: false, error: "Too many requests" }, { status: 429 });
  const { token } = await params;
  const rep = await findRepByToken(token);
  if (!rep) return NextResponse.json({ success: false, error: "Invalid link" }, { status: 404 });
  if (!rep.isAdmin) return NextResponse.json({ success: false, error: "Statements are visible to the partner admin only" }, { status: 403 });
  const rows = await prisma.partnerStatement.findMany({ where: { partnerId: rep.partnerId }, orderBy: { issueDate: "desc" } });
  return NextResponse.json({ success: true, data: rows.map(buildStatementView) });
}
