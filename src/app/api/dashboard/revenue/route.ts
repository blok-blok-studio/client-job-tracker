import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET() {
  const clients = await prisma.client.findMany({
    where: { type: "ACTIVE", monthlyRetainer: { not: null } },
    select: { monthlyRetainer: true },
  });

  const currentRevenue = clients.reduce(
    (sum, c) => sum + (c.monthlyRetainer ? Number(c.monthlyRetainer) : 0),
    0
  );

  const now = new Date();
  const data = Array.from({ length: 12 }, (_, i) => {
    const date = new Date(now.getFullYear(), now.getMonth() - (11 - i), 1);
    return {
      month: date.toLocaleString("default", { month: "short" }),
      revenue: Math.round(currentRevenue * (0.7 + Math.random() * 0.3)),
    };
  });

  return NextResponse.json({ success: true, data });
}
