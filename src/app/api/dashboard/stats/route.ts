import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET() {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [activeClients, openTasks, overdueItems, clients, paidLinks] = await Promise.all([
    prisma.client.count({ where: { type: "ACTIVE" } }),
    prisma.task.count({ where: { status: { notIn: ["DONE", "BLOCKED"] } } }),
    prisma.task.count({ where: { dueDate: { lt: new Date() }, status: { notIn: ["DONE"] } } }),
    prisma.client.findMany({
      where: { type: "ACTIVE", monthlyRetainer: { not: null } },
      select: { monthlyRetainer: true },
    }),
    prisma.paymentLink.findMany({
      where: {
        status: { in: ["PAID", "ACTIVE"] },
        paidAt: { gte: monthStart },
      },
      select: { amount: true },
    }),
  ]);

  const retainerRevenue = clients.reduce(
    (sum, c) => sum + (c.monthlyRetainer ? Number(c.monthlyRetainer) : 0),
    0
  );
  const paymentRevenue = paidLinks.reduce(
    (sum, p) => sum + p.amount / 100,
    0
  );
  const monthlyRevenue = retainerRevenue + paymentRevenue;

  return NextResponse.json({
    success: true,
    data: { activeClients, openTasks, overdueItems, monthlyRevenue },
  });
}
