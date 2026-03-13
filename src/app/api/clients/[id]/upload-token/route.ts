import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { randomUUID } from "crypto";

// POST — generate or regenerate upload token for client
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const token = randomUUID();

    const client = await prisma.client.update({
      where: { id },
      data: { uploadToken: token },
      select: { id: true, name: true, uploadToken: true },
    });

    return NextResponse.json({ success: true, data: client });
  } catch {
    return NextResponse.json({ success: false, error: "Failed to generate token" }, { status: 500 });
  }
}

// DELETE — revoke upload token
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    await prisma.client.update({
      where: { id },
      data: { uploadToken: null },
    });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ success: false, error: "Failed to revoke token" }, { status: 500 });
  }
}
