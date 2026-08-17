import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { notifyUser } from "@/lib/notifications";
import { notifySlack, slackMention } from "@/lib/slack";
import { requestMeta } from "@/lib/request-meta";

const VALID_STATUSES = ["NEW", "IN_PROGRESS", "DONE"] as const;

const patchSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  meetingDate: z.string().optional(),
  clientId: z.string().optional().nullable(),
  fathomUrl: z.string().url("Fathom link must be a URL").max(500).optional().or(z.literal("")).nullable(),
  transcript: z.string().max(500_000).optional().nullable(),
  notes: z.string().max(50_000).optional().nullable(),
  status: z.enum(VALID_STATUSES).optional(),
  assigneeIds: z.array(z.string()).max(20).optional(),
});

// GET /api/meetings/[id] — full handoff: transcript, tasks, comments
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const meeting = await prisma.meeting.findUnique({
    where: { id },
    include: {
      client: { select: { id: true, name: true, company: true } },
      tasks: {
        select: { id: true, title: true, status: true, assignedTo: true, dueDate: true },
        orderBy: { createdAt: "asc" },
      },
      comments: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!meeting) {
    return NextResponse.json({ success: false, error: "Meeting not found" }, { status: 404 });
  }
  return NextResponse.json({ success: true, data: meeting });
}

// PATCH /api/meetings/[id] — edit fields / status / assignees.
// Newly added assignees get the same ping as on create.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const parsed = patchSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message || "Invalid input" },
        { status: 400 }
      );
    }
    const input = parsed.data;

    const existing = await prisma.meeting.findUnique({
      where: { id },
      select: { id: true, assigneeIds: true, status: true, clientId: true },
    });
    if (!existing) {
      return NextResponse.json({ success: false, error: "Meeting not found" }, { status: 404 });
    }

    const data: Record<string, unknown> = {};
    if (input.title !== undefined) data.title = input.title;
    if (input.meetingDate !== undefined) data.meetingDate = new Date(input.meetingDate);
    if (input.clientId !== undefined) data.clientId = input.clientId || null;
    if (input.fathomUrl !== undefined) data.fathomUrl = input.fathomUrl || null;
    if (input.transcript !== undefined) data.transcript = input.transcript || null;
    if (input.notes !== undefined) data.notes = input.notes || null;
    if (input.status !== undefined) data.status = input.status;

    let addedAssignees: Array<{ id: string; name: string; slackUserId: string | null }> = [];
    if (input.assigneeIds !== undefined) {
      const users = await prisma.user.findMany({
        where: { isActive: true },
        select: { id: true, name: true, slackUserId: true },
      });
      const next = input.assigneeIds.filter((uid) => users.some((u) => u.id === uid));
      data.assigneeIds = next;
      addedAssignees = users.filter(
        (u) => next.includes(u.id) && !existing.assigneeIds.includes(u.id) && u.id !== session.id
      );
    }

    const meeting = await prisma.meeting.update({
      where: { id },
      data,
      include: { client: { select: { id: true, name: true } } },
    });

    if (input.status && input.status !== existing.status && meeting.clientId) {
      await prisma.activityLog.create({
        data: {
          clientId: meeting.clientId,
          actor: session.name,
          action: "meeting_status",
          details: `Meeting "${meeting.title}" marked ${input.status.replace(/_/g, " ").toLowerCase()}`,
          ...requestMeta(request),
        },
      });
    }

    after(async () => {
      for (const a of addedAssignees) {
        await notifyUser({
          userId: a.id,
          type: "meeting_assigned",
          title: `${session.name} handed you a meeting: "${meeting.title}"`,
          body: meeting.client?.name ? `Client: ${meeting.client.name}` : null,
          link: `/meetings/${meeting.id}`,
          clientId: meeting.clientId,
        }).catch(() => {});
        await notifySlack(
          `:memo: ${slackMention(a.name, a.slackUserId)} — *${session.name}* added you to meeting *${meeting.title}*${
            meeting.client?.name ? ` (*${meeting.client.name}*)` : ""
          }`
        ).catch(() => {});
      }
    });

    return NextResponse.json({ success: true, data: meeting });
  } catch (error) {
    console.error("Failed to update meeting:", error);
    return NextResponse.json({ success: false, error: "Failed to update meeting" }, { status: 500 });
  }
}

// DELETE /api/meetings/[id] — removes the handoff; spun-out kanban tasks
// survive (meetingId is set null by the relation).
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const meeting = await prisma.meeting.findUnique({
      where: { id },
      select: { id: true, title: true, clientId: true },
    });
    if (!meeting) {
      return NextResponse.json({ success: false, error: "Meeting not found" }, { status: 404 });
    }

    await prisma.meeting.delete({ where: { id } });

    if (meeting.clientId) {
      await prisma.activityLog.create({
        data: {
          clientId: meeting.clientId,
          actor: session.name,
          action: "meeting_deleted",
          details: `Deleted meeting notes: ${meeting.title}`,
          ...requestMeta(request),
        },
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete meeting:", error);
    return NextResponse.json({ success: false, error: "Failed to delete meeting" }, { status: 500 });
  }
}
