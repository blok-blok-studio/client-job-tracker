import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const action = searchParams.get("action");
  const clientId = searchParams.get("clientId");
  const page = parseInt(searchParams.get("page") || "1");
  const limit = parseInt(searchParams.get("limit") || "50");

  const where: Record<string, unknown> = { actor: "agent" };
  if (action) where.action = action;
  if (clientId) where.clientId = clientId;

  const [activities, total] = await Promise.all([
    prisma.activityLog.findMany({
      where,
      include: { client: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.activityLog.count({ where }),
  ]);

  return NextResponse.json({
    success: true,
    data: activities,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
}
