import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { syncEvent } from "@/lib/sync";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const ticket = await prisma.supportTicket.findUnique({
    where: { id },
    include: {
      client: { select: { id: true, name: true, company: true, tier: true } },
      messages: { orderBy: { createdAt: "asc" } },
    },
  });

  if (!ticket) {
    return NextResponse.json({ success: false, error: "Ticket not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true, data: ticket });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();

  const updates: Record<string, unknown> = {};
  if (body.status) updates.status = body.status;
  if (body.priority) updates.priority = body.priority;

  const existing = await prisma.supportTicket.findUnique({ where: { id }, select: { status: true, subject: true, clientId: true } });
  const ticket = await prisma.supportTicket.update({
    where: { id },
    data: updates,
  });

  // Sync: notify when ticket is resolved
  if (body.status === "RESOLVED" && existing && existing.status !== "RESOLVED") {
    syncEvent({
      type: "ticket_resolved",
      clientId: existing.clientId,
      ticketId: id,
      subject: existing.subject,
    }).catch(() => {});
  }

  return NextResponse.json({ success: true, data: ticket });
}
