import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { notifySlackTaskEvent } from "@/lib/slack";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const logs = await prisma.activityLog.findMany({
    where: { taskId: id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return NextResponse.json({ success: true, data: logs });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const body = await request.json();
    const { details } = z.object({ details: z.string().min(1).max(2000) }).parse(body);

    const task = await prisma.task.findUnique({
      where: { id },
      select: { clientId: true, title: true, client: { select: { name: true } } },
    });
    if (!task) {
      return NextResponse.json({ success: false, error: "Task not found" }, { status: 404 });
    }

    const session = await getSession();
    const log = await prisma.activityLog.create({
      data: {
        taskId: id,
        clientId: task.clientId,
        actor: session?.name || "chase",
        action: "update",
        details,
      },
    });

    // Convert "@Kyle" style mentions into real Slack pings
    let slackDetail = details;
    try {
      const users = await prisma.user.findMany({
        where: { isActive: true, slackUserId: { not: null } },
        select: { name: true, slackUserId: true },
      });
      for (const u of users) {
        const first = u.name.split(" ")[0];
        const re = new RegExp(`@(${u.name}|${first})\\b`, "gi");
        slackDetail = slackDetail.replace(re, `<@${u.slackUserId}>`);
      }
    } catch { /* mentions are best-effort */ }

    notifySlackTaskEvent({
      kind: "update",
      title: task.title,
      clientName: task.client?.name,
      actor: session?.name,
      detail: slackDetail,
    }).catch(() => {});

    return NextResponse.json({ success: true, data: log }, { status: 201 });
  } catch {
    return NextResponse.json({ success: false, error: "Failed to post update" }, { status: 500 });
  }
}
