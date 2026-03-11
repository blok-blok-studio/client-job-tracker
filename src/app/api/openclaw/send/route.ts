import { NextRequest, NextResponse } from "next/server";
import { sendToOpenClaw } from "@/lib/openclaw/client";

export async function POST(request: NextRequest) {
  try {
    const { agentName, message, metadata } = await request.json();

    if (!agentName || !message) {
      return NextResponse.json(
        { success: false, error: "agentName and message are required" },
        { status: 400 }
      );
    }

    const result = await sendToOpenClaw(agentName, message, metadata);
    return NextResponse.json(result);
  } catch {
    return NextResponse.json(
      { success: false, error: "Failed to send to OpenClaw" },
      { status: 500 }
    );
  }
}
