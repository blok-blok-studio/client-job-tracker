import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { taskSchema } from "@/lib/validations";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const status = searchParams.get("status");
  const priority = searchParams.get("priority");
  const category = searchParams.get("category");
  const clientId = searchParams.get("clientId");
  const assignedTo = searchParams.get("assignedTo");
  const search = searchParams.get("search");

  const where: Record<string, unknown> = {};
  if (status) where.status = status;
  if (priority) where.priority = priority;
  if (category) where.category = category;
  if (clientId) where.clientId = clientId;
  if (assignedTo) where.assignedTo = assignedTo;
  if (search) where.title = { contains: search, mode: "insensitive" };

  const tasks = await prisma.task.findMany({
    where,
    include: {
      client: { select: { id: true, name: true } },
      _count: { select: { checklistItems: true } },
    },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
  });

  return NextResponse.json({ success: true, data: tasks });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = taskSchema.parse(body);

    const task = await prisma.task.create({
      data: {
        ...parsed,
        description: parsed.description || null,
        dueDate: parsed.dueDate ? new Date(parsed.dueDate) : null,
        recurPattern: parsed.recurPattern || null,
      },
    });

    await prisma.activityLog.create({
      data: {
        taskId: task.id,
        clientId: task.clientId,
        actor: "chase",
        action: "created_task",
        details: `Created task: ${task.title}`,
      },
    });

    return NextResponse.json({ success: true, data: task }, { status: 201 });
  } catch {
    return NextResponse.json({ success: false, error: "Failed to create task" }, { status: 500 });
  }
}
