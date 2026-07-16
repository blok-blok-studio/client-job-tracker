import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { reorderSchema } from "@/lib/validations";
import { getSession } from "@/lib/auth";
import { notifySlackTaskDone } from "@/lib/slack";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { updates } = reorderSchema.parse(body);

    // Snapshot current statuses so we can detect tasks newly moved to DONE
    const before = await prisma.task.findMany({
      where: { id: { in: updates.map((u) => u.id) } },
      select: { id: true, status: true, title: true, client: { select: { name: true } } },
    });
    const beforeById = new Map(before.map((t) => [t.id, t]));

    await prisma.$transaction(
      updates.map((u) =>
        prisma.task.update({
          where: { id: u.id },
          data: { sortOrder: u.sortOrder, status: u.status },
        })
      )
    );

    const newlyDone = updates.filter((u) => {
      const prev = beforeById.get(u.id);
      return prev && u.status === "DONE" && prev.status !== "DONE";
    });

    if (newlyDone.length > 0) {
      const session = await getSession();
      for (const u of newlyDone) {
        const prev = beforeById.get(u.id)!;
        notifySlackTaskDone({
          title: prev.title,
          clientName: prev.client?.name,
          actor: session?.name,
        }).catch(() => {});
      }
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ success: false, error: "Failed to reorder" }, { status: 500 });
  }
}
