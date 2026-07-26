import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import prisma from "@/lib/prisma";
import { taskSchema } from "@/lib/validations";
import { syncEvent } from "@/lib/sync";
import { notifySlackTaskDone, notifySlackTaskEvent, notifySlackTaskAssigned } from "@/lib/slack";
import { getSession } from "@/lib/auth";
import { requestMeta } from "@/lib/request-meta";
import { releaseDependents, applyBlockedState, wouldCycle } from "@/lib/task-deps";

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
      blockedBy: { select: { id: true, title: true, status: true } },
      blocks: { select: { id: true, title: true, status: true } },
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
    else if (parsed.status) data.completedAt = null;

    const oldTask = await prisma.task.findUnique({ where: { id } });
    // Track time-in-Blocked for the stale-blocked nudge
    if (parsed.status === "BLOCKED" && oldTask?.status !== "BLOCKED") {
      data.blockedAt = new Date();
      data.blockedAlertAt = null;
    } else if (parsed.status && parsed.status !== "BLOCKED" && oldTask?.status === "BLOCKED") {
      data.blockedAt = null;
      data.blockedAlertAt = null;
    }

    // Dependencies: replace the full blocker set when the modal sends one.
    // Only ids that exist survive, and circular chains are rejected outright —
    // two tasks waiting on each other would deadlock the auto-unblock.
    let blockedByIds = Array.isArray(body.blockedByIds)
      ? (body.blockedByIds as unknown[]).filter((x): x is string => typeof x === "string" && x !== id).slice(0, 50)
      : null;
    if (blockedByIds) {
      const found = await prisma.task.findMany({
        where: { id: { in: blockedByIds } },
        select: { id: true },
      });
      blockedByIds = found.map((f) => f.id);
      const cycleWith = await wouldCycle(id, blockedByIds);
      if (cycleWith) {
        return NextResponse.json(
          {
            success: false,
            error: `Can't add that dependency — "${cycleWith}" already depends on this task (the two would block each other forever).`,
          },
          { status: 400 }
        );
      }
      data.blockedBy = { set: blockedByIds.map((bid) => ({ id: bid })) };
    }

    const task = await prisma.task.update({ where: { id }, data });

    // Blocker list changed → keep BLOCKED/TODO status honest automatically
    if (blockedByIds) {
      await applyBlockedState(id).catch((err) => console.error("[Tasks] applyBlockedState:", err));
    }
    // Task finished → release anything it was holding up
    if (parsed.status === "DONE" && oldTask?.status !== "DONE") {
      after(() => releaseDependents(id).catch(() => {}));
    }

    // Assignment changed to a team member → tag them in Slack
    if (
      parsed.assignedTo &&
      oldTask &&
      parsed.assignedTo !== oldTask.assignedTo &&
      parsed.assignedTo.toLowerCase() !== "agent"
    ) {
      const [assignee, client, session] = await Promise.all([
        prisma.user.findFirst({
          where: { name: { equals: parsed.assignedTo, mode: "insensitive" } },
          select: { name: true, slackUserId: true },
        }),
        task.clientId
          ? prisma.client.findUnique({ where: { id: task.clientId }, select: { name: true } })
          : null,
        getSession(),
      ]);
      after(() =>
        notifySlackTaskAssigned({
          title: task.title,
          clientName: client?.name,
          actor: session?.name,
          assigneeName: assignee?.name || parsed.assignedTo!,
          assigneeSlackId: assignee?.slackUserId,
        }).catch(() => {})
      );
    }

    if (parsed.status && oldTask && parsed.status !== oldTask.status) {
      const [client, session] = await Promise.all([
        task.clientId
          ? prisma.client.findUnique({ where: { id: task.clientId }, select: { name: true } })
          : null,
        getSession(),
      ]);
      if (parsed.status === "DONE") {
        after(() =>
          notifySlackTaskDone({
            title: task.title,
            clientName: client?.name,
            actor: session?.name,
          }).catch(() => {})
        );
      } else {
        after(() =>
          notifySlackTaskEvent({
            kind: "moved",
            title: task.title,
            clientName: client?.name,
            actor: session?.name,
            detail: parsed.status,
          }).catch(() => {})
        );
      }

      await prisma.activityLog.create({
        data: {
          taskId: id,
          clientId: task.clientId,
          actor: session?.name || "chase",
          action: "moved_task",
          details: `Moved "${task.title}" from ${oldTask.status} to ${parsed.status}`,
          ...requestMeta(request),
        },
      });

      // Sync: notify client via Telegram + Cortana when task completes
      if (task.clientId) {
        syncEvent({
          type: "task_status_changed",
          clientId: task.clientId,
          taskId: id,
          title: task.title,
          newStatus: parsed.status,
        }).catch(() => {});
      }
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
