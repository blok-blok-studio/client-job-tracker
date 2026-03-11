import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { taskSchema } from "@/lib/validations";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const task = await prisma.task.findUnique({
    where: { id },
    include: {
      client: { select: { id: true, name: true } },
      checklistItems: { orderBy: { sortOrder: "asc" } },
      activityLogs: { orderBy: { createdAt: "desc" }, take: 20 },
    },
  });

  if (!task) {
    return NextResponse.json({ success: false, error: "Task not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true, data: task });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const body = await request.json();
    const parsed = taskSchema.partial().parse(body);

    const data: Record<string, unknown> = { ...parsed };
    if (parsed.dueDate) data.dueDate = new Date(parsed.dueDate);
    if (parsed.status === "DONE") data.completedAt = new Date();

    const oldTask = await prisma.task.findUnique({ where: { id } });
    const task = await prisma.task.update({ where: { id }, data });

    if (parsed.status && oldTask && parsed.status !== oldTask.status) {
      await prisma.activityLog.create({
        data: {
          taskId: id,
          clientId: task.clientId,
          actor: "chase",
          action: "moved_task",
          details: `Moved "${task.title}" from ${oldTask.status} to ${parsed.status}`,
        },
      });
    }

    return NextResponse.json({ success: true, data: task });
  } catch {
    return NextResponse.json({ success: false, error: "Failed to update task" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await prisma.task.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
