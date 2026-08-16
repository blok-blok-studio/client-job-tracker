import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET() {
  const [activeClients, openTasks, overdueItems] = await Promise.all([
    prisma.client.count({ where: { type: "ACTIVE" } }),
    prisma.task.count({ where: { status: { notIn: ["DONE", "BLOCKED"] } } }),
    prisma.task.count({ where: { dueDate: { lt: new Date() }, status: { notIn: ["DONE"] } } }),
  ]);

  // No revenue figures here: the dashboard tile was removed and finances are
  // owner-only (served solely by /api/money/summary behind its own gate).
  return NextResponse.json({
    success: true,
    data: { activeClients, openTasks, overdueItems },
  });
}
