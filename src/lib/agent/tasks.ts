import prisma from "@/lib/prisma";
import { z } from "zod";
import { sendTelegramMessage } from "@/lib/telegram";
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
    channel: z.enum(["email", "slack", "telegram"]),
  });

  const parsed = schema.parse(params);

  await prisma.activityLog.create({
    data: {
      clientId: parsed.clientId,
      actor: "agent",
      action: "sent_reminder",
      details: JSON.stringify({
        subject: parsed.subject,
        body: parsed.body,
        channel: parsed.channel,
        status: "pending_review",
      }),
    },
  });

  return { success: true, message: `Reminder drafted (${parsed.channel}): ${parsed.subject}` };
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

// --- Action Dispatcher ---

const actionMap: Record<string, (params: Record<string, unknown>) => Promise<ActionResult>> = {
  CREATE_TASK: (p) => createTask(p as Parameters<typeof createTask>[0]),
  MOVE_TASK: (p) => moveTask(p as Parameters<typeof moveTask>[0]),
  FLAG_OVERDUE: (p) => flagOverdue(p as Parameters<typeof flagOverdue>[0]),
  SEND_REMINDER: (p) => sendReminder(p as Parameters<typeof sendReminder>[0]),
  GENERATE_REPORT: (p) => generateReport(p as Parameters<typeof generateReport>[0]),
  UPDATE_CHECKLIST: (p) => updateChecklist(p as Parameters<typeof updateChecklist>[0]),
  CREATE_CHECKLIST_ITEM: (p) => createChecklistItem(p as Parameters<typeof createChecklistItem>[0]),
  SUGGEST_ACTION: (p) => suggestAction(p as Parameters<typeof suggestAction>[0]),
  LOG_NOTE: (p) => logNote(p as Parameters<typeof logNote>[0]),
  REPLY_SUPPORT_TICKET: (p) => replySupportTicket(p as Parameters<typeof replySupportTicket>[0]),
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
