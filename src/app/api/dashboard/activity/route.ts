import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET() {
  const activities = await prisma.activityLog.findMany({
    where: { actor: "agent" },
    orderBy: { createdAt: "desc" },
    take: 20,
    include: { client: { select: { name: true } } },
  });

  return NextResponse.json({
    success: true,
    data: (activities as Array<Record<string, unknown>>).map((a) => ({
      id: a.id,
      action: a.action,
      details: a.details,
      clientName: (a as { client?: { name: string } }).client?.name || null,
      createdAt: (a.createdAt as Date).toISOString(),
    })),
  });
}
