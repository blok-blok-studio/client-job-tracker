import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await prisma.analyticsFunnel.deleteMany({ where: { id } });
  return NextResponse.json({ success: true });
}
