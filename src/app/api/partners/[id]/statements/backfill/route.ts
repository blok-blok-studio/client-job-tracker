import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { backfillStatements } from "@/lib/invoicing/partner-statement";

export const dynamic = "force-dynamic";

// POST — issue statements for payouts that were sent before statements existed
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (session?.role !== "OWNER") return NextResponse.json({ success: false, error: "Owner only" }, { status: 403 });
  const { id } = await params;
  try {
    const created = await backfillStatements(id, session.name);
    return NextResponse.json({ success: true, data: { created } });
  } catch (err) {
    console.error("[partners/statements/backfill]", err);
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
  }
}
