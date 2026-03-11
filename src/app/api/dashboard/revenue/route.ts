import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET() {
  const now = new Date();
  const twelveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 11, 1);

  // Get paid invoices from the last 12 months
  const invoices = await prisma.invoice.findMany({
    where: {
      status: "PAID",
      paidAt: { gte: twelveMonthsAgo },
    },
    select: { amount: true, paidAt: true },
  });

  // Get current monthly retainers
  const activeClients = await prisma.client.findMany({
    where: { type: "ACTIVE", monthlyRetainer: { not: null } },
    select: { monthlyRetainer: true },
  });

  const currentRetainer = activeClients.reduce(
    (sum, c) => sum + (c.monthlyRetainer ? Number(c.monthlyRetainer) : 0),
    0
  );

  // Build month-by-month revenue from invoices
  const monthlyData: Record<string, number> = {};
  for (let i = 0; i < 12; i++) {
    const date = new Date(now.getFullYear(), now.getMonth() - (11 - i), 1);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    monthlyData[key] = 0;
  }

  for (const inv of invoices) {
    if (!inv.paidAt) continue;
    const key = `${inv.paidAt.getFullYear()}-${String(inv.paidAt.getMonth() + 1).padStart(2, "0")}`;
    if (key in monthlyData) {
      monthlyData[key] += Number(inv.amount);
    }
  }

  // If no invoices exist, use retainer as baseline for current month
  const currentKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  if (monthlyData[currentKey] === 0 && currentRetainer > 0) {
    monthlyData[currentKey] = currentRetainer;
  }

  const data = Object.entries(monthlyData).map(([key, revenue]) => {
    const [year, month] = key.split("-");
    const date = new Date(Number(year), Number(month) - 1, 1);
    return {
      month: date.toLocaleString("default", { month: "short" }),
      revenue: Math.round(revenue),
    };
  });

  return NextResponse.json({ success: true, data });
}
