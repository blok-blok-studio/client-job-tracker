import prisma from "@/lib/prisma";
import { z } from "zod";
import { sendTelegramMessage } from "@/lib/telegram";
import { sendReminderEmail } from "@/lib/email";
import type { ActionResult, AgentAction } from "@/types";

// --- Action Functions ---

export async function createTask(params: {
  clientId?: string;
  title: string;
  description?: string;
  priority?: string;
  category?: string;
  dueDate?: string;
  assignedTo?: string;
  tags?: string[];
}): Promise<ActionResult> {
  const schema = z.object({
    clientId: z.string().optional(),
    title: z.string().min(1),
    description: z.string().optional(),
    priority: z.enum(["URGENT", "HIGH", "MEDIUM", "LOW"]).default("MEDIUM"),
    category: z.string().default("GENERAL"),
    dueDate: z.string().optional(),
    assignedTo: z.string().default("agent"),
    tags: z.array(z.string()).optional(),
  });

  const parsed = schema.parse(params);

  const task = await prisma.task.create({
    data: {
      ...parsed,
      dueDate: parsed.dueDate ? new Date(parsed.dueDate) : null,
      description: parsed.description || null,
      tags: parsed.tags || [],
      priority: parsed.priority as "URGENT" | "HIGH" | "MEDIUM" | "LOW",
      category: parsed.category as "GENERAL",
    },
  });

  await prisma.activityLog.create({
    data: {
      taskId: task.id,
      clientId: task.clientId,
      actor: "agent",
      action: "created_task",
      details: `Created task: ${task.title}`,
    },
  });

  return { success: true, message: `Created task: ${task.title}`, data: task };
}

export async function moveTask(params: {
  taskId: string;
  newStatus: string;
  reason: string;
}): Promise<ActionResult> {
  const schema = z.object({
    taskId: z.string(),
    newStatus: z.enum(["BACKLOG", "TODO", "IN_PROGRESS", "IN_REVIEW", "DONE", "BLOCKED"]),
    reason: z.string(),
  });

  const parsed = schema.parse(params);
  const old = await prisma.task.findUnique({ where: { id: parsed.taskId } });
  if (!old) return { success: false, message: "Task not found" };

  const task = await prisma.task.update({
    where: { id: parsed.taskId },
    data: {
      status: parsed.newStatus as "BACKLOG",
      completedAt: parsed.newStatus === "DONE" ? new Date() : undefined,
    },
  });

  await prisma.activityLog.create({
    data: {
      taskId: task.id,
      clientId: task.clientId,
      actor: "agent",
      action: "moved_task",
      details: `Moved "${task.title}" from ${old.status} to ${parsed.newStatus}. Reason: ${parsed.reason}`,
    },
  });

  return { success: true, message: `Moved task to ${parsed.newStatus}` };
}

export async function flagOverdue(params: {
  taskId: string;
  escalationNote: string;
}): Promise<ActionResult> {
  const schema = z.object({
    taskId: z.string(),
    escalationNote: z.string(),
  });

  const parsed = schema.parse(params);
  const task = await prisma.task.update({
    where: { id: parsed.taskId },
    data: { priority: "URGENT" },
  });

  // Create follow-up task
  await prisma.task.create({
    data: {
      clientId: task.clientId,
      title: `Follow up: ${task.title} (overdue)`,
      description: parsed.escalationNote,
      priority: "URGENT",
      category: task.category,
      assignedTo: "chase",
      tags: ["overdue-followup"],
    },
  });

  await prisma.activityLog.create({
    data: {
      taskId: task.id,
      clientId: task.clientId,
      actor: "agent",
      action: "flagged_overdue",
      details: parsed.escalationNote,
    },
  });

  return { success: true, message: `Flagged task as overdue: ${task.title}` };
}

export async function sendReminder(params: {
  clientId: string;
  subject: string;
  body: string;
  channel: string;
}): Promise<ActionResult> {
  const schema = z.object({
    clientId: z.string(),
    subject: z.string(),
    body: z.string(),
    channel: z.enum(["email", "telegram"]),
  });

  const parsed = schema.parse(params);

  // This sends reminders to Chase (the admin), not to clients
  // For client-facing reminders, use SEND_CLIENT_REMINDER
  let sent = false;

  if (parsed.channel === "telegram") {
    // Send to Chase's Telegram — use ADMIN_TELEGRAM_CHAT_ID env var
    const adminChatId = process.env.ADMIN_TELEGRAM_CHAT_ID;
    if (adminChatId) {
      const result = await sendTelegramMessage(adminChatId, `📋 <b>${parsed.subject}</b>\n\n${parsed.body}`);
      sent = result.success;
    }
  } else if (parsed.channel === "email") {
    const result = await sendReminderEmail({
      to: "chase@blokblokstudio.com",
      subject: parsed.subject,
      body: parsed.body,
    });
    sent = !!result;
  }

  await prisma.activityLog.create({
    data: {
      clientId: parsed.clientId,
      actor: "agent",
      action: "sent_reminder",
      details: JSON.stringify({
        subject: parsed.subject,
        body: parsed.body,
        channel: parsed.channel,
        status: sent ? "sent" : "failed",
      }),
    },
  });

  return { success: true, message: `Reminder ${sent ? "sent" : "queued"} (${parsed.channel}): ${parsed.subject}` };
}

export async function sendClientReminder(params: {
  clientId: string;
  subject: string;
  body: string;
  channel: string;
}): Promise<ActionResult> {
  const schema = z.object({
    clientId: z.string(),
    subject: z.string(),
    body: z.string(),
    channel: z.enum(["email", "telegram", "both"]),
  });

  const parsed = schema.parse(params);

  const client = await prisma.client.findUnique({
    where: { id: parsed.clientId },
    select: { name: true, email: true, telegramChatId: true },
  });

  if (!client) return { success: false, message: "Client not found" };

  const results: string[] = [];

  // Send via Telegram if channel is telegram or both
  if ((parsed.channel === "telegram" || parsed.channel === "both") && client.telegramChatId) {
    const tgResult = await sendTelegramMessage(client.telegramChatId, parsed.body);
    results.push(tgResult.success ? "telegram:sent" : "telegram:failed");
  }

  // Send via email if channel is email or both
  if ((parsed.channel === "email" || parsed.channel === "both") && client.email) {
    const emailResult = await sendReminderEmail({
      to: client.email,
      subject: parsed.subject,
      body: parsed.body,
    });
    results.push(emailResult ? "email:sent" : "email:failed");
  }

  await prisma.activityLog.create({
    data: {
      clientId: parsed.clientId,
      actor: "agent",
      action: "sent_client_reminder",
      details: JSON.stringify({
        clientName: client.name,
        subject: parsed.subject,
        body: parsed.body,
        channel: parsed.channel,
        results,
      }),
    },
  });

  return { success: true, message: `Client reminder sent to ${client.name}: ${results.join(", ")}` };
}

export async function generateReport(params: {
  reportType: string;
  targetId?: string;
}): Promise<ActionResult> {
  const schema = z.object({
    reportType: z.enum(["daily", "weekly", "client"]),
    targetId: z.string().optional(),
  });

  const parsed = schema.parse(params);

  await prisma.activityLog.create({
    data: {
      clientId: parsed.targetId || null,
      actor: "agent",
      action: "generated_report",
      details: JSON.stringify({
        type: parsed.reportType,
        generatedAt: new Date().toISOString(),
      }),
    },
  });

  return { success: true, message: `Generated ${parsed.reportType} report` };
}

export async function updateChecklist(params: {
  checklistItemId: string;
  checked: boolean;
}): Promise<ActionResult> {
  const schema = z.object({ checklistItemId: z.string(), checked: z.boolean() });
  const parsed = schema.parse(params);

  await prisma.checklistItem.update({
    where: { id: parsed.checklistItemId },
    data: { checked: parsed.checked },
  });

  return { success: true, message: `Checklist item ${parsed.checked ? "checked" : "unchecked"}` };
}

export async function createChecklistItem(params: {
  taskId?: string;
  clientId?: string;
  label: string;
}): Promise<ActionResult> {
  const schema = z.object({
    taskId: z.string().optional(),
    clientId: z.string().optional(),
    label: z.string().min(1),
  });

  const parsed = schema.parse(params);

  await prisma.checklistItem.create({
    data: {
      taskId: parsed.taskId || null,
      clientId: parsed.clientId || null,
      label: parsed.label,
    },
  });

  return { success: true, message: `Created checklist item: ${parsed.label}` };
}

export async function suggestAction(params: {
  suggestion: string;
  reasoning: string;
  urgency: string;
}): Promise<ActionResult> {
  const schema = z.object({
    suggestion: z.string(),
    reasoning: z.string(),
    urgency: z.enum(["low", "medium", "high"]),
  });

  const parsed = schema.parse(params);

  await prisma.activityLog.create({
    data: {
      actor: "agent",
      action: "suggested_action",
      details: JSON.stringify(parsed),
    },
  });

  return { success: true, message: `Suggestion created: ${parsed.suggestion}` };
}

export async function logNote(params: {
  clientId?: string;
  taskId?: string;
  note: string;
}): Promise<ActionResult> {
  const schema = z.object({
    clientId: z.string().optional(),
    taskId: z.string().optional(),
    note: z.string().min(1),
  });

  const parsed = schema.parse(params);

  await prisma.activityLog.create({
    data: {
      clientId: parsed.clientId || null,
      taskId: parsed.taskId || null,
      actor: "agent",
      action: "logged_note",
      details: parsed.note,
    },
  });

  return { success: true, message: `Note logged` };
}

export async function replySupportTicket(params: {
  ticketId: string;
  text: string;
}): Promise<ActionResult> {
  const schema = z.object({
    ticketId: z.string(),
    text: z.string().min(1),
  });

  const parsed = schema.parse(params);

  const ticket = await prisma.supportTicket.findUnique({
    where: { id: parsed.ticketId },
    select: { id: true, telegramChatId: true, clientId: true, status: true },
  });

  if (!ticket) {
    return { success: false, message: "Ticket not found" };
  }

  // Save the message
  await prisma.supportMessage.create({
    data: {
      ticketId: ticket.id,
      sender: "bot",
      text: parsed.text,
    },
  });

  // Update ticket to IN_PROGRESS if OPEN
  if (ticket.status === "OPEN") {
    await prisma.supportTicket.update({
      where: { id: ticket.id },
      data: { status: "IN_PROGRESS" },
    });
  }

  // Send via Telegram
  await sendTelegramMessage(ticket.telegramChatId, parsed.text);

  await prisma.activityLog.create({
    data: {
      clientId: ticket.clientId,
      actor: "agent",
      action: "replied_support_ticket",
      details: `Auto-replied to support ticket: ${parsed.text.slice(0, 100)}`,
    },
  });

  return { success: true, message: `Replied to support ticket` };
}

export async function markInvoiceOverdue(params: {
  invoiceId: string;
  reason: string;
}): Promise<ActionResult> {
  const schema = z.object({ invoiceId: z.string(), reason: z.string() });
  const parsed = schema.parse(params);

  const invoice = await prisma.invoice.findUnique({
    where: { id: parsed.invoiceId },
    include: { client: { select: { id: true, name: true, telegramChatId: true } } },
  });
  if (!invoice) return { success: false, message: "Invoice not found" };
  if (invoice.status !== "SENT") return { success: false, message: "Only SENT invoices can be marked overdue" };

  await prisma.invoice.update({ where: { id: parsed.invoiceId }, data: { status: "OVERDUE" } });

  if (invoice.client.telegramChatId) {
    await sendTelegramMessage(
      invoice.client.telegramChatId,
      `Reminder: Your invoice for $${Number(invoice.amount).toFixed(2)} is now past due. Please reach out if you need to discuss payment.`
    );
  }

  await prisma.activityLog.create({
    data: {
      clientId: invoice.clientId,
      actor: "agent",
      action: "marked_invoice_overdue",
      details: `Invoice $${Number(invoice.amount).toFixed(2)} for ${invoice.client.name}: ${parsed.reason}`,
    },
  });

  return { success: true, message: `Marked invoice as overdue for ${invoice.client.name}` };
}

export async function sendPaymentReminder(params: {
  invoiceId: string;
  message: string;
}): Promise<ActionResult> {
  const schema = z.object({ invoiceId: z.string(), message: z.string() });
  const parsed = schema.parse(params);

  const invoice = await prisma.invoice.findUnique({
    where: { id: parsed.invoiceId },
    include: { client: { select: { id: true, name: true, telegramChatId: true } } },
  });
  if (!invoice) return { success: false, message: "Invoice not found" };

  if (invoice.client.telegramChatId) {
    await sendTelegramMessage(invoice.client.telegramChatId, parsed.message);
  }

  await prisma.activityLog.create({
    data: {
      clientId: invoice.clientId,
      actor: "agent",
      action: "sent_payment_reminder",
      details: `Payment reminder for $${Number(invoice.amount).toFixed(2)}: ${parsed.message.slice(0, 200)}`,
    },
  });

  return { success: true, message: `Sent payment reminder to ${invoice.client.name}` };
}

export async function closeStaleTicket(params: {
  ticketId: string;
  reason: string;
}): Promise<ActionResult> {
  const schema = z.object({ ticketId: z.string(), reason: z.string() });
  const parsed = schema.parse(params);

  const ticket = await prisma.supportTicket.findUnique({
    where: { id: parsed.ticketId },
    include: { client: { select: { name: true, telegramChatId: true } } },
  });
  if (!ticket) return { success: false, message: "Ticket not found" };

  await prisma.supportTicket.update({ where: { id: parsed.ticketId }, data: { status: "CLOSED" } });

  if (ticket.client.telegramChatId) {
    await sendTelegramMessage(
      ticket.client.telegramChatId,
      `Your support ticket "${ticket.subject}" has been closed. Feel free to message us again if you need further help!`
    );
  }

  await prisma.activityLog.create({
    data: {
      clientId: ticket.clientId,
      actor: "agent",
      action: "closed_stale_ticket",
      details: `Closed ticket "${ticket.subject}": ${parsed.reason}`,
    },
  });

  return { success: true, message: `Closed stale ticket: ${ticket.subject}` };
}

// --- Content Actions (Autonomous) ---

export async function schedulePost(params: {
  clientId: string;
  platform: string;
  body: string;
  hashtags?: string[];
  scheduledAt?: string;
  mediaUrls?: string[];
}): Promise<ActionResult> {
  const schema = z.object({
    clientId: z.string(),
    platform: z.string(),
    body: z.string().min(1),
    hashtags: z.array(z.string()).optional(),
    scheduledAt: z.string().optional(),
    mediaUrls: z.array(z.string()).optional(),
  });

  const parsed = schema.parse(params);

  const post = await prisma.contentPost.create({
    data: {
      clientId: parsed.clientId,
      platform: parsed.platform.toUpperCase() as "INSTAGRAM",
      status: parsed.scheduledAt ? "SCHEDULED" : "DRAFT",
      body: parsed.body,
      hashtags: parsed.hashtags || [],
      mediaUrls: parsed.mediaUrls || [],
      scheduledAt: parsed.scheduledAt ? new Date(parsed.scheduledAt) : null,
    },
  });

  await prisma.activityLog.create({
    data: {
      clientId: parsed.clientId,
      actor: "agent",
      action: "content_post_created",
      details: `Auto-created ${parsed.platform} post (${post.status}): ${parsed.body.slice(0, 80)}`,
    },
  });

  return { success: true, message: `Created ${parsed.platform} post: ${post.id}` };
}

export async function sendDailyDigest(params: {
  channel: string;
}): Promise<ActionResult> {
  const now = new Date();
  const [openTasks, overdue, openTickets, unpaid, scheduled, completedToday] = await Promise.all([
    prisma.task.count({ where: { status: { notIn: ["DONE"] } } }),
    prisma.task.count({ where: { dueDate: { lt: now }, status: { notIn: ["DONE"] } } }),
    prisma.supportTicket.count({ where: { status: { in: ["OPEN", "IN_PROGRESS"] } } }),
    prisma.invoice.findMany({ where: { status: { in: ["SENT", "OVERDUE"] } }, include: { client: { select: { name: true } } } }),
    prisma.contentPost.count({ where: { status: "SCHEDULED" } }),
    prisma.task.count({ where: { completedAt: { gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) } } }),
  ]);

  const totalOwed = unpaid.reduce((sum, inv) => sum + Number(inv.amount), 0);

  const digest = [
    `<b>📊 Daily Digest — ${now.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}</b>`,
    "",
    `✅ Completed today: <b>${completedToday}</b>`,
    `📋 Open tasks: <b>${openTasks}</b>${overdue > 0 ? ` (⚠️ <b>${overdue} overdue</b>)` : ""}`,
    `💬 Open tickets: <b>${openTickets}</b>`,
    `💰 Outstanding: <b>$${totalOwed.toFixed(2)}</b> across ${unpaid.length} invoices`,
    `📅 Scheduled posts: <b>${scheduled}</b>`,
  ];

  if (unpaid.filter((i) => i.status === "OVERDUE").length > 0) {
    digest.push("");
    digest.push("<b>⚠️ Overdue invoices:</b>");
    unpaid.filter((i) => i.status === "OVERDUE").forEach((i) => {
      const clientName = (i as unknown as { client: { name: string } }).client?.name || "Unknown";
      digest.push(`  • ${clientName}: $${Number(i.amount).toFixed(2)}`);
    });
  }

  const adminChatId = process.env.ADMIN_TELEGRAM_CHAT_ID;
  if (adminChatId && (params.channel === "telegram" || params.channel === "both")) {
    await sendTelegramMessage(adminChatId, digest.join("\n"));
  }

  if (params.channel === "email" || params.channel === "both") {
    await sendReminderEmail({
      to: "chase@blokblokstudio.com",
      subject: `Daily Digest — ${now.toLocaleDateString()}`,
      body: digest.join("\n").replace(/<[^>]+>/g, ""),
    });
  }

  await prisma.activityLog.create({
    data: {
      actor: "agent",
      action: "daily_digest_sent",
      details: `Daily digest sent via ${params.channel}`,
    },
  });

  return { success: true, message: "Daily digest sent" };
}

export async function autoScheduleOptimalTime(params: {
  postId: string;
}): Promise<ActionResult> {
  const post = await prisma.contentPost.findUnique({
    where: { id: params.postId },
    select: { id: true, platform: true, clientId: true, status: true },
  });

  if (!post || post.status !== "DRAFT") {
    return { success: false, message: "Post not found or not a draft" };
  }

  // Find best time based on historical published posts for this platform
  const recentPosts = await prisma.contentPost.findMany({
    where: { platform: post.platform, status: "PUBLISHED", publishedAt: { not: null } },
    select: { publishedAt: true },
    orderBy: { publishedAt: "desc" },
    take: 20,
  });

  let scheduledHour = 10; // Default 10 AM
  if (recentPosts.length >= 5) {
    // Use most common hour from successful posts
    const hours = recentPosts.map((p) => p.publishedAt!.getHours());
    const freq = hours.reduce((acc, h) => { acc[h] = (acc[h] || 0) + 1; return acc; }, {} as Record<number, number>);
    scheduledHour = Number(Object.entries(freq).sort((a, b) => b[1] - a[1])[0][0]);
  }

  // Schedule for next day at optimal time
  const scheduled = new Date();
  scheduled.setDate(scheduled.getDate() + 1);
  scheduled.setHours(scheduledHour, 0, 0, 0);

  await prisma.contentPost.update({
    where: { id: post.id },
    data: { scheduledAt: scheduled, status: "SCHEDULED" },
  });

  return { success: true, message: `Scheduled for ${scheduled.toLocaleString()} (optimal time: ${scheduledHour}:00)` };
}

// --- Action Dispatcher ---

const actionMap: Record<string, (params: Record<string, unknown>) => Promise<ActionResult>> = {
  CREATE_TASK: (p) => createTask(p as Parameters<typeof createTask>[0]),
  MOVE_TASK: (p) => moveTask(p as Parameters<typeof moveTask>[0]),
  FLAG_OVERDUE: (p) => flagOverdue(p as Parameters<typeof flagOverdue>[0]),
  SEND_REMINDER: (p) => sendReminder(p as Parameters<typeof sendReminder>[0]),
  SEND_CLIENT_REMINDER: (p) => sendClientReminder(p as Parameters<typeof sendClientReminder>[0]),
  GENERATE_REPORT: (p) => generateReport(p as Parameters<typeof generateReport>[0]),
  UPDATE_CHECKLIST: (p) => updateChecklist(p as Parameters<typeof updateChecklist>[0]),
  CREATE_CHECKLIST_ITEM: (p) => createChecklistItem(p as Parameters<typeof createChecklistItem>[0]),
  SUGGEST_ACTION: (p) => suggestAction(p as Parameters<typeof suggestAction>[0]),
  LOG_NOTE: (p) => logNote(p as Parameters<typeof logNote>[0]),
  REPLY_SUPPORT_TICKET: (p) => replySupportTicket(p as Parameters<typeof replySupportTicket>[0]),
  MARK_INVOICE_OVERDUE: (p) => markInvoiceOverdue(p as Parameters<typeof markInvoiceOverdue>[0]),
  SEND_PAYMENT_REMINDER: (p) => sendPaymentReminder(p as Parameters<typeof sendPaymentReminder>[0]),
  CLOSE_STALE_TICKET: (p) => closeStaleTicket(p as Parameters<typeof closeStaleTicket>[0]),
  SCHEDULE_POST: (p) => schedulePost(p as Parameters<typeof schedulePost>[0]),
  SEND_DAILY_DIGEST: (p) => sendDailyDigest(p as Parameters<typeof sendDailyDigest>[0]),
  AUTO_SCHEDULE_OPTIMAL: (p) => autoScheduleOptimalTime(p as Parameters<typeof autoScheduleOptimalTime>[0]),
};

export async function dispatchAction(
  action: AgentAction,
  allowedActions: string[]
): Promise<ActionResult> {
  const actionType = action.action;

  // SUGGEST_ACTION is always allowed
  if (actionType !== "SUGGEST_ACTION" && !allowedActions.includes(actionType.toLowerCase())) {
    return { success: false, message: `Action ${actionType} is not allowed` };
  }

  const handler = actionMap[actionType];
  if (!handler) {
    return { success: false, message: `Unknown action: ${actionType}` };
  }

  try {
    const params = Object.fromEntries(
      Object.entries(action).filter(([key]) => key !== "action")
    );
    return await handler(params as Record<string, unknown>);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    await prisma.activityLog.create({
      data: {
        actor: "agent",
        action: "action_error",
        details: JSON.stringify({ actionType, error: message }),
      },
    });
    return { success: false, message: `Action failed: ${message}` };
  }
}
