import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { contentPostSchema } from "@/lib/validations";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const clientId = searchParams.get("clientId");
  const platform = searchParams.get("platform");
  const status = searchParams.get("status");
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  const where: Record<string, unknown> = {};
  if (clientId) where.clientId = clientId;
  if (platform) where.platform = platform;
  if (status) where.status = status;
  if (from || to) {
    where.scheduledAt = {
      ...(from ? { gte: new Date(from) } : {}),
      ...(to ? { lte: new Date(to) } : {}),
    };
  }

  const posts = await prisma.contentPost.findMany({
    where,
    include: {
      client: { select: { id: true, name: true } },
    },
    orderBy: { scheduledAt: "asc" },
  });

  return NextResponse.json({ success: true, data: posts });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = contentPostSchema.parse(body);

    const post = await prisma.contentPost.create({
      data: {
        clientId: parsed.clientId,
        platform: parsed.platform,
        status: parsed.status || (parsed.scheduledAt ? "SCHEDULED" : "DRAFT"),
        title: parsed.title || null,
        body: parsed.body || null,
        hashtags: parsed.hashtags || [],
        mediaUrls: parsed.mediaUrls || [],
        scheduledAt: parsed.scheduledAt ? new Date(parsed.scheduledAt) : null,
      },
      include: {
        client: { select: { id: true, name: true } },
      },
    });

    await prisma.activityLog.create({
      data: {
        clientId: post.clientId,
        actor: "chase",
        action: "content_post_created",
        details: `Created ${post.platform} post: ${post.title || "(untitled)"}`,
      },
    });

    return NextResponse.json({ success: true, data: post }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create content post";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
