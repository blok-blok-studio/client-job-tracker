import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { clientServiceSchema } from "@/lib/validations";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const body = await request.json();
    const parsed = clientServiceSchema.partial().parse(body);

    const existing = await prisma.clientService.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ success: false, error: "Service not found" }, { status: 404 });
    }

    const data: Record<string, unknown> = {};
    if (parsed.name !== undefined) data.name = parsed.name;
    if (parsed.category !== undefined) data.category = parsed.category || null;
    if (parsed.status !== undefined) data.status = parsed.status;
    if (parsed.recurring !== undefined) data.recurring = parsed.recurring;
    if (parsed.price !== undefined) data.price = parsed.price;
    if (parsed.startedAt !== undefined) data.startedAt = parsed.startedAt ? new Date(parsed.startedAt) : null;
    if (parsed.endedAt !== undefined) data.endedAt = parsed.endedAt ? new Date(parsed.endedAt) : null;
    if (parsed.notes !== undefined) data.notes = parsed.notes || null;
    // Transitioning into an ending status stamps endedAt unless one was supplied.
    // The form always sends endedAt (null when blank), so key off the transition,
    // not off endedAt being absent.
    if (
      (parsed.status === "COMPLETED" || parsed.status === "CANCELLED") &&
      parsed.status !== existing.status &&
      !parsed.endedAt &&
      !existing.endedAt
    ) {
      data.endedAt = new Date();
    }

    const service = await prisma.clientService.update({
      where: { id },
      data,
      include: {
        client: { select: { id: true, name: true, company: true, type: true, tier: true } },
      },
    });

    if (parsed.status && parsed.status !== existing.status) {
      await prisma.activityLog.create({
        data: {
          clientId: service.clientId,
          actor: "chase",
          action: "updated_service",
          details: `Service ${service.name}: ${existing.status} → ${service.status}`,
        },
      });
    }

    return NextResponse.json({ success: true, data: service });
  } catch (error) {
    if (error instanceof Error && error.name === "ZodError") {
      return NextResponse.json({ success: false, error: "Validation failed" }, { status: 400 });
    }
    console.error("Failed to update service:", error);
    return NextResponse.json({ success: false, error: "Failed to update service" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const existing = await prisma.clientService.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ success: false, error: "Service not found" }, { status: 404 });
  }

  await prisma.clientService.delete({ where: { id } });

  await prisma.activityLog.create({
    data: {
      clientId: existing.clientId,
      actor: "chase",
      action: "removed_service",
      details: `Removed service: ${existing.name}`,
    },
  });

  return NextResponse.json({ success: true });
}
