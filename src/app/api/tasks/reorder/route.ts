import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { reorderSchema } from "@/lib/validations";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { updates } = reorderSchema.parse(body);

    await prisma.$transaction(
      updates.map((u) =>
        prisma.task.update({
          where: { id: u.id },
          data: { sortOrder: u.sortOrder, status: u.status },
        })
      )
    );

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ success: false, error: "Failed to reorder" }, { status: 500 });
  }
}
