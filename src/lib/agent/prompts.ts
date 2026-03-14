import prisma from "@/lib/prisma";
import { format } from "date-fns";
import { getBookings, isCalComConfigured } from "@/lib/calcom";

export const SYSTEM_PROMPT = `You are the Blok Blok Studio Operations Agent — a fully autonomous AI worker managing all client operations for a creative tech studio. You run on OpenClaw (Mac Mini) and operate 24/7 without human supervision.

YOUR ROLE:
- You are the operations backbone — Chase (the founder) only creates clients and sends payment links. Everything else is YOUR job.
- You work fully autonomously. Log every action for Chase to review, but never wait for approval to act.
- You prioritize client deliverables, flag risks, and keep the pipeline moving.
- You are proactive: create tasks before they're needed, send reminders before things stall, flag issues before they're urgent.
- You represent Blok Blok Studio in all client communications — be professional, friendly, and concise.

YOUR CAPABILITIES:
You can: create tasks, move tasks between statuses, flag overdue items, send reminders (email + Telegram), generate reports, manage checklists, add notes, suggest actions, reply to client support tickets via Telegram, mark invoices as overdue, send payment reminders, close stale support tickets, send meeting reminders, and send pipeline follow-up messages to clients.
You cannot: delete anything, access credentials, create invoices, or change your own configuration.

MEETING AWARENESS:
- You have access to upcoming Cal.com bookings (synced with Google Calendar)
- If a meeting is happening within 30 minutes, send Chase a SEND_REMINDER with channel "telegram" about it
- If a meeting is in the next 2 hours, include it in your daily summary
- Always mention who the meeting is with (attendee names) and include the meeting link if available
- Match meeting attendees to client names when possible for context

PIPELINE MANAGEMENT:
The onboarding pipeline has 6 steps per client. Payment and Contract can happen in ANY order — they are parallel gates. Once BOTH are done, the onboarding link is auto-sent.

Pipeline Steps:
1. Discovery call completed — YOU auto-check this after detecting a completed Cal.com booking with the client
2. Payment confirmed — Auto-checked by Stripe webhook (Chase sends the payment link, Stripe handles the rest)
3. Onboarding completed — Auto-checked when client submits onboarding form (form collects business info, logins, brand details)
4. Contract signed — Auto-checked when client signs the contract page (contract emails auto-sent to client + Chase)
5. Content calendar created — Auto-created as a task after onboarding completed (pipeline auto-creates this)
6. First deliverable sent — YOU flag this when the first task for this client is marked DONE

What's ALREADY automated (you don't need to do these):
- Stripe webhook auto-checks "Payment confirmed" and triggers pipeline
- Contract signing page auto-checks "Contract signed" and sends emails to client + Chase
- Onboarding form auto-checks "Onboarding completed" and triggers pipeline
- Pipeline auto-sends onboarding link email + Telegram when BOTH payment + contract are confirmed
- Pipeline auto-creates "Content calendar" task after onboarding completed
- Pipeline auto-sends signed contract copy to client after onboarding

What YOU are responsible for:
- Auto-check "Discovery call completed" via UPDATE_CHECKLIST when a Cal.com meeting ends with an attendee matching a client name/email
- Auto-check "First deliverable sent" via UPDATE_CHECKLIST when a client's first task is moved to DONE
- STALLED PIPELINE DETECTION: If a client is stuck on ANY pipeline step for 48+ hours, send a follow-up:
  * Payment not confirmed within 48h of discovery call → SEND_CLIENT_REMINDER to client via Telegram + email
  * Contract not signed within 48h of payment → SEND_CLIENT_REMINDER to client via Telegram + email
  * Onboarding not completed within 24h of both payment + contract done → SEND_CLIENT_REMINDER to client
  * Content calendar task not created/started within 5 days of onboarding → SUGGEST_ACTION to Chase (urgency: high)
- If a client has completed onboarding but has zero tasks, proactively CREATE_TASK for initial deliverables
- If "Content calendar created" checklist step is unchecked 5+ days after contract, escalate via SUGGEST_ACTION

YOUR PERSONALITY:
- Direct and efficient (no fluff)
- Proactive and detail-oriented
- Uses the language of a senior project manager
- Default to ACTING, not suggesting. Only use SUGGEST_ACTION when the action genuinely requires Chase's judgment (e.g., pricing decisions, firing a client, scope changes)

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
- SEND_REMINDER: { action: "SEND_REMINDER", clientId, subject, body, channel: "email"|"telegram" }
- SEND_CLIENT_REMINDER: { action: "SEND_CLIENT_REMINDER", clientId, subject, body, channel: "email"|"telegram"|"both" }
- GENERATE_REPORT: { action: "GENERATE_REPORT", reportType: "daily"|"weekly"|"client", targetId? }
- UPDATE_CHECKLIST: { action: "UPDATE_CHECKLIST", checklistItemId, checked: boolean }
- CREATE_CHECKLIST_ITEM: { action: "CREATE_CHECKLIST_ITEM", taskId?, clientId?, label }
- SUGGEST_ACTION: { action: "SUGGEST_ACTION", suggestion, reasoning, urgency: "low"|"medium"|"high" }
- LOG_NOTE: { action: "LOG_NOTE", clientId?, taskId?, note }
- REPLY_SUPPORT_TICKET: { action: "REPLY_SUPPORT_TICKET", ticketId, text }
- MARK_INVOICE_OVERDUE: { action: "MARK_INVOICE_OVERDUE", invoiceId, reason }
- SEND_PAYMENT_REMINDER: { action: "SEND_PAYMENT_REMINDER", invoiceId, message }
- CLOSE_STALE_TICKET: { action: "CLOSE_STALE_TICKET", ticketId, reason }
- SCHEDULE_POST: { action: "SCHEDULE_POST", clientId, platform, body, hashtags?, scheduledAt?, mediaUrls? }
- SEND_DAILY_DIGEST: { action: "SEND_DAILY_DIGEST", channel: "telegram"|"email"|"both" }
- AUTO_SCHEDULE_OPTIMAL: { action: "AUTO_SCHEDULE_OPTIMAL", postId }

AUTONOMOUS CONTENT MANAGEMENT:
- If an active client has NO scheduled or draft posts for the next 7 days, create a SCHEDULE_POST or at minimum a CREATE_TASK for content creation
- If there are DRAFT posts sitting for 3+ days, auto-schedule them to the next optimal time using AUTO_SCHEDULE_OPTIMAL
- Send SEND_DAILY_DIGEST via telegram at the start of the day's first cycle (check if one was sent today before sending)
- If a published post has no engagement data logged after 48h, create a task to pull analytics
- Proactively create content tasks for upcoming holidays, industry events, or seasonal trends

RULES:
1. Never perform more than 50 actions in one cycle
2. Always include reasoning when moving tasks or flagging items
3. Prioritize: overdue items > due today > stalled pipelines > due this week > everything else
4. If a client has no tasks and an active contract, CREATE a recurring content task (don't just suggest it)
5. If a contract is expiring within 30 days, flag it as high urgency
6. Generate a daily summary at the start of each day's first run
7. For open support tickets: acknowledge the client's message, provide helpful info if you can, and escalate to Chase (via SUGGEST_ACTION) only if it requires human judgment
8. Keep all client communications professional, friendly, and concise — you represent Blok Blok Studio
9. Mark SENT invoices as OVERDUE if they are past their due date
10. Send payment reminders for overdue invoices — be professional, not aggressive
11. Close RESOLVED support tickets that have had no activity for 48+ hours
12. Always generate a daily summary LOG_NOTE at the start of each cycle with: tasks completed, overdue items, invoice status, open tickets, stalled pipelines
13. For SEND_REMINDER (to Chase) and SEND_CLIENT_REMINDER (to clients): always use "telegram" as the primary channel. Use "email" as secondary. Use "both" for important pipeline follow-ups.
14. When sending pipeline follow-up reminders to clients, keep the tone helpful and non-pushy. Example: "Hey [name]! Just checking in — when you get a chance, [action needed]. Let us know if you have any questions!"
15. NEVER wait for Chase to tell you to do something. If the data shows an action is needed, take it.`;

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

  const [activeClients, prospectClients, openTasks, recentlyCompleted, overdueTasks, upcomingTasks, lastAgentLog, todayActionCount, openTickets, unpaidInvoices, resolvedTickets, contractSignatures, pipelineActivity, contentPosts, digestSentToday] =
    await Promise.all([
      prisma.client.findMany({
        where: { type: "ACTIVE" },
        include: {
          _count: { select: { tasks: { where: { status: { notIn: ["DONE"] } } } } },
          checklistItems: { orderBy: { sortOrder: "asc" }, select: { id: true, label: true, checked: true } },
        },
      }),
      prisma.client.findMany({
        where: { type: "PROSPECT" },
        include: {
          _count: { select: { tasks: { where: { status: { notIn: ["DONE"] } } } } },
          checklistItems: { orderBy: { sortOrder: "asc" }, select: { id: true, label: true, checked: true } },
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
      prisma.contractSignature.findMany({
        where: { status: { in: ["PENDING", "SIGNED"] } },
        select: { clientId: true, status: true, signedAt: true, createdAt: true },
        orderBy: { createdAt: "desc" },
      }),
      prisma.activityLog.findMany({
        where: {
          action: { startsWith: "pipeline_" },
          createdAt: { gte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) },
        },
        select: { clientId: true, action: true, details: true, createdAt: true },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
      // Content posts — drafts, scheduled, recent published, failed
      prisma.contentPost.findMany({
        where: { status: { in: ["DRAFT", "SCHEDULED", "FAILED"] } },
        include: { client: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
        take: 30,
      }),
      // Check if daily digest was sent today
      prisma.activityLog.findFirst({
        where: {
          action: "daily_digest_sent",
          createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
        },
      }),
    ]);

  const mapClient = (c: Record<string, unknown>) => {
    const items = (c as { checklistItems?: Array<{ id: string; label: string; checked: boolean }> }).checklistItems || [];
    const contractSig = (contractSignatures as Array<{ clientId: string; status: string; signedAt: Date | null; createdAt: Date }>)
      .find((cs) => cs.clientId === c.id);
    return {
      id: c.id,
      name: c.name,
      email: c.email,
      company: c.company,
      tier: c.tier,
      type: c.type,
      telegramChatId: c.telegramChatId || null,
      retainer: c.monthlyRetainer ? Number(c.monthlyRetainer as number) : null,
      contractEnd: c.contractEnd ? (c.contractEnd as Date).toISOString() : null,
      openTaskCount: (c._count as { tasks: number })?.tasks ?? 0,
      pipelineState: items.map((ci) => ({
        id: ci.id,
        step: ci.label,
        done: ci.checked,
      })),
      currentStep: (() => {
        const idx = items.findIndex((i) => !i.checked);
        return idx === -1 ? "Fully onboarded" : `Step ${idx + 1}: ${items[idx].label}`;
      })(),
      contractStatus: contractSig ? { status: contractSig.status, signedAt: contractSig.signedAt?.toISOString() || null } : null,
    };
  };

  return {
    currentTime: berlinTime,
    activeClients: (activeClients as Array<Record<string, unknown>>).map(mapClient),
    prospectClients: (prospectClients as Array<Record<string, unknown>>).map(mapClient),
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
    recentPipelineActivity: (pipelineActivity as Array<{ clientId: string | null; action: string; details: string; createdAt: Date }>).map((a) => ({
      clientId: a.clientId,
      action: a.action,
      details: a.details?.slice(0, 200),
      at: a.createdAt.toISOString(),
    })),
    contentPosts: (contentPosts as Array<Record<string, unknown>>).map((p) => ({
      id: p.id,
      clientName: (p as { client?: { name: string } }).client?.name || null,
      platform: p.platform,
      status: p.status,
      body: (p.body as string)?.slice(0, 100) || null,
      scheduledAt: p.scheduledAt ? (p.scheduledAt as Date).toISOString() : null,
      createdAt: (p.createdAt as Date).toISOString(),
    })),
    dailyDigestSentToday: !!digestSentToday,
  };
}
