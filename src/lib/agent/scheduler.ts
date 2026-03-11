import { runAgentCycle } from "./engine";

let intervalId: NodeJS.Timeout | null = null;

export function startScheduler(intervalMins: number) {
  if (intervalId) {
    clearInterval(intervalId);
  }

  const intervalMs = intervalMins * 60 * 1000;

  intervalId = setInterval(async () => {
    console.log(`[Agent Scheduler] Starting cycle at ${new Date().toISOString()}`);
    try {
      const result = await runAgentCycle();
      console.log(
        `[Agent Scheduler] Cycle complete: ${result.actionsExecuted} actions, ${result.errors.length} errors, ${result.duration}ms`
      );
    } catch (error) {
      console.error("[Agent Scheduler] Cycle failed:", error);
    }
  }, intervalMs);

  console.log(`[Agent Scheduler] Started with ${intervalMins}min interval`);
}

export function stopScheduler() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    console.log("[Agent Scheduler] Stopped");
  }
}

export function isSchedulerRunning() {
  return intervalId !== null;
}
