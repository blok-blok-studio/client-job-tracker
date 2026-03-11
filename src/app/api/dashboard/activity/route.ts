import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { Prisma } from "@prisma/client";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const limit = Math.min(Number(searchParams.get("limit") || 50), 100);
  const cursor = searchParams.get("cursor") || undefined;
  const clientId = searchParams.get("clientId") || undefined;
  const actor = searchParams.get("actor") || undefined;

  const where: Prisma.ActivityLogWhereInput = {};
  if (clientId) where.clientId = clientId;
  if (actor) where.actor = actor;

  const queryArgs: Prisma.ActivityLogFindManyArgs = {
    where,
    orderBy: { createdAt: "desc" },
    take: limit + 1,
    include: {
      client: { select: { id: true, name: true } },
      task: { select: { id: true, title: true } },
    },
  };

  if (cursor) {
    queryArgs.cursor = { id: cursor };
    queryArgs.skip = 1;
  }

  const activities = await prisma.activityLog.findMany(queryArgs);

  const hasMore = activities.length > limit;
  const data = activities.slice(0, limit);
  const nextCursor = hasMore ? data[data.length - 1]?.id : null;

  return NextResponse.json({
    success: true,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data: data.map((a: any) => ({
      id: a.id,
      actor: a.actor,
      action: a.action,
      details: a.details,
      clientId: a.client?.id || null,
      clientName: a.client?.name || null,
      taskId: a.task?.id || null,
      taskTitle: a.task?.title || null,
      createdAt: a.createdAt.toISOString(),
    })),
    nextCursor,
  });
}
