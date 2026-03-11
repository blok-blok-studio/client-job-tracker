import Anthropic from "@anthropic-ai/sdk";
import prisma from "@/lib/prisma";
import { sendTelegramMessage } from "@/lib/telegram";
import { sendToOpenClaw } from "@/lib/openclaw/client";

const TICKET_SYSTEM_PROMPT = `You are the Blok Blok Studio Support Agent — an AI that handles client support via Telegram on behalf of Blok Blok Studio, a creative tech agency.

YOUR ROLE:
- Respond to client messages instantly and professionally
- You represent Blok Blok Studio — be helpful, friendly, and efficient
- Handle common requests directly (status updates, timeline questions, general info)
- Escalate complex requests to Chase (the founder) via a note, but still reply to the client

TONE:
- Professional but warm — like a senior account manager
- Concise — keep replies under 3-4 sentences unless detail is needed
- Confident — don't say "I think" or "maybe", state things clearly
- Use the client's name naturally

WHAT YOU CAN DO:
- Answer questions about project status, timelines, and deliverables
- Acknowledge requests and confirm they're being handled
- Provide general info about Blok Blok Studio services
- Let clients know when Chase will follow up personally

WHAT YOU SHOULD ESCALATE (but still reply to the client):
- Billing/payment questions
- Scope changes or new project requests
- Technical issues you don't have context for
- Complaints or dissatisfaction

RESPONSE FORMAT:
Return a JSON object:
{
  "reply": "Your message to the client via Telegram",
  "escalate": true/false,
  "escalateNote": "Note for Chase about why this needs attention (only if escalate=true)",
  "priority": "LOW|MEDIUM|HIGH|URGENT"
}

RULES:
1. ALWAYS reply — never leave a client hanging
2. If you don't know the answer, say you'll have Chase follow up shortly
3. Keep Telegram messages clean — no markdown, just plain text with line breaks
4. Sign off naturally, don't use "Best regards" or formal closings`;

interface TicketContext {
  ticketId: string;
  clientName: string;
  clientCompany: string | null;
  clientTier: string;
  subject: string;
  messages: { sender: string; text: string; createdAt: string }[];
}

export async function respondToTicket(ticketId: string): Promise<{
  success: boolean;
  reply?: string;
  escalated?: boolean;
}> {
  try {
    const ticketRaw = await prisma.supportTicket.findUnique({
      where: { id: ticketId },
      include: {
        client: { select: { id: true, name: true, company: true, tier: true } },
        messages: { orderBy: { createdAt: "asc" }, take: 20 },
      },
    });

    if (!ticketRaw) return { success: false };

    const ticket = ticketRaw as typeof ticketRaw & {
      client: { id: string; name: string; company: string | null; tier: string };
      messages: { sender: string; text: string; createdAt: Date }[];
    };

    // Get client's active tasks for context
    const activeTasks = await prisma.task.findMany({
      where: { clientId: ticket.clientId, status: { notIn: ["DONE"] } },
      select: { title: true, status: true, priority: true, dueDate: true },
      take: 10,
    });

    const context: TicketContext = {
      ticketId: ticket.id,
      clientName: ticket.client.name,
      clientCompany: ticket.client.company,
      clientTier: ticket.client.tier,
      subject: ticket.subject,
      messages: ticket.messages.map((m) => ({
        sender: m.sender,
        text: m.text,
        createdAt: m.createdAt.toISOString(),
      })),
    };

    const config = await prisma.agentConfig.findUnique({ where: { id: "default" } });
    const model = config?.claudeModel || "claude-sonnet-4-20250514";

    const anthropic = new Anthropic();
    const message = await anthropic.messages.create({
      model,
      max_tokens: 1024,
      system: TICKET_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Client support ticket. Respond appropriately.\n\nClient: ${context.clientName}${context.clientCompany ? ` (${context.clientCompany})` : ""}\nTier: ${context.clientTier}\nSubject: ${context.subject}\n\nConversation:\n${context.messages.map((m) => `[${m.sender}]: ${m.text}`).join("\n")}\n\nActive projects for this client:\n${activeTasks.length > 0 ? activeTasks.map((t) => `- ${t.title} (${t.status}, ${t.priority}${t.dueDate ? `, due ${t.dueDate.toISOString().split("T")[0]}` : ""})`).join("\n") : "No active tasks"}`,
        },
      ],
    });

    const responseText = message.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("\n");

    let parsed: { reply: string; escalate?: boolean; escalateNote?: string; priority?: string };
    try {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(jsonMatch?.[0] || responseText);
    } catch {
      // If parsing fails, use the raw text as the reply
      parsed = { reply: responseText.slice(0, 500) };
    }

    // Save the bot reply as a message
    await prisma.supportMessage.create({
      data: {
        ticketId: ticket.id,
        sender: "bot",
        text: parsed.reply,
      },
    });

    // Update ticket status to IN_PROGRESS
    await prisma.supportTicket.update({
      where: { id: ticket.id },
      data: {
        status: "IN_PROGRESS",
        priority: (parsed.priority as "URGENT" | "HIGH" | "MEDIUM" | "LOW") || undefined,
      },
    });

    // Send the reply via Telegram
    if (ticket.telegramChatId) {
      await sendTelegramMessage(ticket.telegramChatId, parsed.reply);
    }

    // Log it
    await prisma.activityLog.create({
      data: {
        clientId: ticket.clientId,
        actor: "agent",
        action: "replied_support_ticket",
        details: `Auto-replied to ${ticket.client.name}: ${parsed.reply.slice(0, 100)}`,
      },
    });

    // Escalate to Cortana if needed
    if (parsed.escalate) {
      await sendToOpenClaw(
        "cortana",
        `Support escalation from ${ticket.client.name}: ${parsed.escalateNote || ticket.subject}. Ticket needs Chase's attention.`,
        { clientId: ticket.clientId, ticketId: ticket.id, priority: parsed.priority }
      );

      await prisma.activityLog.create({
        data: {
          clientId: ticket.clientId,
          actor: "agent",
          action: "escalated_ticket",
          details: `Escalated to Chase: ${parsed.escalateNote || ticket.subject}`,
        },
      });
    }

    // Always notify Cortana about new activity (non-blocking)
    sendToOpenClaw(
      "cortana",
      `Handled support message from ${ticket.client.name}. Topic: "${ticket.subject}". ${parsed.escalate ? "ESCALATED — needs your review." : "Resolved autonomously."}`,
      { clientId: ticket.clientId, ticketId: ticket.id }
    ).catch(() => {}); // fire and forget

    return {
      success: true,
      reply: parsed.reply,
      escalated: parsed.escalate || false,
    };
  } catch (error) {
    console.error("[Ticket Responder]", error);
    return { success: false };
  }
}
