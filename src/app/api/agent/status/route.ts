import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET() {
  const config = await prisma.agentConfig.findUnique({ where: { id: "default" } });

  const now = new Date();
  now.setHours(0, 0, 0, 0);

  const [lastRun, todayActions] = await Promise.all([
    prisma.activityLog.findFirst({
      where: { actor: "agent", action: "cycle_completed" },
      orderBy: { createdAt: "desc" },
    }),
    prisma.activityLog.count({
      where: { actor: "agent", createdAt: { gte: now } },
    }),
  ]);

  return NextResponse.json({
    success: true,
    data: {
      config,
      lastRun: lastRun?.createdAt.toISOString() || null,
      actionsToday: todayActions,
      nextRun: config?.isActive && lastRun
        ? new Date(lastRun.createdAt.getTime() + (config.runIntervalMins || 30) * 60000).toISOString()
        : null,
    },
  });
}
