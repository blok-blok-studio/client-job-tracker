import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET() {
  const tasks = await prisma.task.findMany({
    where: { dueDate: { not: null }, status: { notIn: ["DONE"] } },
    orderBy: { dueDate: "asc" },
    take: 20,
    include: { client: { select: { name: true } } },
  });

  return NextResponse.json({
    success: true,
    data: (tasks as Array<Record<string, unknown>>).map((t) => ({
      id: t.id,
      title: t.title,
      dueDate: t.dueDate ? (t.dueDate as Date).toISOString() : null,
      priority: t.priority,
      status: t.status,
      clientName: (t as { client?: { name: string } }).client?.name || null,
    })),
  });
}
