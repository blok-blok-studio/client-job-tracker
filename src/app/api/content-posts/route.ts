import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { contentPostSchema, USER_SETTABLE_POST_STATUSES } from "@/lib/validations";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const clientId = searchParams.get("clientId");
  const platform = searchParams.get("platform");
  const status = searchParams.get("status");
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  const assignedToId = searchParams.get("assignedToId");
  const publishMode = searchParams.get("publishMode");
  // Planner: also return drafts with no date alongside a from/to window
  const includeUnscheduled = searchParams.get("includeUnscheduled") === "1";

  const groupId = searchParams.get("groupId");

  const where: Record<string, unknown> = {};
  if (clientId) where.clientId = clientId;
  if (groupId) where.groupId = groupId;
  if (platform) where.platform = platform;
  // status accepts a comma list (e.g. SCHEDULED,FAILED)
  if (status) where.status = status.includes(",") ? { in: status.split(",") } : status;
  if (assignedToId) where.assignedToId = assignedToId;
  if (publishMode) where.publishMode = publishMode;
  if (from || to) {
    const range = {
      ...(from ? { gte: new Date(from) } : {}),
      ...(to ? { lte: new Date(to) } : {}),
    };
    if (includeUnscheduled) where.OR = [{ scheduledAt: range }, { scheduledAt: null }];
    else where.scheduledAt = range;
  }

  const posts = await prisma.contentPost.findMany({
    where,
    include: {
      client: { select: { id: true, name: true } },
      credential: { select: { id: true, label: true, platform: true, meta: true } },
    },
    orderBy: { scheduledAt: "asc" },
  });

  return NextResponse.json({ success: true, data: posts });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = contentPostSchema.parse(body);
    if (parsed.status && !(USER_SETTABLE_POST_STATUSES as readonly string[]).includes(parsed.status)) {
      return NextResponse.json({ success: false, error: "New posts can only be drafts or scheduled" }, { status: 400 });
    }

    const post = await prisma.contentPost.create({
      data: {
        clientId: parsed.clientId,
        credentialId: parsed.credentialId || null,
        platform: parsed.platform,
        status: parsed.status || (parsed.scheduledAt ? "SCHEDULED" : "DRAFT"),
        title: parsed.title || null,
        body: parsed.body || null,
        hashtags: parsed.hashtags || [],
        mediaUrls: parsed.mediaUrls || [],
        scheduledAt: parsed.scheduledAt ? new Date(parsed.scheduledAt) : null,
        location: parsed.location || null,
        locationLat: parsed.locationLat ?? null,
        locationLng: parsed.locationLng ?? null,
        taggedUsers: parsed.taggedUsers || [],
        collaborators: parsed.collaborators || [],
        altText: parsed.altText || null,
        coverImageUrl: parsed.coverImageUrl || null,
        thumbnailUrl: parsed.thumbnailUrl || null,
        firstComment: parsed.firstComment || null,
        platformSettings: parsed.platformSettings ?? undefined,
        visibility: parsed.visibility || "PUBLIC",
        enableComments: parsed.enableComments ?? true,
        groupId: parsed.groupId || null,
        publishMode: parsed.publishMode || (parsed.platform === "REDNOTE" ? "ASSISTED" : "AUTO"),
        assignedToId: parsed.assignedToId || null,
        approvalStatus: parsed.holdForApproval ? "PENDING" : null,
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
