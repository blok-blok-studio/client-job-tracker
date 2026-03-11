import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { z } from "zod";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const items = await prisma.checklistItem.findMany({
    where: { taskId: id },
    orderBy: { sortOrder: "asc" },
  });
  return NextResponse.json({ success: true, data: items });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const body = await request.json();
    const { label } = z.object({ label: z.string().min(1) }).parse(body);

    const maxOrder = await prisma.checklistItem.aggregate({
      where: { taskId: id },
      _max: { sortOrder: true },
    });

    const item = await prisma.checklistItem.create({
      data: {
        taskId: id,
        label,
        sortOrder: (maxOrder._max.sortOrder ?? -1) + 1,
      },
    });

    return NextResponse.json({ success: true, data: item }, { status: 201 });
  } catch {
    return NextResponse.json({ success: false, error: "Failed to create checklist item" }, { status: 500 });
  }
}
