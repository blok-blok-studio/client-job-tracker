import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { clientSchema } from "@/lib/validations";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
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
        mediaFiles: { orderBy: { createdAt: "desc" }, select: { id: true, url: true, filename: true, fileType: true, fileSize: true, mimeType: true, uploadedBy: true, label: true, notes: true, createdAt: true } },
      },
    });

    if (!client) {
      return NextResponse.json({ success: false, error: "Client not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: client });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load client";
    console.error("GET /api/clients/[id] error:", message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const body = await request.json();
    const parsed = clientSchema.partial().parse(body);

    const data: Record<string, unknown> = {};

    // Only include fields that have real values — skip empty strings to preserve existing data
    for (const [key, value] of Object.entries(parsed)) {
      if (value === undefined) continue;
      if (value === "" || value === null) continue;
      data[key] = value;
    }

    if (data.contractStart) data.contractStart = new Date(data.contractStart as string);
    if (data.contractEnd) data.contractEnd = new Date(data.contractEnd as string);

    const client = await prisma.client.update({
      where: { id },
      data,
    });

    return NextResponse.json({ success: true, data: client });
  } catch {
    return NextResponse.json({ success: false, error: "Failed to update client" }, { status: 500 });
  }
}

// DELETE — archive (soft delete) or permanent delete
// ?permanent=true → hard delete with all data
// default → soft archive (set type to ARCHIVED)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const permanent = request.nextUrl.searchParams.get("permanent") === "true";

  try {
    if (permanent) {
      // Permanently delete client and all related data (cascade)
      const client = await prisma.client.findUnique({ where: { id }, select: { name: true } });
      await prisma.client.delete({ where: { id } });

      return NextResponse.json({ success: true, message: `${client?.name || "Client"} permanently deleted` });
    }

    // Soft archive — keep all data, invalidate all active links
    const client = await prisma.client.update({
      where: { id },
      data: {
        type: "ARCHIVED",
        onboardToken: null,
        uploadToken: null,
      },
      select: { id: true, name: true },
    });

    // Expire any pending contracts so signing links stop working
    await prisma.contractSignature.updateMany({
      where: { clientId: id, status: "PENDING" },
      data: { status: "EXPIRED" },
    });

    await prisma.activityLog.create({
      data: {
        clientId: id,
        actor: "chase",
        action: "archived_client",
        details: `Archived client: ${client.name} — all active links invalidated`,
      },
    });

    return NextResponse.json({ success: true, data: client });
  } catch {
    return NextResponse.json({ success: false, error: "Failed to process request" }, { status: 500 });
  }
}
