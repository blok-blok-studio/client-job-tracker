import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { contentPostBulkSchema } from "@/lib/validations";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = contentPostBulkSchema.parse(body);

    const status = parsed.status || (parsed.scheduledAt ? "SCHEDULED" : "DRAFT");
    const sharedData = {
      clientId: parsed.clientId,
      status,
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
    };

    const posts = await prisma.$transaction(
      parsed.platforms.map(({ platform, credentialId }) =>
        prisma.contentPost.create({
          data: {
            ...sharedData,
            platform,
            credentialId: credentialId || null,
          },
          include: {
            client: { select: { id: true, name: true } },
          },
        })
      )
    );

    const platformNames = parsed.platforms.map((p) => p.platform).join(", ");
    await prisma.activityLog.create({
      data: {
        clientId: parsed.clientId,
        actor: "chase",
        action: "content_post_created",
        details: `Created multi-platform post across ${platformNames}: ${parsed.title || "(untitled)"}`,
      },
    });

    return NextResponse.json({ success: true, data: posts }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create content posts";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
