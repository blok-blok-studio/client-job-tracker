import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { sendTelegramMessage } from "@/lib/telegram";
import { sendToOpenClaw } from "@/lib/openclaw/client";

interface TelegramUpdate {
  message?: {
    chat: { id: number };
    from?: { first_name?: string; last_name?: string; username?: string };
    text?: string;
  };
}

export async function POST(request: NextRequest) {
  try {
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

      // Notify Chase via OpenClaw
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

    // Auto-acknowledge if it's a new ticket
    if (ticket.status === "OPEN") {
      await sendTelegramMessage(
        chatId,
        `Got it, ${client.name}! Your message has been received. Our team will get back to you shortly.`
      );
    }

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
  await sendToOpenClaw(
    "cortana",
    `${client.name} just linked their Telegram account for support.`,
    { clientId: client.id }
  );

  return NextResponse.json({ ok: true });
}
