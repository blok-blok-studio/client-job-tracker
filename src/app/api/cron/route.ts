import { NextRequest, NextResponse } from "next/server";
import { runAgentCycle } from "@/lib/agent/engine";
import { processRecurringTasks } from "@/lib/recurring-tasks";

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Process recurring tasks first
    const recurringCreated = await processRecurringTasks().catch((err) => {
      console.error("[Cron] Recurring tasks error:", err);
      return 0;
    });

    // Then run agent cycle
    const result = await runAgentCycle();
    return NextResponse.json({
      success: true,
      data: { ...result, recurringTasksCreated: recurringCreated },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Cron job failed";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
