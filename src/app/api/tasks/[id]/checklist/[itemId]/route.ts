import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  const { itemId } = await params;
  try {
    const body = await request.json();
    const item = await prisma.checklistItem.update({
      where: { id: itemId },
      data: {
        checked: body.checked ?? undefined,
        label: body.label ?? undefined,
      },
    });
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
