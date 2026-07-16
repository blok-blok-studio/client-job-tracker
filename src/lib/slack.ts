/**
 * Slack notifications via incoming webhook.
 * Fire-and-forget: no-ops silently when SLACK_WEBHOOK_URL is not set,
 * and never throws so it can't break the calling request.
 */

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://blokblokstudio-clients.vercel.app";

export async function notifySlack(text: string): Promise<void> {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  if (!webhookUrl) return;

  try {
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
  } catch (err) {
    console.error("[Slack] Failed to send notification:", err);
  }
}

export async function notifySlackTaskDone(opts: {
  title: string;
  clientName?: string | null;
  actor?: string | null;
}): Promise<void> {
  const client = opts.clientName ? ` for *${opts.clientName}*` : "";
  const by = opts.actor ? ` — completed by ${opts.actor}` : "";
  await notifySlack(
    `:white_check_mark: *${opts.title}*${client} is done${by}\n<${APP_URL}/kanban|Open the board>`
  );
}

function humanStatus(status: string): string {
  return status
    .toLowerCase()
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** Render an assignee as a real @-mention when we know their Slack ID. */
export function slackMention(name: string | null | undefined, slackUserId: string | null | undefined): string {
  if (slackUserId) return `<@${slackUserId}>`;
  return name ? `*${name}*` : "someone";
}

/** Task assigned to a team member — tags them so they get pinged. */
export async function notifySlackTaskAssigned(opts: {
  title: string;
  clientName?: string | null;
  actor?: string | null;
  assigneeName: string;
  assigneeSlackId?: string | null;
}): Promise<void> {
  const client = opts.clientName ? ` (*${opts.clientName}*)` : "";
  const actor = opts.actor || "Someone";
  await notifySlack(
    `:bust_in_silhouette: ${actor} assigned *${opts.title}*${client} to ${slackMention(opts.assigneeName, opts.assigneeSlackId)}\n<${APP_URL}/kanban|Open the board>`
  );
}

/** Checklist item ticked off — includes running subtask progress. */
export async function notifySlackChecklist(opts: {
  taskTitle: string;
  clientName?: string | null;
  actor?: string | null;
  itemLabel: string;
  done: number;
  total: number;
}): Promise<void> {
  const client = opts.clientName ? ` (*${opts.clientName}*)` : "";
  const pct = opts.total > 0 ? Math.round((opts.done / opts.total) * 100) : 0;
  const progress = opts.done === opts.total
    ? `*${opts.done}/${opts.total}* — all subtasks complete :tada:`
    : `${opts.done}/${opts.total} (${pct}%)`;
  await notifySlack(
    `:ballot_box_with_check: *${opts.actor || "Someone"}* checked off "${opts.itemLabel}" on *${opts.taskTitle}*${client} — ${progress}`
  );
}

/** Board activity that isn't a completion: updates posted, moves, new tasks. */
export async function notifySlackTaskEvent(opts: {
  kind: "update" | "moved" | "created";
  title: string;
  clientName?: string | null;
  actor?: string | null;
  detail?: string | null; // update text, or new status for "moved"
}): Promise<void> {
  const client = opts.clientName ? ` (*${opts.clientName}*)` : "";
  const actor = opts.actor || "Someone";
  let text: string;
  switch (opts.kind) {
    case "update":
      text = `:speech_balloon: *${actor}* logged an update on *${opts.title}*${client}:\n> ${opts.detail || ""}`;
      break;
    case "moved":
      text = `:arrows_counterclockwise: *${actor}* moved *${opts.title}*${client} to *${humanStatus(opts.detail || "")}*`;
      break;
    case "created":
      text = `:new: *${actor}* added task *${opts.title}*${client}${opts.detail || ""}`;
      break;
  }
  await notifySlack(text);
}
