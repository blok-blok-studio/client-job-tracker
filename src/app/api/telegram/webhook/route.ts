import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import prisma from "@/lib/prisma";
import { sendTelegramMessage, getWebhookSecret } from "@/lib/telegram";
import { sendToOpenClaw } from "@/lib/openclaw/client";
import { respondToTicket } from "@/lib/agent/ticket-responder";
import { handleCortanaMessage } from "@/lib/agent/cortana";
import { rateLimit } from "@/lib/rate-limit";

interface TelegramUpdate {
  message?: {
    chat: { id: number };
    from?: { first_name?: string; last_name?: string; username?: string };
    text?: string;
  };
}

// Checks if this chat is the admin (Chase). Uses ADMIN_TELEGRAM_CHAT_ID env var.
// If not set, falls back to checking ADMIN_TELEGRAM_USERNAME against the sender.
function isAdminChat(chatId: string, username?: string): boolean {
  const adminId = process.env.ADMIN_TELEGRAM_CHAT_ID;
  if (adminId && chatId === adminId) return true;

  // Fallback: match by username if configured
  const adminUsername = process.env.ADMIN_TELEGRAM_USERNAME;
  if (adminUsername && username) {
    return username.toLowerCase() === adminUsername.toLowerCase().replace("@", "");
  }

  return false;
}

export async function POST(request: NextRequest) {
  try {
    // Verify Telegram secret token header
    const secret = getWebhookSecret();
    if (secret) {
      const headerSecret = request.headers.get("x-telegram-bot-api-secret-token");
      if (!headerSecret || headerSecret.length === 0) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      // Hash both to constant length for timing-safe comparison
      const headerHash = crypto.createHash("sha256").update(headerSecret).digest();
      const secretHash = crypto.createHash("sha256").update(secret).digest();
      if (!crypto.timingSafeEqual(headerHash, secretHash)) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    const update: TelegramUpdate = await request.json();

    if (!update.message?.text) {
      return NextResponse.json({ ok: true });
    }

    const chatId = String(update.message.chat.id);
    const text = update.message.text;
    const username = update.message.from?.username;
    const senderName = [
      update.message.from?.first_name,
      update.message.from?.last_name,
    ]
      .filter(Boolean)
      .join(" ") || "Unknown";

    const admin = isAdminChat(chatId, username);

    // ─── ADMIN COMMANDS (Chase texting Cortana) ────────────────────────
    if (admin) {
      return handleAdminMessage(chatId, text);
    }

    // ─── CLIENT MESSAGES (Support Tickets) ─────────────────────────────
    return handleClientMessage(chatId, text, senderName);

  } catch (error) {
    console.error("[Telegram Webhook]", error);
    return NextResponse.json({ ok: true }); // Always return 200 to Telegram
  }
}

// ─── Admin (Chase) message handling ───────────────────────────────────────

async function handleAdminMessage(chatId: string, text: string) {
  // /start — greet
  if (text === "/start") {
    // Auto-save chat ID so we don't need to configure it manually next time
    if (!process.env.ADMIN_TELEGRAM_CHAT_ID) {
      console.log(`[Cortana] Admin chat ID detected: ${chatId} — set ADMIN_TELEGRAM_CHAT_ID=${chatId} in your env`);
    }
    await sendTelegramMessage(chatId, [
      "Hey Chase. I'm online.",
      "",
      "Text me anything — I'll handle it.",
      "Or use a command:",
      "/status — quick dashboard",
      "/run — trigger agent cycle",
      "/tickets — open support tickets",
      "/help — all commands",
    ].join("\n"));
    return NextResponse.json({ ok: true });
  }

  // /help
  if (text === "/help") {
    await sendTelegramMessage(chatId, [
      "<b>Cortana Commands</b>",
      "",
      "/status — quick operational numbers",
      "/run — trigger an agent cycle now",
      "/tickets — list open support tickets",
      "/clients — list active clients",
      "",
      "<b>Natural Language</b> (just type normally):",
      '• "create a task for [client] to [thing]"',
      '• "schedule a post for [client] on IG about [topic]"',
      '• "draft content for [client] about [topic]"',
      '• "remind [client] about [thing]"',
      '• "what\'s going on" / "status" / "update"',
      '• "what tasks are overdue"',
      '• "how is [client] doing"',
      "",
      "I understand context — just tell me what you need.",
    ].join("\n"));
    return NextResponse.json({ ok: true });
  }

  // /status — quick dashboard
  if (text === "/status" || text.toLowerCase() === "status") {
    const [openTasks, overdueCount, openTickets, unpaidInvoices, scheduledPosts] = await Promise.all([
      prisma.task.count({ where: { status: { notIn: ["DONE"] } } }),
      prisma.task.count({ where: { dueDate: { lt: new Date() }, status: { notIn: ["DONE"] } } }),
      prisma.supportTicket.count({ where: { status: { in: ["OPEN", "IN_PROGRESS"] } } }),
      prisma.invoice.count({ where: { status: { in: ["SENT", "OVERDUE"] } } }),
      prisma.contentPost.count({ where: { status: "SCHEDULED" } }),
    ]);

    await sendTelegramMessage(chatId, [
      "<b>Quick Status</b>",
      "",
      `Open tasks: <b>${openTasks}</b>${overdueCount > 0 ? ` (${overdueCount} overdue)` : ""}`,
      `Open tickets: <b>${openTickets}</b>`,
      `Unpaid invoices: <b>${unpaidInvoices}</b>`,
      `Scheduled posts: <b>${scheduledPosts}</b>`,
    ].join("\n"));
    return NextResponse.json({ ok: true });
  }

  // /tickets — list open tickets
  if (text === "/tickets") {
    const tickets = await prisma.supportTicket.findMany({
      where: { status: { in: ["OPEN", "IN_PROGRESS"] } },
      include: {
        client: { select: { name: true } },
        messages: { orderBy: { createdAt: "desc" }, take: 1 },
      },
      orderBy: { updatedAt: "desc" },
      take: 10,
    });

    if (tickets.length === 0) {
      await sendTelegramMessage(chatId, "No open tickets right now.");
      return NextResponse.json({ ok: true });
    }

    type TicketWithRelations = typeof tickets[number] & {
      client: { name: string };
      messages: Array<{ text: string }>;
    };
    const lines = (tickets as TicketWithRelations[]).map((t) => {
      const lastMsg = t.messages[0];
      const preview = lastMsg ? lastMsg.text.slice(0, 50) : "No messages";
      return `<b>${t.client.name}</b> [${t.status}]\n  ${t.subject}\n  <i>${preview}${lastMsg && lastMsg.text.length > 50 ? "..." : ""}</i>`;
    });

    await sendTelegramMessage(chatId, [
      `<b>Open Tickets (${tickets.length})</b>`,
      "",
      ...lines,
    ].join("\n\n"));
    return NextResponse.json({ ok: true });
  }

  // /clients — list active clients
  if (text === "/clients") {
    const clients = await prisma.client.findMany({
      where: { type: "ACTIVE" },
      include: { _count: { select: { tasks: { where: { status: { notIn: ["DONE"] } } } } } },
      orderBy: { name: "asc" },
    });

    if (clients.length === 0) {
      await sendTelegramMessage(chatId, "No active clients.");
      return NextResponse.json({ ok: true });
    }

    type ClientWithCount = typeof clients[number] & { _count: { tasks: number } };
    const lines = (clients as ClientWithCount[]).map((c) => {
      const taskInfo = c._count.tasks > 0 ? `${c._count.tasks} open tasks` : "no open tasks";
      return `<b>${c.name}</b>${c.company ? ` (${c.company})` : ""} — ${taskInfo}`;
    });

    await sendTelegramMessage(chatId, [
      `<b>Active Clients (${clients.length})</b>`,
      "",
      ...lines,
    ].join("\n"));
    return NextResponse.json({ ok: true });
  }

  // /run — trigger agent cycle
  if (text === "/run") {
    await sendTelegramMessage(chatId, "Running agent cycle...");
    try {
      const { runAgentCycle } = await import("@/lib/agent/engine");
      const result = await runAgentCycle();
      await sendTelegramMessage(chatId, [
        `<b>Agent Cycle Complete</b>`,
        "",
        `Actions: <b>${result.actionsExecuted}</b>`,
        `Errors: ${result.errors.length > 0 ? result.errors.join(", ") : "None"}`,
        `Duration: ${(result.duration / 1000).toFixed(1)}s`,
        "",
        result.analysis ? `<i>${result.analysis.slice(0, 300)}</i>` : "",
      ].join("\n"));
    } catch (err) {
      console.error("[Agent] Cycle error:", err);
      await sendTelegramMessage(chatId, `Agent cycle failed: ${err instanceof Error ? err.message : "Unknown error"}`);
    }
    return NextResponse.json({ ok: true });
  }

  // Everything else → Cortana AI interprets and acts
  handleCortanaMessage(chatId, text).catch((err) =>
    console.error("[Cortana] Error:", err)
  );

  return NextResponse.json({ ok: true });
}

// ─── Client message handling (support tickets) ───────────────────────────

async function handleClientMessage(chatId: string, text: string, senderName: string) {
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
        `New ticket from <b>${client.name}</b>:\n"${text.slice(0, 200)}"`
      );
    }

    // Notify OpenClaw
    await sendToOpenClaw(
      "cortana",
      `New support ticket from ${client.name}: "${ticket.subject}"`,
      { clientId: client.id, ticketId: ticket.id }
    );

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

  // Trigger instant agent response (non-blocking)
  respondToTicket(ticket.id).catch((err) =>
    console.error("[Webhook] Agent response failed:", err)
  );

  return NextResponse.json({ ok: true });
}

// ─── /start onboarding command ───────────────────────────────────────────

async function handleStartCommand(chatId: string, token: string, senderName: string) {
  // Rate limit token attempts — 5/min per chat to prevent enumeration
  const rl = rateLimit(chatId, { max: 5, prefix: "telegram-start" });
  if (!rl.allowed) {
    await sendTelegramMessage(chatId, "Too many attempts. Please try again in a minute.");
    return NextResponse.json({ ok: true });
  }

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
      `<b>${client.name}</b> just linked their Telegram.`
    );
  }

  await sendToOpenClaw(
    "cortana",
    `${client.name} just linked their Telegram account for support.`,
    { clientId: client.id }
  );

  return NextResponse.json({ ok: true });
}
