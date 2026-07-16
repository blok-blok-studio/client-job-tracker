import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

// Client IDs with outstanding (sent/overdue) invoices — powers the unpaid
// badge on kanban cards.
export async function GET() {
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
