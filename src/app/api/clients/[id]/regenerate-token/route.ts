import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { randomBytes } from "crypto";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const onboardToken = randomBytes(24).toString("hex");

    const client = await prisma.client.update({
      where: { id },
      data: { onboardToken },
    });

    return NextResponse.json({
      success: true,
      data: { onboardToken: client.onboardToken },
    });
  } catch {
    return NextResponse.json(
      { success: false, error: "Failed to regenerate token" },
      { status: 500 }
    );
  }
}
