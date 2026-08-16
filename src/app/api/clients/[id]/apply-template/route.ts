import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { notifySlack } from "@/lib/slack";
import { notifyUser } from "@/lib/notifications";
import { TEMPLATE_BY_KEY } from "@/lib/project-templates";
import type { TaskStatus, Priority, TaskCategory } from "@prisma/client";

const applySchema = z.object({
  templateKey: z.string().min(1),
  /** Project start; due dates are template offsets from here. Defaults to today. */
  startDate: z.string().optional(),
});

// POST /api/clients/[id]/apply-template — spawn a template's task set onto a
// client. Assignees resolve by jobRole (first active match); tags carry the
// template key so a spawned project is identifiable on the board.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const parsed = applySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: "Invalid input" }, { status: 400 });
    }

    const template = TEMPLATE_BY_KEY.get(parsed.data.templateKey);
    if (!template) {
      return NextResponse.json({ success: false, error: "Unknown template" }, { status: 400 });
    }

    const client = await prisma.client.findUnique({ where: { id }, select: { id: true, name: true } });
    if (!client) {
      return NextResponse.json({ success: false, error: "Client not found" }, { status: 404 });
    }

    const start = parsed.data.startDate ? new Date(parsed.data.startDate) : new Date();
    if (Number.isNaN(start.getTime())) {
      return NextResponse.json({ success: false, error: "Invalid start date" }, { status: 400 });
    }

    // Role → person: first active user with that jobRole
    const users = await prisma.user.findMany({
      where: { isActive: true },
      select: { id: true, name: true, jobRole: true },
    });
    const byRole = new Map<string, { id: string; name: string }>();
    for (const u of users) {
      if (u.jobRole && !byRole.has(u.jobRole)) byRole.set(u.jobRole, { id: u.id, name: u.name });
    }

    const created: Array<{ id: string; title: string; assignee: { id: string; name: string } | null }> = [];
    for (const t of template.tasks) {
      const assignee = t.role ? byRole.get(t.role) || null : null;
      const dueDate =
        t.offsetDays != null ? new Date(start.getTime() + t.offsetDays * 24 * 60 * 60 * 1000) : null;
      const task = await prisma.task.create({
        data: {
          clientId: id,
          title: t.title,
          description: t.description || null,
          status: "TODO" as TaskStatus,
          priority: t.priority as Priority,
          category: t.category as TaskCategory,
          dueDate,
          assignedTo: assignee?.name || null,
          tags: ["template", template.key],
          ...(t.checklist?.length
            ? { checklistItems: { create: t.checklist.map((label, i) => ({ label, sortOrder: i })) } }
            : {}),
        },
      });
      created.push({ id: task.id, title: task.title, assignee });
    }

    await prisma.activityLog.create({
      data: {
        clientId: id,
        actor: session.name,
        action: "template_applied",
        details: `Started "${template.name}" for ${client.name} — ${created.length} tasks created`,
      },
    });

    // One Slack summary + one inbox note per distinct assignee (no per-task spam)
    after(async () => {
      await notifySlack(
        `:rocket: *${session.name}* started *${template.name}* for *${client.name}* — ${created.length} tasks on the board`
      ).catch(() => {});
      const byAssignee = new Map<string, { name: string; count: number; firstTaskId: string }>();
      for (const c of created) {
        if (!c.assignee || c.assignee.id === session.id) continue;
        const row = byAssignee.get(c.assignee.id);
        if (row) row.count++;
        else byAssignee.set(c.assignee.id, { name: c.assignee.name, count: 1, firstTaskId: c.id });
      }
      for (const [userId, row] of byAssignee) {
        await notifyUser({
          userId,
          type: "task_assigned",
          title: `${session.name} started "${template.name}" for ${client.name} — ${row.count} task${row.count === 1 ? "" : "s"} for you`,
          link: `/kanban?task=${row.firstTaskId}`,
          clientId: id,
        }).catch(() => {});
      }
    });

    return NextResponse.json({ success: true, data: { created: created.length } }, { status: 201 });
  } catch {
    return NextResponse.json({ success: false, error: "Failed to apply template" }, { status: 500 });
  }
}
