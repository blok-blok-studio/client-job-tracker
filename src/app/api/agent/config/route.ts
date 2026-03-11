import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();

    const config = await prisma.agentConfig.upsert({
      where: { id: "default" },
      update: body,
      create: { id: "default", ...body },
    });

    return NextResponse.json({ success: true, data: config });
  } catch {
    return NextResponse.json({ success: false, error: "Failed to update config" }, { status: 500 });
  }
}
