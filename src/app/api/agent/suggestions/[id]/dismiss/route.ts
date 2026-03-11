import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  await prisma.activityLog.create({
    data: {
      actor: "chase",
      action: "dismissed_suggestion",
      details: JSON.stringify({ suggestionId: id }),
    },
  });

  return NextResponse.json({ success: true });
}
