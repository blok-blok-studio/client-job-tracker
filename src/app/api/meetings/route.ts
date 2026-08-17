import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { notifySlackMeetingPosted } from "@/lib/slack";
import { notifyUser } from "@/lib/notifications";
import { requestMeta } from "@/lib/request-meta";

const createSchema = z.object({
  title: z.string().min(1, "Give the meeting a title").max(200),
  meetingDate: z.string().optional(),
  clientId: z.string().optional().nullable(),
  fathomUrl: z.string().url("Fathom link must be a URL").max(500).optional().or(z.literal("")).nullable(),
  transcript: z.string().max(500_000).optional().nullable(),
  notes: z.string().max(50_000).optional().nullable(),
  assigneeIds: z.array(z.string()).max(20).optional(),
});

// GET /api/meetings — the handoff hub list. Filtering is client-side except
// the optional clientId (used by client pages).
export async function GET(request: NextRequest) {
  const clientId = request.nextUrl.searchParams.get("clientId");
  const where: Record<string, unknown> = {};
  if (clientId) where.clientId = clientId;

  const meetings = await prisma.meeting.findMany({
    where,
    select: {
      id: true,
      title: true,
      meetingDate: true,
      fathomUrl: true,
      notes: true,
      status: true,
      assigneeIds: true,
      createdByName: true,
      createdAt: true,
      // transcript deliberately omitted — it can be huge; the detail route serves it
      client: { select: { id: true, name: true, company: true } },
      _count: { select: { tasks: true, comments: true } },
    },
    orderBy: { meetingDate: "desc" },
  });

  return NextResponse.json({ success: true, data: meetings });
}

// POST /api/meetings — post a handoff; assignees get a Slack ping + inbox row
export async function POST(request: NextRequest) {
  try {
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

    // Keep the assignee list to real, active teammates
    const users = await prisma.user.findMany({
      where: { isActive: true },
      select: { id: true, name: true, slackUserId: true },
    });
    const assigneeIds = (input.assigneeIds || []).filter((id) => users.some((u) => u.id === id));

    const meeting = await prisma.meeting.create({
      data: {
        title: input.title,
        meetingDate: input.meetingDate ? new Date(input.meetingDate) : new Date(),
        clientId: input.clientId || null,
        fathomUrl: input.fathomUrl || null,
        transcript: input.transcript || null,
        notes: input.notes || null,
        assigneeIds,
        createdById: session.id,
        createdByName: session.name,
      },
      include: { client: { select: { id: true, name: true } } },
    });

    if (meeting.clientId) {
      await prisma.activityLog.create({
        data: {
          clientId: meeting.clientId,
          actor: session.name,
          action: "meeting_posted",
          details: `Posted meeting notes: ${meeting.title}`,
          ...requestMeta(request),
        },
      });
    }

    const assignees = users.filter((u) => assigneeIds.includes(u.id));
    after(async () => {
      await notifySlackMeetingPosted({
        title: meeting.title,
        clientName: meeting.client?.name,
        actor: session.name,
        meetingId: meeting.id,
        assignees,
        hasRecording: !!meeting.fathomUrl,
      }).catch(() => {});
      for (const a of assignees) {
        if (a.id === session.id) continue;
        await notifyUser({
          userId: a.id,
          type: "meeting_assigned",
          title: `${session.name} handed you a meeting: "${meeting.title}"`,
          body: meeting.client?.name ? `Client: ${meeting.client.name}` : null,
          link: `/meetings/${meeting.id}`,
          clientId: meeting.clientId,
        }).catch(() => {});
      }
    });

    return NextResponse.json({ success: true, data: meeting }, { status: 201 });
  } catch (error) {
    console.error("Failed to create meeting:", error);
    return NextResponse.json({ success: false, error: "Failed to create meeting" }, { status: 500 });
  }
}
