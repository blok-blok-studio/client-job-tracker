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

// GET /api/meetings/[id]/comments — the handoff's discussion thread, oldest first
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const comments = await prisma.meetingComment.findMany({
    where: { meetingId: id },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json({ success: true, data: comments });
}

// POST /api/meetings/[id]/comments — add a comment; @mentions, the assignees,
// and whoever posted the meeting get a Slack ping + an inbox notification
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

    const meeting = await prisma.meeting.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        clientId: true,
        assigneeIds: true,
        createdById: true,
        client: { select: { name: true } },
      },
    });
    if (!meeting) {
      return NextResponse.json({ success: false, error: "Meeting not found" }, { status: 404 });
    }

    const users = await prisma.user.findMany({
      where: { isActive: true },
      select: { id: true, name: true, slackUserId: true },
    });
    const mentioned = extractMentions(parsed.data.body, users);

    const comment = await prisma.meetingComment.create({
      data: {
        meetingId: id,
        authorId: session.id,
        authorName: session.name,
        body: parsed.data.body,
        mentions: mentioned.map((m) => m.id),
      },
    });

    // Notify mentions, assignees, and the poster — once each, never the author
    const link = `/meetings/${id}`;
    const excerpt = parsed.data.body.length > 200 ? `${parsed.data.body.slice(0, 200)}…` : parsed.data.body;
    const recipients = new Map<string, { id: string; name: string; slackUserId: string | null; kind: "mention" | "meeting_comment" }>();
    for (const m of mentioned) {
      if (m.id === session.id) continue;
      const u = users.find((x) => x.id === m.id);
      recipients.set(m.id, { id: m.id, name: m.name, slackUserId: u?.slackUserId || null, kind: "mention" });
    }
    for (const uid of [...meeting.assigneeIds, meeting.createdById]) {
      if (!uid || uid === session.id || recipients.has(uid)) continue;
      const u = users.find((x) => x.id === uid);
      if (u) recipients.set(uid, { ...u, kind: "meeting_comment" });
    }

    after(async () => {
      const clientNote = meeting.client?.name ? ` (${meeting.client.name})` : "";
      for (const r of recipients.values()) {
        await notifyUser({
          userId: r.id,
          type: r.kind,
          title:
            r.kind === "mention"
              ? `${session.name} mentioned you on meeting "${meeting.title}"`
              : `${session.name} commented on meeting "${meeting.title}"`,
          body: excerpt,
          link,
          clientId: meeting.clientId,
        }).catch(() => {});
        await notifySlack(
          `:speech_balloon: ${slackMention(r.name, r.slackUserId)} — *${session.name}* ${
            r.kind === "mention" ? "mentioned you on" : "commented on"
          } meeting *${meeting.title}*${clientNote}:\n> ${excerpt.replace(/\n/g, "\n> ")}`
        ).catch(() => {});
      }
    });

    return NextResponse.json({ success: true, data: comment }, { status: 201 });
  } catch {
    return NextResponse.json({ success: false, error: "Failed to add comment" }, { status: 500 });
  }
}
