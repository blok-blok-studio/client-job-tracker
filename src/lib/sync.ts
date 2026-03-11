import prisma from "@/lib/prisma";
import { sendTelegramMessage } from "@/lib/telegram";

/**
 * Central sync hub — fires notifications across all systems when events occur.
 * All notifications are fire-and-forget (non-blocking) to keep the UI fast.
 */

type SyncEvent =
  | { type: "invoice_created"; clientId: string; amount: number; status: string }
  | { type: "invoice_status_changed"; clientId: string; invoiceId: string; amount: number; oldStatus: string; newStatus: string }
  | { type: "task_created"; clientId: string; title: string }
  | { type: "task_status_changed"; clientId: string; taskId: string; title: string; newStatus: string }
  | { type: "ticket_created"; clientId: string; ticketId: string; subject: string }
  | { type: "ticket_resolved"; clientId: string; ticketId: string; subject: string }
  | { type: "client_updated"; clientId: string; field: string }
  | { type: "credential_added"; clientId: string; platform: string }
  | { type: "social_link_added"; clientId: string; platform: string };

export async function syncEvent(event: SyncEvent) {
  // All operations run in parallel, fire-and-forget
  const promises: Promise<void>[] = [];

  // 1. Always log activity
  promises.push(logActivity(event));

  // 2. Notify client via Telegram if they have a chatId and it's relevant
  promises.push(notifyClientTelegram(event));

  // 3. Notify Chase via Cortana/OpenClaw for important events
  promises.push(notifyCortana(event));

  // Execute all in parallel, don't block on failures
  await Promise.allSettled(promises);
}

async function logActivity(event: SyncEvent) {
  try {
    const { action, details } = getActivityDetails(event);
    await prisma.activityLog.create({
      data: {
        clientId: event.clientId,
        actor: "system",
        action,
        details,
      },
    });
  } catch (err) {
    console.error("[Sync] Failed to log activity:", err);
  }
}

function getActivityDetails(event: SyncEvent): { action: string; details: string } {
  switch (event.type) {
    case "invoice_created":
      return { action: "invoice_created", details: `Invoice for $${event.amount} created (${event.status})` };
    case "invoice_status_changed":
      return { action: "invoice_updated", details: `Invoice $${event.amount}: ${event.oldStatus} → ${event.newStatus}` };
    case "task_created":
      return { action: "task_created", details: `Task: ${event.title}` };
    case "task_status_changed":
      return { action: "task_updated", details: `Task "${event.title}" → ${event.newStatus}` };
    case "ticket_created":
      return { action: "ticket_created", details: `Support ticket: ${event.subject}` };
    case "ticket_resolved":
      return { action: "ticket_resolved", details: `Resolved: ${event.subject}` };
    case "client_updated":
      return { action: "client_updated", details: `Updated: ${event.field}` };
    case "credential_added":
      return { action: "credential_added", details: `Added ${event.platform} credential` };
    case "social_link_added":
      return { action: "social_link_added", details: `Added ${event.platform} social link` };
  }
}

async function notifyClientTelegram(event: SyncEvent) {
  try {
    // Only notify clients about relevant events
    const clientEvents = ["invoice_status_changed", "ticket_resolved", "task_status_changed"];
    if (!clientEvents.includes(event.type)) return;

    const client = await prisma.client.findUnique({
      where: { id: event.clientId },
      select: { telegramChatId: true, name: true },
    });
    if (!client?.telegramChatId) return;

    let message = "";
    switch (event.type) {
      case "invoice_status_changed":
        if (event.newStatus === "PAID") {
          message = `\u2705 Payment confirmed! Your invoice for $${event.amount} has been marked as paid. Thank you!`;
        } else if (event.newStatus === "SENT") {
          message = `\ud83d\udce8 You have a new invoice for $${event.amount}. Please review at your earliest convenience.`;
        }
        break;
      case "ticket_resolved":
        message = `\u2705 Your support ticket "${event.subject}" has been resolved. Let us know if you need anything else!`;
        break;
      case "task_status_changed":
        if (event.newStatus === "DONE") {
          message = `\u2705 Task completed: "${event.title}". We'll share the deliverables with you shortly.`;
        }
        break;
    }

    if (message) {
      await sendTelegramMessage(client.telegramChatId, message);
    }
  } catch (err) {
    console.error("[Sync] Failed to notify client via Telegram:", err);
  }
}

async function notifyCortana(event: SyncEvent) {
  try {
    const openclawUrl = process.env.OPENCLAW_API_URL;
    const openclawKey = process.env.OPENCLAW_API_KEY;
    if (!openclawUrl || !openclawKey) return;

    // Only notify Cortana for important events
    const importantEvents = ["invoice_created", "invoice_status_changed", "ticket_created", "task_status_changed"];
    if (!importantEvents.includes(event.type)) return;

    const client = await prisma.client.findUnique({
      where: { id: event.clientId },
      select: { name: true },
    });

    const { details } = getActivityDetails(event);
    const message = `[Command Center] ${client?.name || "Unknown"}: ${details}`;

    await fetch(openclawUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openclawKey}`,
      },
      body: JSON.stringify({ message }),
    }).catch(() => {}); // fire-and-forget
  } catch {
    // Cortana notification is non-critical
  }
}
