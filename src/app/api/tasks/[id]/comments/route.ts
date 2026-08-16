import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { notifySlack, slackMention } from "@/lib/slack";
import { notifyUser, extractMentions } from "@/lib/notifications";

const createSchema = z.object({
  body: z.string().min(1, "Say something").max(5000),
});

// GET /api/tasks/[id]/comments — the card's discussion thread, oldest first
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const comments = await prisma.taskComment.findMany({
    where: { taskId: id },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json({ success: true, data: comments });
}

// POST /api/tasks/[id]/comments — add a comment; @mentions and the assignee
// get a Slack ping + an inbox notification
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

    const body = await request.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message || "Invalid input" },
        { status: 400 }
      );
    }

    const task = await prisma.task.findUnique({
      where: { id },
      select: { id: true, title: true, clientId: true, assignedTo: true, client: { select: { name: true } } },
    });
    if (!task) {
      return NextResponse.json({ success: false, error: "Task not found" }, { status: 404 });
    }

    const users = await prisma.user.findMany({
      where: { isActive: true },
      select: { id: true, name: true, slackUserId: true },
    });
    const mentioned = extractMentions(parsed.data.body, users);

    const comment = await prisma.taskComment.create({
      data: {
        taskId: id,
        authorId: session.id,
        authorName: session.name,
        body: parsed.data.body,
        mentions: mentioned.map((m) => m.id),
      },
    });

    // Notify mentioned people + the assignee (once each, never the author)
    const link = `/kanban?task=${id}`;
    const excerpt = parsed.data.body.length > 200 ? `${parsed.data.body.slice(0, 200)}…` : parsed.data.body;
    const recipients = new Map<string, { id: string; name: string; slackUserId: string | null; kind: "mention" | "task_comment" }>();
    for (const m of mentioned) {
      if (m.id === session.id) continue;
      const u = users.find((x) => x.id === m.id);
      recipients.set(m.id, { id: m.id, name: m.name, slackUserId: u?.slackUserId || null, kind: "mention" });
    }
    if (task.assignedTo) {
      const assignee = users.find((u) => u.name.toLowerCase() === task.assignedTo!.toLowerCase());
      if (assignee && assignee.id !== session.id && !recipients.has(assignee.id)) {
        recipients.set(assignee.id, { ...assignee, kind: "task_comment" });
      }
    }

    after(async () => {
      const clientNote = task.client?.name ? ` (${task.client.name})` : "";
      for (const r of recipients.values()) {
        await notifyUser({
          userId: r.id,
          type: r.kind,
          title:
            r.kind === "mention"
              ? `${session.name} mentioned you on "${task.title}"`
              : `${session.name} commented on "${task.title}"`,
          body: excerpt,
          link,
          taskId: id,
          clientId: task.clientId,
        }).catch(() => {});
        await notifySlack(
          `:speech_balloon: ${slackMention(r.name, r.slackUserId)} — *${session.name}* ${
            r.kind === "mention" ? "mentioned you on" : "commented on your task"
          } *${task.title}*${clientNote}:\n> ${excerpt.replace(/\n/g, "\n> ")}`
        ).catch(() => {});
      }
    });

    return NextResponse.json({ success: true, data: comment }, { status: 201 });
  } catch {
    return NextResponse.json({ success: false, error: "Failed to add comment" }, { status: 500 });
  }
}
