import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const [entries, total] = await Promise.all([
    prisma.timeEntry.findMany({
      where: { taskId: id },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    prisma.timeEntry.aggregate({ where: { taskId: id }, _sum: { minutes: true } }),
  ]);
  return NextResponse.json({
    success: true,
    data: { entries, totalMinutes: total._sum.minutes || 0 },
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const body = await request.json();
    const { minutes, note } = z
      .object({ minutes: z.number().int().min(1).max(24 * 60), note: z.string().max(500).optional() })
      .parse(body);

    const task = await prisma.task.findUnique({ where: { id }, select: { clientId: true } });
    if (!task) {
      return NextResponse.json({ success: false, error: "Task not found" }, { status: 404 });
    }

    const session = await getSession();
    const entry = await prisma.timeEntry.create({
      data: {
        taskId: id,
        clientId: task.clientId,
        userName: session?.name || "unknown",
        minutes,
        note: note?.trim() || null,
      },
    });

    return NextResponse.json({ success: true, data: entry }, { status: 201 });
  } catch {
    return NextResponse.json({ success: false, error: "Failed to log time" }, { status: 500 });
  }
}
