import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth";

// Client IDs with outstanding (sent/overdue) invoices — powers the unpaid
// badge on kanban cards. Finances are owner-only: members get an empty list
// (not a 403) so the board renders identically minus the badges.
export async function GET() {
  const session = await getSession();
  if (session?.role !== "OWNER") {
    return NextResponse.json({ success: true, data: [] });
  }

  const rows = await prisma.invoice.groupBy({
    by: ["clientId"],
    where: { status: { in: ["SENT", "OVERDUE"] } },
    _sum: { amount: true },
  }) as unknown as Array<{ clientId: string; _sum: { amount: unknown } }>;

  return NextResponse.json({
    success: true,
    data: rows.map((r) => ({ clientId: r.clientId, outstanding: Number(r._sum.amount || 0) })),
  });
}
