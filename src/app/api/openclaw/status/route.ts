import { NextResponse } from "next/server";
import { pingOpenClaw } from "@/lib/openclaw/client";

export async function GET() {
  const connected = await pingOpenClaw();
  return NextResponse.json({
    success: true,
    data: { connected },
  });
}
