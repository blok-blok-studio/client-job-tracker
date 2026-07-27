import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { clientServiceSchema } from "@/lib/validations";

// GET /api/services — every client's services for the overview page.
// Filtering is done client-side; archived clients are excluded unless requested.
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const includeArchived = searchParams.get("includeArchived") === "1";
  const clientId = searchParams.get("clientId");

  const where: Record<string, unknown> = {};
  if (clientId) where.clientId = clientId;
  if (!includeArchived) where.client = { type: { not: "ARCHIVED" } };

  const services = await prisma.clientService.findMany({
    where,
    include: {
      client: { select: { id: true, name: true, company: true, type: true, tier: true } },
    },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
  });

  return NextResponse.json({ success: true, data: services });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = clientServiceSchema.parse(body);

    const client = await prisma.client.findUnique({
      where: { id: parsed.clientId },
      select: { id: true, name: true },
    });
    if (!client) {
      return NextResponse.json({ success: false, error: "Client not found" }, { status: 404 });
    }

    const service = await prisma.clientService.create({
      data: {
        clientId: parsed.clientId,
        name: parsed.name,
        category: parsed.category || null,
        status: parsed.status || "ACTIVE",
        recurring: parsed.recurring ?? false,
        price: parsed.price ?? null,
        startedAt: parsed.startedAt ? new Date(parsed.startedAt) : null,
        endedAt: parsed.endedAt ? new Date(parsed.endedAt) : null,
        notes: parsed.notes || null,
      },
      include: {
        client: { select: { id: true, name: true, company: true, type: true, tier: true } },
      },
    });

    await prisma.activityLog.create({
      data: {
        clientId: client.id,
        actor: "chase",
        action: "added_service",
        details: `Added service: ${service.name}`,
      },
    });

    return NextResponse.json({ success: true, data: service }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.name === "ZodError") {
      return NextResponse.json({ success: false, error: "Validation failed" }, { status: 400 });
    }
    console.error("Failed to create service:", error);
    return NextResponse.json({ success: false, error: "Failed to create service" }, { status: 500 });
  }
}
