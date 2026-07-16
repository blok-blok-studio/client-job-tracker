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
      text = `:new: *${actor}* added task *${opts.title}*${client}`;
      break;
  }
  await notifySlack(text);
}
