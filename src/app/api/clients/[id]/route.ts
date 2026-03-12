import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { clientSchema } from "@/lib/validations";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const client = await prisma.client.findUnique({
    where: { id },
    include: {
      contacts: { orderBy: { createdAt: "asc" } },
      tasks: { orderBy: { sortOrder: "asc" }, take: 20 },
      credentials: { select: { id: true, platform: true, label: true, username: true, url: true, lastRotated: true, createdAt: true } },
      checklistItems: { orderBy: { sortOrder: "asc" } },
      invoices: { orderBy: { createdAt: "desc" }, take: 10 },
      socialLinks: { orderBy: { createdAt: "asc" } },
      activityLogs: { orderBy: { createdAt: "desc" }, take: 20 },
      contracts: { orderBy: { createdAt: "desc" }, select: { id: true, token: true, status: true, signedName: true, signedAt: true, createdAt: true } },
      paymentLinks: { orderBy: { createdAt: "desc" }, select: { id: true, stripeUrl: true, amount: true, currency: true, description: true, recurring: true, interval: true, status: true, paidAt: true, milestone: true, contractId: true, createdAt: true } },
    },
  });

  if (!client) {
    return NextResponse.json({ success: false, error: "Client not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true, data: client });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const body = await request.json();
    const parsed = clientSchema.partial().parse(body);

    const data: Record<string, unknown> = { ...parsed };
    if (parsed.contractStart) data.contractStart = new Date(parsed.contractStart);
    if (parsed.contractEnd) data.contractEnd = new Date(parsed.contractEnd);

    const client = await prisma.client.update({
      where: { id },
      data,
    });

    return NextResponse.json({ success: true, data: client });
  } catch {
    return NextResponse.json({ success: false, error: "Failed to update client" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  await prisma.client.update({
    where: { id },
    data: { type: "ARCHIVED" },
  });

  await prisma.activityLog.create({
    data: {
      clientId: id,
      actor: "chase",
      action: "archived_client",
      details: "Client archived",
    },
  });

  return NextResponse.json({ success: true });
}
