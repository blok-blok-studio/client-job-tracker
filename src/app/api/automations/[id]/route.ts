import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const flow = await prisma.automationFlow.findUnique({
    where: { id },
    include: {
      client: { select: { id: true, name: true } },
      _count: { select: { executions: true } },
    },
  });

  if (!flow) {
    return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true, data: flow });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const body = await request.json();

    const data: Record<string, unknown> = {};
    if (body.name !== undefined) data.name = body.name;
    if (body.description !== undefined) data.description = body.description;
    if (body.platform !== undefined) data.platform = body.platform;
    if (body.trigger !== undefined) data.trigger = body.trigger;
    if (body.triggerConfig !== undefined) data.triggerConfig = body.triggerConfig;
    if (body.nodes !== undefined) data.nodes = body.nodes;
    if (body.edges !== undefined) data.edges = body.edges;
    if (body.active !== undefined) data.active = body.active;

    const flow = await prisma.automationFlow.update({
      where: { id },
      data,
    });

    return NextResponse.json({ success: true, data: flow });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to update";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    await prisma.automationFlow.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ success: false, error: "Failed to delete" }, { status: 500 });
  }
}
