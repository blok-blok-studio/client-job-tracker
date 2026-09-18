import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

// GET /api/posting-slots?clientId= — the client's usual posting times, plus the
// times already taken by scheduled posts so the composer can skip them
export async function GET(request: NextRequest) {
  const clientId = request.nextUrl.searchParams.get("clientId");
  if (!clientId) return NextResponse.json({ success: false, error: "clientId is required" }, { status: 400 });

  const [slots, taken] = await Promise.all([
    prisma.postingSlot.findMany({ where: { clientId }, orderBy: [{ weekday: "asc" }, { time: "asc" }] }),
    prisma.contentPost.findMany({
      where: { clientId, scheduledAt: { gte: new Date() }, status: { in: ["SCHEDULED", "PUBLISHING", "ACTION_NEEDED"] } },
      select: { scheduledAt: true, groupId: true, id: true },
      take: 500,
    }),
  ]);

  return NextResponse.json({
    success: true,
    data: {
      slots: slots.map((s) => ({ weekday: s.weekday, time: s.time })),
      taken: taken.map((p) => ({ at: p.scheduledAt!.toISOString(), groupId: p.groupId || p.id })),
    },
  });
}

// PUT — replace the client's whole set of slots
export async function PUT(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid request" }, { status: 400 });
  }

  const clientId = typeof body.clientId === "string" ? body.clientId : "";
  const client = clientId ? await prisma.client.findUnique({ where: { id: clientId }, select: { id: true } }) : null;
  if (!client) return NextResponse.json({ success: false, error: "Client not found" }, { status: 404 });

  const seen = new Set<string>();
  const slots: { clientId: string; weekday: number; time: string }[] = [];
  for (const raw of Array.isArray(body.slots) ? body.slots : []) {
    const weekday = Number((raw as Record<string, unknown>)?.weekday);
    const time = String((raw as Record<string, unknown>)?.time || "");
    if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6 || !TIME_RE.test(time)) {
      return NextResponse.json({ success: false, error: "Each slot needs a day and a time." }, { status: 400 });
    }
    const key = `${weekday}-${time}`;
    if (seen.has(key)) continue;
    seen.add(key);
    slots.push({ clientId, weekday, time });
  }
  if (slots.length > 50) return NextResponse.json({ success: false, error: "Up to 50 slots per client." }, { status: 400 });

  await prisma.$transaction([prisma.postingSlot.deleteMany({ where: { clientId } }), prisma.postingSlot.createMany({ data: slots })]);
  return NextResponse.json({ success: true, data: { slots: slots.map(({ weekday, time }) => ({ weekday, time })) } });
}
