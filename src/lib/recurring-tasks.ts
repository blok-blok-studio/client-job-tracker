/**
 * Recurring task automation.
 * Creates new task instances from recurring task templates.
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
 * Process all recurring tasks and create new instances where due.
 * A recurring task spawns a new task when:
 *   1. It's marked as recurring with a valid pattern
 *   2. Its current status is DONE (the last cycle was completed)
 *   3. OR it has no dueDate yet (first run)
 *
 * Returns the number of new tasks created.
 */
export async function processRecurringTasks(): Promise<number> {
  const recurringTasks = await prisma.task.findMany({
    where: {
      isRecurring: true,
      recurPattern: { not: null },
    },
    include: {
      client: { select: { id: true, name: true } },
    },
  });

  let created = 0;

  for (const task of recurringTasks) {
    const pattern = task.recurPattern?.toLowerCase() || "";
    const days = PATTERN_DAYS[pattern];
    if (!days) continue; // unknown pattern, skip

    // Only create new instance if the current one is DONE
    if (task.status !== "DONE") continue;

    // Calculate the next due date
    const lastDue = task.completedAt || task.dueDate || new Date();
    const nextDue = new Date(lastDue);
    nextDue.setDate(nextDue.getDate() + days);

    // Don't create if next due date is more than 7 days in the future
    const maxFuture = new Date();
    maxFuture.setDate(maxFuture.getDate() + 7);
    if (nextDue > maxFuture) continue;

    // Check if we already created a task for this cycle
    // (look for an active task with the same title and client)
    const existing = await prisma.task.findFirst({
      where: {
        title: task.title,
        clientId: task.clientId,
        status: { notIn: ["DONE"] },
        isRecurring: false, // spawned instances are not recurring themselves
      },
    });
    if (existing) continue;

    // Create the new task instance
    await prisma.task.create({
      data: {
        title: task.title,
        description: task.description,
        clientId: task.clientId,
        status: "TODO",
        priority: task.priority,
        category: task.category,
        dueDate: nextDue,
        assignedTo: task.assignedTo,
        tags: task.tags,
        isRecurring: false, // instance, not template
      },
    });

    // Log the activity
    await prisma.activityLog.create({
      data: {
        clientId: task.clientId,
        actor: "system",
        action: "recurring_task_created",
        details: `Auto-created recurring task: ${task.title} (${pattern})`,
      },
    });

    created++;
  }

  return created;
}
