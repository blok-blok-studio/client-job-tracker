import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { notifySlackChecklist } from "@/lib/slack";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  const { id, itemId } = await params;
  try {
    const body = await request.json();
    const before = await prisma.checklistItem.findUnique({
      where: { id: itemId },
      select: { checked: true },
    });

    const item = await prisma.checklistItem.update({
      where: { id: itemId },
      data: {
        checked: body.checked ?? undefined,
        label: body.label ?? undefined,
      },
    });

    // Newly ticked off → Slack with running progress
    if (body.checked === true && before && !before.checked) {
      const [task, doneCount, totalCount, session] = await Promise.all([
        prisma.task.findUnique({
          where: { id },
          select: { title: true, client: { select: { name: true } } },
        }),
        prisma.checklistItem.count({ where: { taskId: id, checked: true } }),
        prisma.checklistItem.count({ where: { taskId: id } }),
        getSession(),
      ]);
      if (task) {
        after(() =>
          notifySlackChecklist({
            taskTitle: task.title,
            clientName: task.client?.name,
            actor: session?.name,
            itemLabel: item.label,
            done: doneCount,
            total: totalCount,
          }).catch(() => {})
        );
      }
    }

    return NextResponse.json({ success: true, data: item });
  } catch {
    return NextResponse.json({ success: false, error: "Failed to update item" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  const { itemId } = await params;
  await prisma.checklistItem.delete({ where: { id: itemId } });
  return NextResponse.json({ success: true });
}
