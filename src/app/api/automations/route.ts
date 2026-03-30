import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const clientId = request.nextUrl.searchParams.get("clientId");

  const where: Record<string, unknown> = {};
  if (clientId) where.clientId = clientId;

  const flows = await prisma.automationFlow.findMany({
    where,
    include: {
      client: { select: { id: true, name: true } },
      _count: { select: { executions: true } },
    },
    orderBy: { updatedAt: "desc" },
  });

  return NextResponse.json({ success: true, data: flows });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const flow = await prisma.automationFlow.create({
      data: {
        clientId: body.clientId,
        name: body.name,
        description: body.description || null,
        platform: body.platform || "INSTAGRAM",
        trigger: body.trigger || "KEYWORD",
        triggerConfig: body.triggerConfig || null,
        nodes: body.nodes || [],
        edges: body.edges || [],
        active: false,
      },
    });

    await prisma.activityLog.create({
      data: {
        clientId: body.clientId,
        actor: "chase",
        action: "automation_created",
        details: `Created automation flow: ${body.name}`,
      },
    });

    return NextResponse.json({ success: true, data: flow }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create automation";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
