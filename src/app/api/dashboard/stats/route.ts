import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET() {
  const [activeClients, openTasks, overdueItems, clients] = await Promise.all([
    prisma.client.count({ where: { type: "ACTIVE" } }),
    prisma.task.count({ where: { status: { notIn: ["DONE", "BLOCKED"] } } }),
    prisma.task.count({ where: { dueDate: { lt: new Date() }, status: { notIn: ["DONE"] } } }),
    prisma.client.findMany({
      where: { type: "ACTIVE", monthlyRetainer: { not: null } },
      select: { monthlyRetainer: true },
    }),
  ]);

  const monthlyRevenue = clients.reduce(
    (sum, c) => sum + (c.monthlyRetainer ? Number(c.monthlyRetainer) : 0),
    0
  );

  return NextResponse.json({
    success: true,
    data: { activeClients, openTasks, overdueItems, monthlyRevenue },
  });
}
