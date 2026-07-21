/**
 * Recurring task automation.
 *
 * A recurring task is a single card that cycles: drag it to Done and the cron
 * later resets that SAME card back to To Do with the next due date and a
 * fresh (unchecked) checklist. Nothing is duplicated and the recurrence never
 * needs to be recreated — the 🔁 card just keeps coming back.
 *
 * Supported recurPattern formats:
 *   "daily"     — every day
 *   "weekly"    — every 7 days
 *   "biweekly"  — every 14 days
 *   "monthly"   — every 30 days
 *   "quarterly" — every 90 days
 */

import prisma from "@/lib/prisma";

const PATTERN_DAYS: Record<string, number> = {
  daily: 1,
  weekly: 7,
  biweekly: 14,
  monthly: 30,
  quarterly: 90,
};

/**
 * Reset completed recurring tasks for their next cycle.
 * A recurring task comes back when:
 *   1. It's marked recurring with a valid pattern
 *   2. It sits in DONE (the last cycle was completed)
 *   3. Its next due date is within the next 7 days (keeps the board clean —
 *      a monthly task doesn't reappear the moment you finish it)
 *
 * Returns the number of tasks reset.
 */
export async function processRecurringTasks(): Promise<number> {
  const recurringTasks = await prisma.task.findMany({
    where: {
      isRecurring: true,
      recurPattern: { not: null },
      status: "DONE",
    },
  });

  let reset = 0;
  const maxFuture = new Date();
  maxFuture.setDate(maxFuture.getDate() + 7);

  for (const task of recurringTasks) {
    const pattern = task.recurPattern?.toLowerCase() || "";
    const days = PATTERN_DAYS[pattern];
    if (!days) continue; // unknown pattern, skip

    // Next cycle is due `days` after the last completion (or last due date)
    const lastDue = task.completedAt || task.dueDate || new Date();
    const nextDue = new Date(lastDue);
    nextDue.setDate(nextDue.getDate() + days);

    // Not yet time to resurface it
    if (nextDue > maxFuture) continue;

    // Put the card at the end of the To Do column
    const maxSort = await prisma.task.aggregate({
      where: { status: "TODO" },
      _max: { sortOrder: true },
    });

    await prisma.task.update({
      where: { id: task.id },
      data: {
        status: "TODO",
        dueDate: nextDue,
        completedAt: null,
        sortOrder: (maxSort._max.sortOrder ?? -1) + 1,
      },
    });

    // Fresh checklist for the new cycle
    await prisma.checklistItem.updateMany({
      where: { taskId: task.id },
      data: { checked: false },
    });

    await prisma.activityLog.create({
      data: {
        clientId: task.clientId,
        taskId: task.id,
        actor: "system",
        action: "recurring_task_reset",
        details: `Recurring task back on the board: ${task.title} (${pattern}, due ${nextDue.toISOString().slice(0, 10)})`,
      },
    });

    reset++;
  }

  return reset;
}
