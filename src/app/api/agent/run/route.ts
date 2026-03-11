import { NextRequest, NextResponse } from "next/server";
import { runAgentCycle } from "@/lib/agent/engine";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const dryRun = body.dryRun === true;

  try {
    const result = await runAgentCycle(dryRun);
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Agent cycle failed";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
