import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { taskSchema } from "@/lib/validations";
import { getSession } from "@/lib/auth";
import { notifySlackTaskEvent, slackMention } from "@/lib/slack";

const VALID_STATUSES = ["BACKLOG", "TODO", "IN_PROGRESS", "IN_REVIEW", "DONE", "BLOCKED"] as const;
const VALID_PRIORITIES = ["URGENT", "HIGH", "MEDIUM", "LOW"] as const;
const VALID_CATEGORIES = [
  "GENERAL", "CONTENT_CREATION", "SOCIAL_MEDIA", "CLIENT_COMMS",
  "REPORTING", "STRATEGY", "INVOICING", "ONBOARDING",
  "OFFBOARDING", "DEVELOPMENT", "DESIGN",
] as const;

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const status = searchParams.get("status");
  const priority = searchParams.get("priority");
  const category = searchParams.get("category");
  const clientId = searchParams.get("clientId");
  const assignedTo = searchParams.get("assignedTo");
  const search = searchParams.get("search");

  const where: Record<string, unknown> = {};
  if (status && (VALID_STATUSES as readonly string[]).includes(status)) where.status = status;
  if (priority && (VALID_PRIORITIES as readonly string[]).includes(priority)) where.priority = priority;
  if (category && (VALID_CATEGORIES as readonly string[]).includes(category)) where.category = category;
  if (clientId) where.clientId = clientId;
  if (assignedTo) where.assignedTo = assignedTo;
  if (search) where.title = { contains: search, mode: "insensitive" };

  const tasks = await prisma.task.findMany({
    where,
    include: {
      client: { select: { id: true, name: true } },
      checklistItems: { select: { checked: true } },
      _count: { select: { checklistItems: true, activityLogs: true } },
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
      include: { client: { select: { name: true } } },
    });

    const session = await getSession();
    await prisma.activityLog.create({
      data: {
        taskId: task.id,
        clientId: task.clientId,
        actor: session?.name || "chase",
        action: "created_task",
        details: `Created task: ${task.title}`,
      },
    });

    let assignedNote = "";
    if (task.assignedTo && task.assignedTo.toLowerCase() !== "agent") {
      const assignee = await prisma.user.findFirst({
        where: { name: { equals: task.assignedTo, mode: "insensitive" } },
        select: { name: true, slackUserId: true },
      });
      assignedNote = ` — assigned to ${slackMention(assignee?.name || task.assignedTo, assignee?.slackUserId)}`;
    }
    notifySlackTaskEvent({
      kind: "created",
      title: `${task.title}`,
      clientName: task.client?.name,
      actor: session?.name,
      detail: assignedNote,
    }).catch(() => {});

    return NextResponse.json({ success: true, data: task }, { status: 201 });
  } catch {
    return NextResponse.json({ success: false, error: "Failed to create task" }, { status: 500 });
  }
}
