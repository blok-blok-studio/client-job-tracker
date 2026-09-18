import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const existing = await prisma.contentSnippet.findUnique({ where: { id }, select: { id: true } });
  if (!existing) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  await prisma.contentSnippet.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
