import { NextRequest, NextResponse } from "next/server";
import { runAgentCycle } from "@/lib/agent/engine";

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runAgentCycle();
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Cron job failed";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
