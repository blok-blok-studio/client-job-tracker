import Anthropic from "@anthropic-ai/sdk";
import prisma from "@/lib/prisma";
import { dispatchAction } from "./tasks";
import { buildContextPayload } from "./prompts";
import { sendTelegramMessage } from "@/lib/telegram";

const CORTANA_SYSTEM = `You are Cortana, Chase's AI operations assistant for Blok Blok Studio. Chase texts you on Telegram to manage his business.

You can:
1. EXECUTE actions immediately (tasks, reminders, invoices, tickets, checklists, content)
2. ANSWER questions about the business state (clients, tasks, revenue, deadlines)
3. GIVE status updates and summaries on demand

RESPONSE FORMAT:
Return JSON:
{
  "reply": "Your conversational response to Chase (will be sent via Telegram, keep it concise, use HTML formatting)",
  "actions": [
    { "action": "ACTION_TYPE", ...params }
  ]
}

The "reply" is REQUIRED. Actions are optional — only include them when Chase asks you to DO something.

AVAILABLE ACTIONS:
- CREATE_TASK: { action: "CREATE_TASK", clientId?, title, description?, priority: "URGENT"|"HIGH"|"MEDIUM"|"LOW", category, dueDate? }
- MOVE_TASK: { action: "MOVE_TASK", taskId, newStatus: "BACKLOG"|"TODO"|"IN_PROGRESS"|"IN_REVIEW"|"DONE"|"BLOCKED", reason }
- FLAG_OVERDUE: { action: "FLAG_OVERDUE", taskId, escalationNote }
- SEND_REMINDER: { action: "SEND_REMINDER", clientId, subject, body, channel: "email"|"telegram" }
- SEND_CLIENT_REMINDER: { action: "SEND_CLIENT_REMINDER", clientId, subject, body, channel: "email"|"telegram"|"both" }
- UPDATE_CHECKLIST: { action: "UPDATE_CHECKLIST", checklistItemId, checked: true|false }
- CREATE_CHECKLIST_ITEM: { action: "CREATE_CHECKLIST_ITEM", taskId?, clientId?, label }
- LOG_NOTE: { action: "LOG_NOTE", clientId?, taskId?, note }
- REPLY_SUPPORT_TICKET: { action: "REPLY_SUPPORT_TICKET", ticketId, text }
- MARK_INVOICE_OVERDUE: { action: "MARK_INVOICE_OVERDUE", invoiceId, reason }
- SEND_PAYMENT_REMINDER: { action: "SEND_PAYMENT_REMINDER", invoiceId, message }
- CLOSE_STALE_TICKET: { action: "CLOSE_STALE_TICKET", ticketId, reason }
- SCHEDULE_POST: { action: "SCHEDULE_POST", clientId, platform, body, hashtags?, scheduledAt?, mediaUrls? }
- DRAFT_CONTENT: { action: "DRAFT_CONTENT", clientId, platform, topic, tone? }

RULES:
- Be direct and concise. Chase is busy — get to the point.
- When he asks "what's going on" or "status" → give a quick operational summary
- When he says "create a task for X" → create it and confirm
- When he says "remind X about Y" → send the reminder and confirm
- When he asks about a specific client → pull their info from context
- When he says "schedule a post" → create/schedule the content post
- If you need to reference a client but the message is ambiguous, pick the most likely match from context
- Use HTML tags for formatting: <b>bold</b>, <i>italic</i>, <code>code</code>
- Keep replies under 500 chars when possible — this is Telegram, not email
- Use line breaks for readability
- If Chase says something casual ("hey", "yo", "sup"), respond naturally but always include a quick status nugget`;

// New actions that Cortana can do beyond the standard agent actions
async function schedulePost(params: {
  clientId: string;
  platform: string;
  body: string;
  hashtags?: string[];
  scheduledAt?: string;
  mediaUrls?: string[];
}): Promise<{ success: boolean; message: string }> {
  const post = await prisma.contentPost.create({
    data: {
      clientId: params.clientId,
      platform: params.platform.toUpperCase() as "INSTAGRAM",
      status: params.scheduledAt ? "SCHEDULED" : "DRAFT",
      body: params.body,
      hashtags: params.hashtags || [],
      mediaUrls: params.mediaUrls || [],
      scheduledAt: params.scheduledAt ? new Date(params.scheduledAt) : null,
    },
  });

  await prisma.activityLog.create({
    data: {
      clientId: params.clientId,
      actor: "agent",
      action: "content_post_created",
      details: `Cortana created ${params.platform} post: ${params.body.slice(0, 80)}`,
    },
  });

  return { success: true, message: `Post created (${post.status}): ${post.id}` };
}

async function draftContent(params: {
  clientId: string;
  platform: string;
  topic: string;
  tone?: string;
}): Promise<{ success: boolean; message: string; draft?: string }> {
  const client = await prisma.client.findUnique({
    where: { id: params.clientId },
    select: { name: true, company: true, industry: true },
  });

  if (!client) return { success: false, message: "Client not found" };

  const anthropic = new Anthropic();
  const msg = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 500,
    messages: [{
      role: "user",
      content: `Write a ${params.platform} post for ${client.company || client.name} (${client.industry || "creative"} industry).
Topic: ${params.topic}
Tone: ${params.tone || "professional but engaging"}
Include relevant hashtags.
Keep it platform-appropriate length.
Return ONLY the post text with hashtags — no explanation.`,
    }],
  });

  const draft = msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");

  // Save as draft post
  const hashtagMatch = draft.match(/#\w+/g) || [];
  const body = draft.replace(/#\w+/g, "").trim();

  await prisma.contentPost.create({
    data: {
      clientId: params.clientId,
      platform: params.platform.toUpperCase() as "INSTAGRAM",
      status: "DRAFT",
      body,
      hashtags: hashtagMatch.map((h) => h.replace("#", "")),
    },
  });

  return { success: true, message: "Draft created", draft };
}

export async function handleCortanaMessage(
  chatId: string,
  message: string
): Promise<void> {
  try {
    // Build context so Cortana knows the current state
    const context = await buildContextPayload();

    const anthropic = new Anthropic();
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2048,
      system: CORTANA_SYSTEM,
      messages: [{
        role: "user",
        content: `CURRENT OPERATIONS STATE:\n${JSON.stringify(context, null, 2)}\n\n---\n\nChase says: "${message}"`,
      }],
    });

    const responseText = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n");

    // Parse Cortana's response
    let parsed: { reply: string; actions?: Array<Record<string, unknown>> };
    try {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(jsonMatch?.[0] || responseText);
    } catch {
      // If parsing fails, treat the whole response as a reply
      parsed = { reply: responseText.slice(0, 4000) };
    }

    // Execute any actions
    const actionResults: string[] = [];
    const allowedActions = [
      "create_task", "move_task", "flag_overdue", "send_reminder",
      "send_client_reminder", "generate_report", "update_checklist",
      "create_checklist_item", "suggest_action", "log_note",
      "reply_support_ticket", "mark_invoice_overdue", "send_payment_reminder",
      "close_stale_ticket", "schedule_post", "draft_content",
    ];

    if (parsed.actions && Array.isArray(parsed.actions)) {
      for (const action of parsed.actions.slice(0, 10)) {
        const actionType = (action.action as string || "").toUpperCase();

        // Handle Cortana-specific actions
        if (actionType === "SCHEDULE_POST") {
          const result = await schedulePost(action as Parameters<typeof schedulePost>[0]);
          actionResults.push(result.message);
        } else if (actionType === "DRAFT_CONTENT") {
          const result = await draftContent(action as Parameters<typeof draftContent>[0]);
          actionResults.push(result.message);
          if (result.draft) {
            // Send draft preview as a separate message
            await sendTelegramMessage(chatId, `📝 <b>Draft:</b>\n\n${result.draft}`);
          }
        } else {
          // Use standard agent action dispatcher
          const result = await dispatchAction(
            action as { action: string; [key: string]: unknown },
            allowedActions
          );
          actionResults.push(result.message);
        }
      }
    }

    // Build final reply
    let finalReply = parsed.reply || "Done.";

    // Append action results if any
    if (actionResults.length > 0) {
      finalReply += "\n\n" + actionResults.map((r) => `✓ ${r}`).join("\n");
    }

    // Send reply to Chase via Telegram
    await sendTelegramMessage(chatId, finalReply);

    // Log the interaction
    await prisma.activityLog.create({
      data: {
        actor: "agent",
        action: "cortana_command",
        details: JSON.stringify({
          message: message.slice(0, 200),
          actionsExecuted: actionResults.length,
          reply: finalReply.slice(0, 200),
        }),
      },
    });
  } catch (error) {
    console.error("[Cortana] Error:", error);
    const errMsg = error instanceof Error ? error.message : String(error);
    await sendTelegramMessage(
      chatId,
      `⚠️ Something broke: ${errMsg.slice(0, 200)}`
    );
  }
}
