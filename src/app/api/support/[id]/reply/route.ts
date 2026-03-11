import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { sendTelegramMessage } from "@/lib/telegram";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const text = body.text as string;
  // Sender is always "chase" for manual replies — "bot" and "client" are set by their respective systems
  const sender = "chase";

  if (!text) {
    return NextResponse.json({ success: false, error: "Text is required" }, { status: 400 });
  }

  const ticket = await prisma.supportTicket.findUnique({
    where: { id },
    select: { id: true, telegramChatId: true, clientId: true, status: true },
  });

  if (!ticket) {
    return NextResponse.json({ success: false, error: "Ticket not found" }, { status: 404 });
  }

  // Save the reply message
  const message = await prisma.supportMessage.create({
    data: {
      ticketId: id,
      sender,
      text,
    },
  });

  // Update ticket to IN_PROGRESS if it was OPEN
  if (ticket.status === "OPEN") {
    await prisma.supportTicket.update({
      where: { id },
      data: { status: "IN_PROGRESS" },
    });
  }

  // Send to client via Telegram
  const result = await sendTelegramMessage(ticket.telegramChatId, text);

  if (!result.success) {
    console.error("[Support Reply] Failed to send Telegram message:", result.error);
  }

  return NextResponse.json({ success: true, data: message });
}
