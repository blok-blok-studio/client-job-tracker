import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { notifySlackTaskEvent, slackMention } from "@/lib/slack";
import { notifyUserByName } from "@/lib/notifications";
import { requestMeta } from "@/lib/request-meta";

const createSchema = z.object({
  title: z.string().min(1, "Give the task a title").max(200),
  description: z.string().max(10_000).optional().nullable(),
  assignedTo: z.string().max(100).optional().nullable(),
  dueDate: z.string().optional().nullable(),
  priority: z.enum(["URGENT", "HIGH", "MEDIUM", "LOW"]).optional(),
});

// POST /api/meetings/[id]/tasks — spin a kanban task out of a meeting handoff.
// The task inherits the meeting's client, links back via meetingId, and the
// first task bumps a NEW meeting to IN_PROGRESS (someone picked it up).
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const parsed = createSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message || "Invalid input" },
        { status: 400 }
      );
    }
    const input = parsed.data;

    const meeting = await prisma.meeting.findUnique({
      where: { id },
      select: { id: true, title: true, clientId: true, status: true, client: { select: { name: true } } },
    });
    if (!meeting) {
      return NextResponse.json({ success: false, error: "Meeting not found" }, { status: 404 });
    }

    const task = await prisma.task.create({
      data: {
        title: input.title,
        description: input.description || `From meeting: ${meeting.title}`,
        status: "TODO",
        priority: input.priority || "MEDIUM",
        clientId: meeting.clientId,
        meetingId: meeting.id,
        assignedTo: input.assignedTo || null,
        dueDate: input.dueDate ? new Date(input.dueDate) : null,
        tags: ["meeting"],
      },
      include: { client: { select: { name: true } } },
    });

    if (meeting.status === "NEW") {
      await prisma.meeting.update({ where: { id }, data: { status: "IN_PROGRESS" } });
    }

    await prisma.activityLog.create({
      data: {
        taskId: task.id,
        clientId: task.clientId,
        actor: session.name,
        action: "created_task",
        details: `Created task from meeting "${meeting.title}": ${task.title}`,
        ...requestMeta(request),
      },
    });

    let assignedNote = "";
    if (task.assignedTo) {
      const assignee = await prisma.user.findFirst({
        where: { name: { equals: task.assignedTo, mode: "insensitive" } },
        select: { name: true, slackUserId: true },
      });
      assignedNote = ` — assigned to ${slackMention(assignee?.name || task.assignedTo, assignee?.slackUserId)}`;
    }
    after(() =>
      notifySlackTaskEvent({
        kind: "created",
        title: task.title,
        clientName: task.client?.name,
        actor: session.name,
        detail: `${assignedNote} (from meeting *${meeting.title}*)`,
      }).catch(() => {})
    );

    if (task.assignedTo && task.assignedTo.toLowerCase() !== session.name.toLowerCase()) {
      after(() =>
        notifyUserByName(task.assignedTo, {
          type: "task_assigned",
          title: `${session.name} assigned you "${task.title}"`,
          body: `From meeting: ${meeting.title}`,
          link: `/kanban?task=${task.id}`,
          taskId: task.id,
          clientId: task.clientId,
        }).catch(() => {})
      );
    }

    return NextResponse.json({ success: true, data: task }, { status: 201 });
  } catch (error) {
    console.error("Failed to create task from meeting:", error);
    return NextResponse.json({ success: false, error: "Failed to create task" }, { status: 500 });
  }
}
