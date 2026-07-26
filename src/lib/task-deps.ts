import prisma from "@/lib/prisma";
import { notifySlack } from "@/lib/slack";

/** Reason text the automation writes — lets us tell auto-blocks from hand-typed ones. */
export function waitingReason(titles: string[]): string {
  return `Waiting on: ${titles.join(", ")}`.slice(0, 500);
}

function isAutoReason(reason: string | null): boolean {
  return !reason || reason.startsWith("Waiting on:");
}

/**
 * Would linking `candidateIds` as blockers of `taskId` create a cycle?
 * A cycle exists when a candidate (transitively) depends on taskId itself —
 * both tasks would wait on each other forever. Walks the candidates' blocker
 * chains breadth-first in batched queries; returns the title of the candidate
 * that closes the loop, or null when the link is safe.
 */
export async function wouldCycle(taskId: string, candidateIds: string[]): Promise<string | null> {
  if (candidateIds.length === 0) return null;
  if (candidateIds.includes(taskId)) return "itself";

  const candidates = await prisma.task.findMany({
    where: { id: { in: candidateIds } },
    select: { id: true, title: true },
  });

  // BFS from all candidates at once; origin maps each reached node back to
  // the candidate whose chain introduced it, so the error can name the culprit
  const origin = new Map<string, string>(candidates.map((c) => [c.id, c.title]));
  let frontier = candidates.map((c) => c.id);

  while (frontier.length > 0) {
    const rows = await prisma.task.findMany({
      where: { id: { in: frontier } },
      select: { id: true, blockedBy: { select: { id: true } } },
    });
    const next: string[] = [];
    for (const row of rows) {
      const via = origin.get(row.id)!;
      for (const b of row.blockedBy) {
        if (b.id === taskId) return via;
        if (!origin.has(b.id)) {
          origin.set(b.id, via);
          next.push(b.id);
        }
      }
    }
    frontier = next;
  }
  return null;
}

/**
 * A task just reached DONE — release anything it was holding up.
 * Dependents sitting in BLOCKED whose blockers are now all complete move back
 * to TODO automatically (only if their blocked-reason was set by us or empty,
 * so a hand-typed reason like "waiting on client assets" is never clobbered).
 */
export async function releaseDependents(taskId: string): Promise<void> {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: {
      title: true,
      blocks: {
        select: {
          id: true,
          title: true,
          status: true,
          blockedReason: true,
          clientId: true,
          client: { select: { name: true } },
          blockedBy: { select: { id: true, status: true } },
        },
      },
    },
  });
  if (!task || task.blocks.length === 0) return;

  for (const dep of task.blocks) {
    if (dep.status !== "BLOCKED") continue;
    if (!isAutoReason(dep.blockedReason)) continue;
    const stillBlocked = dep.blockedBy.some((b) => b.id !== taskId && b.status !== "DONE");
    if (stillBlocked) continue;

    await prisma.task.update({
      where: { id: dep.id },
      data: { status: "TODO", blockedReason: null, blockedAt: null, blockedAlertAt: null },
    });
    await prisma.activityLog.create({
      data: {
        taskId: dep.id,
        clientId: dep.clientId,
        actor: "system",
        action: "auto_unblocked",
        details: `"${dep.title}" auto-moved to To Do — its last blocker "${task.title}" is done`,
      },
    }).catch(() => {});
    const clientLabel = dep.client?.name ? ` (*${dep.client.name}*)` : "";
    await notifySlack(
      `:unlock: *${dep.title}*${clientLabel} is unblocked — *${task.title}* just finished. Moved to To Do.`
    ).catch(() => {});
  }
}

/**
 * Blockers were just set on a task — keep its status honest.
 * Not-started tasks with incomplete blockers auto-move to BLOCKED (with a
 * generated reason); if all blockers are already done and the task was
 * auto-blocked, it comes back to TODO.
 */
export async function applyBlockedState(taskId: string): Promise<void> {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: {
      status: true,
      blockedReason: true,
      blockedBy: { select: { title: true, status: true } },
    },
  });
  if (!task) return;

  const openBlockers = task.blockedBy.filter((b) => b.status !== "DONE");

  if (openBlockers.length > 0 && (task.status === "TODO" || task.status === "BACKLOG")) {
    await prisma.task.update({
      where: { id: taskId },
      data: {
        status: "BLOCKED",
        blockedReason: waitingReason(openBlockers.map((b) => b.title)),
        blockedAt: new Date(),
        blockedAlertAt: null,
      },
    });
  } else if (openBlockers.length > 0 && task.status === "BLOCKED" && isAutoReason(task.blockedReason)) {
    // Keep the generated reason in step with the current blocker list
    await prisma.task.update({
      where: { id: taskId },
      data: { blockedReason: waitingReason(openBlockers.map((b) => b.title)) },
    });
  } else if (openBlockers.length === 0 && task.status === "BLOCKED" && isAutoReason(task.blockedReason)) {
    await prisma.task.update({
      where: { id: taskId },
      data: { status: "TODO", blockedReason: null, blockedAt: null, blockedAlertAt: null },
    });
  }
}
