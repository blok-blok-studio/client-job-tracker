import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const status = searchParams.get("status");
  const clientId = searchParams.get("clientId");

  const where: Record<string, unknown> = {};
  if (status && status !== "ALL") where.status = status;
  if (clientId) where.clientId = clientId;

  const tickets = await prisma.supportTicket.findMany({
    where,
    include: {
      client: { select: { name: true, company: true, tier: true } },
      messages: { orderBy: { createdAt: "desc" }, take: 1 },
      _count: { select: { messages: true } },
    },
    orderBy: { updatedAt: "desc" },
  });

  return NextResponse.json({ success: true, data: tickets });
}
