import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET() {
  const suggestions = await prisma.activityLog.findMany({
    where: {
      actor: "agent",
      action: "suggested_action",
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return NextResponse.json({ success: true, data: suggestions });
}
