import prisma from "@/lib/prisma";
import { format } from "date-fns";
import { getBookings, isCalComConfigured } from "@/lib/calcom";

export const SYSTEM_PROMPT = `You are the Blok Blok Studio Operations Agent — an autonomous AI worker managing client operations for a creative tech studio.

YOUR ROLE:
- You manage tasks, deadlines, and client operations for Blok Blok Studio
- You work autonomously but always log your actions for Chase (the founder) to review
- You prioritize client deliverables, flag risks, and keep everything on track
- You are proactive: create tasks before they're needed, flag issues before they're urgent

YOUR CAPABILITIES:
You can: create tasks, move tasks between statuses, flag overdue items, draft reminders, generate reports, manage checklists, add notes, suggest actions, reply to client support tickets via Telegram, mark invoices as overdue, send payment reminders, close stale support tickets, and send meeting reminders.
You cannot: delete anything, access credentials, create invoices, or change your own configuration.

MEETING AWARENESS:
- You have access to upcoming Cal.com bookings (synced with Google Calendar)
- If a meeting is happening within 30 minutes, send Chase a SEND_REMINDER with channel "telegram" about it
- If a meeting is in the next 2 hours, include it in your daily summary
- Always mention who the meeting is with (attendee names) and include the meeting link if available
- Match meeting attendees to client names when possible for context

PIPELINE MANAGEMENT:
The onboarding pipeline has 6 steps per client:
1. Discovery call completed — Auto-check after detecting a completed Cal.com booking with the client
2. Payment confirmed — Auto-checked by Stripe webhook
3. Onboarding completed — Auto-checked when client submits onboarding form
4. Contract signed — Auto-checked when client signs contract
5. Content calendar created — Auto-created as a task after contract is signed
6. First deliverable sent — Flag when the first task for this client is marked DONE

Your pipeline duties:
- If a Cal.com meeting has ended with an attendee matching a client name/email, auto-check "Discovery call completed" via UPDATE_CHECKLIST
- If a client is stuck on a pipeline step for 48+ hours, flag it with SUGGEST_ACTION (urgency: high)
- If onboarding form hasn't been completed within 24h of payment, send a follow-up reminder via SEND_REMINDER
- If contract hasn't been signed within 48h of onboarding, send a follow-up reminder
- If "Content calendar created" is still unchecked 5+ days after contract signing, escalate via SUGGEST_ACTION
- When a client's first task is moved to DONE, auto-check "First deliverable sent" via UPDATE_CHECKLIST
- Proactively create tasks for new clients who have completed onboarding but have no tasks yet

YOUR PERSONALITY:
- Direct and efficient (no fluff)
- Proactive and detail-oriented
- Uses the language of a senior project manager
- When uncertain, use SUGGEST_ACTION instead of acting

RESPONSE FORMAT:
Respond with a JSON object:
{
  "analysis": "Brief assessment of current state",
  "actions": [
    { "action": "ACTION_TYPE", ...params }
  ],
  "suggestions": [
    { "action": "SUGGEST_ACTION", "suggestion": "...", "reasoning": "...", "urgency": "..." }
  ]
}

VALID ACTIONS:
- CREATE_TASK: { action: "CREATE_TASK", clientId?, title, description?, priority: "URGENT"|"HIGH"|"MEDIUM"|"LOW", category, dueDate? }
- MOVE_TASK: { action: "MOVE_TASK", taskId, newStatus, reason }
- FLAG_OVERDUE: { action: "FLAG_OVERDUE", taskId, escalationNote }
- SEND_REMINDER: { action: "SEND_REMINDER", clientId, subject, body, channel: "email"|"slack"|"telegram" }
- GENERATE_REPORT: { action: "GENERATE_REPORT", reportType: "daily"|"weekly"|"client", targetId? }
- UPDATE_CHECKLIST: { action: "UPDATE_CHECKLIST", checklistItemId, checked: boolean }
- CREATE_CHECKLIST_ITEM: { action: "CREATE_CHECKLIST_ITEM", taskId?, clientId?, label }
- SUGGEST_ACTION: { action: "SUGGEST_ACTION", suggestion, reasoning, urgency: "low"|"medium"|"high" }
- LOG_NOTE: { action: "LOG_NOTE", clientId?, taskId?, note }
- REPLY_SUPPORT_TICKET: { action: "REPLY_SUPPORT_TICKET", ticketId, text }
- MARK_INVOICE_OVERDUE: { action: "MARK_INVOICE_OVERDUE", invoiceId, reason }
- SEND_PAYMENT_REMINDER: { action: "SEND_PAYMENT_REMINDER", invoiceId, message }
- CLOSE_STALE_TICKET: { action: "CLOSE_STALE_TICKET", ticketId, reason }

RULES:
1. Never perform more than 50 actions in one cycle
2. Always include reasoning when moving tasks or flagging items
3. Prioritize: overdue items > due today > due this week > everything else
4. If a client has no tasks and an active contract, suggest creating a recurring content task
5. If a contract is expiring within 30 days, flag it as high urgency
6. Generate a daily summary at the start of each day's first run
7. For open support tickets: acknowledge the client's message, provide helpful info if you can, and escalate to Chase (via SUGGEST_ACTION) if the request requires human judgment
8. Keep support replies professional, friendly, and concise — you represent Blok Blok Studio
9. Mark SENT invoices as OVERDUE if they are past their due date
10. Send payment reminders for overdue invoices — be professional, not aggressive
11. Close RESOLVED support tickets that have had no activity for 48+ hours
12. Always generate a daily summary LOG_NOTE at the start of each cycle with: tasks completed, overdue items, invoice status, open tickets`;

export async function buildContextPayload() {
  const now = new Date();
  const berlinTime = format(now, "yyyy-MM-dd HH:mm:ss 'Berlin'");

  // Fetch Cal.com meetings: upcoming (next 24h) and recent (past 24h)
  const [calBookings, recentMeetings] = isCalComConfigured()
    ? await Promise.all([
        getBookings({
          afterStart: now.toISOString(),
          beforeEnd: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
          status: "upcoming",
        }).catch(() => []),
        getBookings({
          afterStart: new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString(),
          beforeEnd: now.toISOString(),
          status: "past",
        }).catch(() => []),
      ])
    : [[], []];

  const [activeClients, openTasks, recentlyCompleted, overdueTasks, upcomingTasks, lastAgentLog, todayActionCount, openTickets, unpaidInvoices, resolvedTickets] =
    await Promise.all([
      prisma.client.findMany({
        where: { type: "ACTIVE" },
        include: {
          _count: { select: { tasks: { where: { status: { notIn: ["DONE"] } } } } },
          checklistItems: { orderBy: { sortOrder: "asc" }, select: { label: true, checked: true } },
        },
      }),
      prisma.task.findMany({
        where: { status: { notIn: ["DONE"] } },
        include: { client: { select: { name: true } } },
        orderBy: [{ priority: "asc" }, { dueDate: "asc" }],
      }),
      prisma.task.findMany({
        where: {
          completedAt: { gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) },
        },
        include: { client: { select: { name: true } } },
      }),
      prisma.task.findMany({
        where: {
          dueDate: { lt: now },
          status: { notIn: ["DONE"] },
        },
        include: { client: { select: { name: true } } },
      }),
      prisma.task.findMany({
        where: {
          dueDate: {
            gte: now,
            lte: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
          },
          status: { notIn: ["DONE"] },
        },
        include: { client: { select: { name: true } } },
      }),
      prisma.activityLog.findFirst({
        where: { actor: "agent" },
        orderBy: { createdAt: "desc" },
      }),
      prisma.activityLog.count({
        where: {
          actor: "agent",
          createdAt: { gte: new Date(now.setHours(0, 0, 0, 0)) },
        },
      }),
      prisma.supportTicket.findMany({
        where: { status: { in: ["OPEN", "IN_PROGRESS"] } },
        include: {
          client: { select: { name: true } },
          messages: { orderBy: { createdAt: "desc" }, take: 3 },
        },
        orderBy: { updatedAt: "desc" },
        take: 10,
      }),
      prisma.invoice.findMany({
        where: { status: { in: ["SENT", "OVERDUE"] } },
        include: { client: { select: { name: true } } },
        orderBy: { dueDate: "asc" },
      }),
      prisma.supportTicket.findMany({
        where: { status: "RESOLVED" },
        include: { client: { select: { name: true } } },
        orderBy: { updatedAt: "desc" },
        take: 10,
      }),
    ]);

  return {
    currentTime: berlinTime,
    activeClients: (activeClients as Array<Record<string, unknown>>).map((c) => ({
      id: c.id,
      name: c.name,
      company: c.company,
      tier: c.tier,
      retainer: c.monthlyRetainer ? Number(c.monthlyRetainer as number) : null,
      contractEnd: c.contractEnd ? (c.contractEnd as Date).toISOString() : null,
      openTaskCount: (c._count as { tasks: number })?.tasks ?? 0,
      pipelineState: (c as { checklistItems?: Array<{ label: string; checked: boolean }> }).checklistItems?.map((ci) => ({
        step: ci.label,
        done: ci.checked,
      })) || [],
      currentStep: ((items: Array<{ label: string; checked: boolean }>) => {
        const idx = items.findIndex((i) => !i.checked);
        return idx === -1 ? "Fully onboarded" : `Step ${idx + 1}: ${items[idx].label}`;
      })((c as { checklistItems?: Array<{ label: string; checked: boolean }> }).checklistItems || []),
    })),
    openTasks: (openTasks as Array<Record<string, unknown>>).map((t) => ({
      id: t.id,
      title: t.title,
      status: t.status,
      priority: t.priority,
      category: t.category,
      dueDate: t.dueDate ? (t.dueDate as Date).toISOString() : null,
      assignedTo: t.assignedTo,
      clientName: (t as { client?: { name: string } }).client?.name || null,
    })),
    completedLast24h: recentlyCompleted.length,
    overdueTasks: (overdueTasks as Array<Record<string, unknown>>).map((t) => ({
      id: t.id,
      title: t.title,
      dueDate: t.dueDate ? (t.dueDate as Date).toISOString() : null,
      priority: t.priority,
      clientName: (t as { client?: { name: string } }).client?.name || null,
    })),
    upcomingDeadlines: (upcomingTasks as Array<Record<string, unknown>>).map((t) => ({
      id: t.id,
      title: t.title,
      dueDate: t.dueDate ? (t.dueDate as Date).toISOString() : null,
      clientName: (t as { client?: { name: string } }).client?.name || null,
    })),
    lastAgentRun: lastAgentLog?.createdAt.toISOString() || "never",
    actionsToday: todayActionCount,
    openSupportTickets: (openTickets as Array<Record<string, unknown>>).map((t) => ({
      id: t.id,
      subject: t.subject,
      status: t.status,
      priority: t.priority,
      clientName: (t as { client?: { name: string } }).client?.name || null,
      recentMessages: ((t as { messages?: Array<Record<string, unknown>> }).messages || []).map((m) => ({
        sender: m.sender,
        text: (m.text as string)?.slice(0, 200),
        createdAt: (m.createdAt as Date).toISOString(),
      })),
    })),
    unpaidInvoices: (unpaidInvoices as Array<Record<string, unknown>>).map((i) => ({
      id: i.id,
      amount: Number(i.amount),
      status: i.status,
      dueDate: i.dueDate ? (i.dueDate as Date).toISOString() : null,
      clientName: (i as { client?: { name: string } }).client?.name || null,
    })),
    resolvedTickets: (resolvedTickets as Array<Record<string, unknown>>).map((t) => ({
      id: t.id,
      subject: t.subject,
      updatedAt: (t.updatedAt as Date).toISOString(),
      clientName: (t as { client?: { name: string } }).client?.name || null,
    })),
    upcomingMeetings: calBookings.map((b) => ({
      title: b.title,
      start: b.start,
      end: b.end,
      duration: b.duration,
      attendees: b.attendees?.map((a) => a.name).join(", ") || "Unknown",
      meetingUrl: b.meetingUrl || b.location || null,
      minutesUntilStart: Math.round((new Date(b.start).getTime() - Date.now()) / 60000),
    })),
    recentlyCompletedMeetings: recentMeetings.map((b) => ({
      title: b.title,
      start: b.start,
      end: b.end,
      attendees: b.attendees?.map((a) => ({ name: a.name, email: a.email })) || [],
    })),
  };
}
