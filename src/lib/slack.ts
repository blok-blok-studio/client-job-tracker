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
