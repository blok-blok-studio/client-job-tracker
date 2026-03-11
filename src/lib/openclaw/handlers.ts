import prisma from "@/lib/prisma";
import { z } from "zod";

const baseEventSchema = z.object({
  event_type: z.string(),
  timestamp: z.string().optional(),
});

const prospectQualifiedSchema = baseEventSchema.extend({
  event_type: z.literal("prospect_qualified"),
  client_id: z.string(),
  qualification_score: z.number().optional(),
  notes: z.string().optional(),
});

const taskCompletedSchema = baseEventSchema.extend({
  event_type: z.literal("task_completed"),
  task_id: z.string(),
  notes: z.string().optional(),
});

const noteAddedSchema = baseEventSchema.extend({
  event_type: z.literal("note_added"),
  client_id: z.string().optional(),
  task_id: z.string().optional(),
  note: z.string(),
});

const reminderSentSchema = baseEventSchema.extend({
  event_type: z.literal("reminder_sent"),
  client_id: z.string(),
  channel: z.string(),
  subject: z.string().optional(),
});

const escalationSchema = baseEventSchema.extend({
  event_type: z.literal("escalation"),
  message: z.string(),
  urgency: z.enum(["low", "medium", "high"]).default("high"),
  client_id: z.string().optional(),
});

export async function handleProspectQualified(payload: unknown) {
  const parsed = prospectQualifiedSchema.parse(payload);

  await prisma.client.update({
    where: { id: parsed.client_id },
    data: { type: "ACTIVE" },
  });

  await prisma.activityLog.create({
    data: {
      clientId: parsed.client_id,
      actor: "openclaw",
      action: "prospect_qualified",
      details: JSON.stringify({ score: parsed.qualification_score, notes: parsed.notes }),
    },
  });

  return { success: true, message: "Prospect qualified and activated" };
}

export async function handleTaskCompleted(payload: unknown) {
  const parsed = taskCompletedSchema.parse(payload);

  await prisma.task.update({
    where: { id: parsed.task_id },
    data: { status: "DONE", completedAt: new Date() },
  });

  await prisma.activityLog.create({
    data: {
      taskId: parsed.task_id,
      actor: "openclaw",
      action: "task_completed",
      details: parsed.notes || "Task completed via OpenClaw",
    },
  });

  return { success: true, message: "Task marked as done" };
}

export async function handleNoteAdded(payload: unknown) {
  const parsed = noteAddedSchema.parse(payload);

  await prisma.activityLog.create({
    data: {
      clientId: parsed.client_id || null,
      taskId: parsed.task_id || null,
      actor: "openclaw",
      action: "note_added",
      details: parsed.note,
    },
  });

  return { success: true, message: "Note added" };
}

export async function handleReminderSent(payload: unknown) {
  const parsed = reminderSentSchema.parse(payload);

  await prisma.activityLog.create({
    data: {
      clientId: parsed.client_id,
      actor: "openclaw",
      action: "reminder_sent",
      details: JSON.stringify({ channel: parsed.channel, subject: parsed.subject }),
    },
  });

  return { success: true, message: "Reminder delivery logged" };
}

export async function handleEscalation(payload: unknown) {
  const parsed = escalationSchema.parse(payload);

  await prisma.activityLog.create({
    data: {
      clientId: parsed.client_id || null,
      actor: "openclaw",
      action: "suggested_action",
      details: JSON.stringify({
        suggestion: parsed.message,
        reasoning: "Escalated via OpenClaw",
        urgency: parsed.urgency,
      }),
    },
  });

  return { success: true, message: "Escalation created" };
}

const eventHandlers: Record<string, (payload: unknown) => Promise<{ success: boolean; message: string }>> = {
  prospect_qualified: handleProspectQualified,
  task_completed: handleTaskCompleted,
  note_added: handleNoteAdded,
  reminder_sent: handleReminderSent,
  escalation: handleEscalation,
};

export async function processWebhookEvent(payload: unknown) {
  const base = baseEventSchema.parse(payload);
  const handler = eventHandlers[base.event_type];

  if (!handler) {
    return { success: false, message: `Unknown event type: ${base.event_type}` };
  }

  return handler(payload);
}
