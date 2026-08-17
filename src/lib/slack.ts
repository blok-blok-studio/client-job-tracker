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

/**
 * Lead alerts go to the #leads channel webhook, kept separate from task
 * activity so a busy kanban never buries a fresh lead. Falls back to the
 * main webhook if SLACK_LEADS_WEBHOOK_URL is not set.
 */
export async function notifySlackLead(text: string): Promise<void> {
  const webhookUrl = process.env.SLACK_LEADS_WEBHOOK_URL || process.env.SLACK_WEBHOOK_URL;
  if (!webhookUrl) return;

  try {
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
  } catch (err) {
    console.error("[Slack] Failed to send lead notification:", err);
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

/** Client responded to a deliverable review link — approval or revision request. */
export async function notifySlackDeliverable(opts: {
  kind: "approved" | "revision";
  title: string;
  clientName: string;
  clientId: string;
  respondedBy?: string | null;
  notes?: string | null;
  itemSummary?: string | null; // e.g. "4 approved · 2 need changes"
}): Promise<void> {
  const by = opts.respondedBy ? ` — ${opts.respondedBy}` : "";
  const link = `<${APP_URL}/clients/${opts.clientId}|Open client>`;
  const summary = opts.itemSummary ? ` (${opts.itemSummary})` : "";
  if (opts.kind === "approved") {
    await notifySlack(
      `:tada: *${opts.clientName}* approved deliverable *${opts.title}*${summary}${by}\n${link}`
    );
  } else {
    await notifySlack(
      `:pencil2: *${opts.clientName}* requested a revision on *${opts.title}*${summary}${by}:\n> ${opts.notes || "(no notes)"}\n:clipboard: Revision task added to the board · ${link}`
    );
  }
}

/** A deliverable went out for client review — its card just landed in In Review. */
export async function notifySlackDeliverableSent(opts: {
  title: string;
  clientName: string;
  clientId: string;
  fileCount: number;
  sentBy?: string | null;
  emailed: boolean;
}): Promise<void> {
  const by = opts.sentBy ? ` by ${opts.sentBy}` : "";
  const files = opts.fileCount > 0 ? ` (${opts.fileCount} file${opts.fileCount === 1 ? "" : "s"})` : "";
  const mail = opts.emailed ? "client emailed the link" : "no email on file — send the link manually";
  await notifySlack(
    `:package: *${opts.title}*${files} sent to *${opts.clientName}* for review${by} — card added to In Review, ${mail}\n<${APP_URL}/clients/${opts.clientId}|Open client>`
  );
}

/** A client left a comment/reply on a deliverable review page. */
export async function notifySlackDeliverableComment(opts: {
  title: string;
  clientName: string;
  clientId: string;
  author?: string | null;
  itemLabel?: string | null; // filename/folder the comment is on, null = whole deliverable
  body: string;
}): Promise<void> {
  const by = opts.author ? ` — ${opts.author}` : "";
  const on = opts.itemLabel ? ` on *${opts.itemLabel}*` : "";
  await notifySlack(
    `:speech_balloon: *${opts.clientName}* replied${on} in deliverable *${opts.title}*${by}:\n> ${opts.body}\n<${APP_URL}/clients/${opts.clientId}|Open client>`
  );
}

/** A meeting handoff was posted — tags the assignees so they can pick it up. */
export async function notifySlackMeetingPosted(opts: {
  title: string;
  clientName?: string | null;
  actor?: string | null;
  meetingId: string;
  assignees: Array<{ name: string; slackUserId?: string | null }>;
  hasRecording: boolean;
}): Promise<void> {
  const client = opts.clientName ? ` (*${opts.clientName}*)` : "";
  const who = opts.assignees.length
    ? ` — over to ${opts.assignees.map((a) => slackMention(a.name, a.slackUserId)).join(", ")}`
    : "";
  const rec = opts.hasRecording ? " · recording attached" : "";
  await notifySlack(
    `:memo: *${opts.actor || "Someone"}* posted meeting notes: *${opts.title}*${client}${who}${rec}\n<${APP_URL}/meetings/${opts.meetingId}|Open the handoff>`
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
