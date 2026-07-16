import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";

// GET — list subscribers (newest first) + campaign history
export async function GET() {
  const [subscribers, campaigns] = await Promise.all([
    prisma.newsletterSubscriber.findMany({ orderBy: { subscribedAt: "desc" } }),
    prisma.newsletterCampaign.findMany({ orderBy: { sentAt: "desc" }, take: 10 }),
  ]);
  return NextResponse.json({ success: true, data: { subscribers, campaigns } });
}

// POST — manually add a subscriber
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, name } = z
      .object({ email: z.string().email(), name: z.string().max(120).optional() })
      .parse(body);

    const sub = await prisma.newsletterSubscriber.upsert({
      where: { email: email.toLowerCase() },
      update: { unsubscribedAt: null, ...(name ? { name } : {}) },
      create: { email: email.toLowerCase(), name: name || null, source: "manual" },
    });

    return NextResponse.json({ success: true, data: sub }, { status: 201 });
  } catch {
    return NextResponse.json({ success: false, error: "Invalid email" }, { status: 400 });
  }
}
