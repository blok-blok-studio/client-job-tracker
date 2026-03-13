import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import prisma from "@/lib/prisma";
import { sendTelegramMessage, getWebhookSecret } from "@/lib/telegram";
import { sendToOpenClaw } from "@/lib/openclaw/client";
import { respondToTicket } from "@/lib/agent/ticket-responder";
import { handleCortanaMessage } from "@/lib/agent/cortana";

interface TelegramUpdate {
  message?: {
    chat: { id: number };
    from?: { first_name?: string; last_name?: string; username?: string };
    text?: string;
  };
}

// Chase's admin chat ID — messages from this chat go to Cortana, not support tickets
function isAdminChat(chatId: string): boolean {
  const adminId = process.env.ADMIN_TELEGRAM_CHAT_ID;
  return !!adminId && chatId === adminId;
}

export async function POST(request: NextRequest) {
  try {
    // Verify Telegram secret token header
    const secret = getWebhookSecret();
    if (secret) {
      const headerSecret = request.headers.get("x-telegram-bot-api-secret-token");
      if (!headerSecret || !crypto.timingSafeEqual(
        Buffer.from(headerSecret),
        Buffer.from(secret)
      )) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    const update: TelegramUpdate = await request.json();

    if (!update.message?.text) {
      return NextResponse.json({ ok: true });
    }

    const chatId = String(update.message.chat.id);
    const text = update.message.text;
    const senderName = [
      update.message.from?.first_name,
      update.message.from?.last_name,
    ]
      .filter(Boolean)
      .join(" ") || "Unknown";

    // ─── ADMIN COMMANDS (Chase texting Cortana) ────────────────────────
    if (isAdminChat(chatId)) {
      // Handle /start for admin — just acknowledge
      if (text === "/start") {
        await sendTelegramMessage(chatId, "Hey Chase. I'm online and ready. What do you need?");
        return NextResponse.json({ ok: true });
      }

      // Handle /status — quick operational snapshot
      if (text === "/status" || text.toLowerCase() === "status") {
        const [openTasks, overdueCount, openTickets, unpaidInvoices, scheduledPosts] = await Promise.all([
          prisma.task.count({ where: { status: { notIn: ["DONE"] } } }),
          prisma.task.count({ where: { dueDate: { lt: new Date() }, status: { notIn: ["DONE"] } } }),
          prisma.supportTicket.count({ where: { status: { in: ["OPEN", "IN_PROGRESS"] } } }),
          prisma.invoice.count({ where: { status: { in: ["SENT", "OVERDUE"] } } }),
          prisma.contentPost.count({ where: { status: "SCHEDULED" } }),
        ]);

        await sendTelegramMessage(chatId, [
          "<b>📊 Quick Status</b>",
          "",
          `📋 Open tasks: <b>${openTasks}</b>${overdueCount > 0 ? ` (⚠️ ${overdueCount} overdue)` : ""}`,
          `💬 Open tickets: <b>${openTickets}</b>`,
          `💰 Unpaid invoices: <b>${unpaidInvoices}</b>`,
          `📅 Scheduled posts: <b>${scheduledPosts}</b>`,
          "",
          "Text me anything to dig deeper.",
        ].join("\n"));
        return NextResponse.json({ ok: true });
      }

      // Handle /run — trigger agent cycle
      if (text === "/run") {
        // Import and run agent cycle (non-blocking)
        import("@/lib/agent/engine").then(({ runAgentCycle }) => {
          runAgentCycle().then((result) => {
            sendTelegramMessage(chatId, [
              `<b>🤖 Agent Cycle Complete</b>`,
              "",
              `Actions: <b>${result.actionsExecuted}</b>`,
              `Errors: ${result.errors.length > 0 ? result.errors.join(", ") : "None"}`,
              `Duration: ${(result.duration / 1000).toFixed(1)}s`,
              "",
              result.analysis ? `<i>${result.analysis.slice(0, 300)}</i>` : "",
            ].join("\n"));
          });
        });
        await sendTelegramMessage(chatId, "🤖 Running agent cycle now...");
        return NextResponse.json({ ok: true });
      }

      // Everything else → Cortana interprets and acts (non-blocking)
      handleCortanaMessage(chatId, text).catch((err) =>
        console.error("[Cortana] Error:", err)
      );

      return NextResponse.json({ ok: true });
    }

    // ─── CLIENT MESSAGES (Support Tickets) ─────────────────────────────

    // Handle /start command with onboard token
    if (text.startsWith("/start ")) {
      const token = text.replace("/start ", "").trim();
      return handleStartCommand(chatId, token, senderName);
    }

    // Look up client by telegram chat ID
    const client = await prisma.client.findUnique({
      where: { telegramChatId: chatId },
      select: { id: true, name: true },
    });

    if (!client) {
      await sendTelegramMessage(
        chatId,
        "Hey! I don't recognize this account yet. If you're a Blok Blok client, ask your account manager for your onboarding link, then use /start <your-token> to connect."
      );
      return NextResponse.json({ ok: true });
    }

    // Find or create an open ticket for this client
    let ticket = await prisma.supportTicket.findFirst({
      where: {
        clientId: client.id,
        status: { in: ["OPEN", "IN_PROGRESS"] },
      },
      orderBy: { updatedAt: "desc" },
    });

    if (!ticket) {
      // Create new ticket — subject is first 60 chars of message
      ticket = await prisma.supportTicket.create({
        data: {
          clientId: client.id,
          telegramChatId: chatId,
          subject: text.length > 60 ? text.slice(0, 57) + "..." : text,
          status: "OPEN",
          priority: "MEDIUM",
        },
      });

      // Notify Chase via Telegram
      const adminChatId = process.env.ADMIN_TELEGRAM_CHAT_ID;
      if (adminChatId) {
        await sendTelegramMessage(
          adminChatId,
          `💬 <b>New ticket from ${client.name}:</b>\n"${text.slice(0, 200)}"`
        );
      }

      // Notify OpenClaw
      await sendToOpenClaw(
        "cortana",
        `New support ticket from ${client.name}: "${ticket.subject}"`,
        { clientId: client.id, ticketId: ticket.id }
      );

      // Log activity
      await prisma.activityLog.create({
        data: {
          clientId: client.id,
          actor: "client",
          action: "support_ticket_created",
          details: `${client.name} opened a support ticket: ${ticket.subject}`,
        },
      });
    }

    // Save the message
    await prisma.supportMessage.create({
      data: {
        ticketId: ticket.id,
        sender: "client",
        text,
      },
    });

    // Update ticket timestamp
    await prisma.supportTicket.update({
      where: { id: ticket.id },
      data: { updatedAt: new Date() },
    });

    // Trigger instant agent response (non-blocking so Telegram doesn't timeout)
    respondToTicket(ticket.id).catch((err) =>
      console.error("[Webhook] Agent response failed:", err)
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[Telegram Webhook]", error);
    return NextResponse.json({ ok: true }); // Always return 200 to Telegram
  }
}

async function handleStartCommand(chatId: string, token: string, senderName: string) {
  const client = await prisma.client.findUnique({
    where: { onboardToken: token },
    select: { id: true, name: true },
  });

  if (!client) {
    await sendTelegramMessage(
      chatId,
      "That token doesn't match any client. Please check with your account manager for the correct link."
    );
    return NextResponse.json({ ok: true });
  }

  // Link Telegram to client
  await prisma.client.update({
    where: { id: client.id },
    data: { telegramChatId: chatId },
  });

  await prisma.activityLog.create({
    data: {
      clientId: client.id,
      actor: "client",
      action: "telegram_linked",
      details: `${senderName} linked their Telegram account`,
    },
  });

  await sendTelegramMessage(
    chatId,
    `Welcome, ${client.name}! Your Telegram is now linked to your Blok Blok account. You can message here anytime for support — we'll get back to you ASAP.`
  );

  // Notify Chase
  const adminChatId = process.env.ADMIN_TELEGRAM_CHAT_ID;
  if (adminChatId) {
    await sendTelegramMessage(
      adminChatId,
      `🔗 <b>${client.name}</b> just linked their Telegram.`
    );
  }

  await sendToOpenClaw(
    "cortana",
    `${client.name} just linked their Telegram account for support.`,
    { clientId: client.id }
  );

  return NextResponse.json({ ok: true });
}
