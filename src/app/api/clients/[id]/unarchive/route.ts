import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

// POST — restore an archived client back to ACTIVE
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const client = await prisma.client.update({
      where: { id },
      data: { type: "ACTIVE" },
      select: { id: true, name: true, type: true },
    });

    await prisma.activityLog.create({
      data: {
        clientId: id,
        actor: "chase",
        action: "unarchived_client",
        details: `Restored client: ${client.name}`,
      },
    });

    return NextResponse.json({ success: true, data: client });
  } catch {
    return NextResponse.json({ success: false, error: "Failed to unarchive client" }, { status: 500 });
  }
}
