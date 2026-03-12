import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import prisma from "@/lib/prisma";
import { clientSchema } from "@/lib/validations";

const DEFAULT_CHECKLIST_ITEMS = [
  "Discovery call completed",
  "Payment confirmed",
  "Onboarding completed",
  "Contract signed",
  "Content calendar created",
  "First deliverable sent",
];

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const type = searchParams.get("type");
  const tier = searchParams.get("tier");
  const search = searchParams.get("search");

  const where: Record<string, unknown> = {};
  if (type && type !== "ALL") where.type = type;
  if (tier) where.tier = tier;
  if (search) {
    where.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { company: { contains: search, mode: "insensitive" } },
      { email: { contains: search, mode: "insensitive" } },
    ];
  }

  const clients = await prisma.client.findMany({
    where,
    include: {
      _count: { select: { tasks: { where: { status: { notIn: ["DONE"] } } } } },
    },
    orderBy: { updatedAt: "desc" },
  });

  return NextResponse.json({ success: true, data: clients });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = clientSchema.parse(body);

    const onboardToken = randomBytes(24).toString("hex");

    const client = await prisma.client.create({
      data: {
        name: parsed.name,
        email: parsed.email || null,
        phone: parsed.phone || null,
        company: parsed.company || null,
        type: parsed.type || undefined,
        tier: parsed.tier || undefined,
        source: parsed.source || null,
        industry: parsed.industry || null,
        notes: parsed.notes || null,
        monthlyRetainer: parsed.monthlyRetainer ?? null,
        contractStart: parsed.contractStart ? new Date(parsed.contractStart) : null,
        contractEnd: parsed.contractEnd ? new Date(parsed.contractEnd) : null,
        timezone: parsed.timezone || null,
        onboardToken,
        checklistItems: {
          create: DEFAULT_CHECKLIST_ITEMS.map((label, i) => ({
            label,
            sortOrder: i,
          })),
        },
      },
    });

    await prisma.activityLog.create({
      data: {
        clientId: client.id,
        actor: "chase",
        action: "created_client",
        details: `Created client: ${client.name}`,
      },
    });

    return NextResponse.json({ success: true, data: client }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.name === "ZodError") {
      return NextResponse.json({ success: false, error: "Validation failed" }, { status: 400 });
    }
    console.error("Failed to create client:", error);
    return NextResponse.json({ success: false, error: "Failed to create client" }, { status: 500 });
  }
}
