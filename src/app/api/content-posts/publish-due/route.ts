import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { publishPost } from "@/lib/social/publisher";

// GET: List posts due for publishing (for OpenClaw inspection)
export async function GET() {
  const duePosts = await prisma.contentPost.findMany({
    where: {
      status: "SCHEDULED",
      scheduledAt: { lte: new Date() },
    },
    include: { client: { select: { id: true, name: true } } },
    orderBy: { scheduledAt: "asc" },
  });

  return NextResponse.json({ success: true, data: duePosts, count: duePosts.length });
}

// POST: Publish all due posts (called by OpenClaw heartbeat or Vercel Cron)
export async function POST(request: NextRequest) {
  // Optional auth check for OpenClaw
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  const openclawToken = process.env.OPENCLAW_API_TOKEN;

  if (cronSecret || openclawToken) {
    const token = authHeader?.replace("Bearer ", "");
    if (token !== cronSecret && token !== openclawToken) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
  }

  const duePosts = await prisma.contentPost.findMany({
    where: {
      status: "SCHEDULED",
      scheduledAt: { lte: new Date() },
    },
    orderBy: { scheduledAt: "asc" },
  });

  if (duePosts.length === 0) {
    return NextResponse.json({ success: true, message: "No posts due", published: 0, failed: 0 });
  }

  const results: { id: string; status: "PUBLISHED" | "FAILED"; error?: string }[] = [];

  for (const post of duePosts) {
    // Mark as publishing
    await prisma.contentPost.update({
      where: { id: post.id },
      data: { status: "PUBLISHING" },
    });

    // Fetch client credentials separately for this post
    const credentials = await prisma.credential.findMany({
      where: { clientId: post.clientId },
    });

    try {
      const result = await publishPost(post, credentials);

      await prisma.contentPost.update({
        where: { id: post.id },
        data: {
          status: "PUBLISHED",
          publishedAt: new Date(),
          externalId: result.externalId || null,
          externalUrl: result.externalUrl || null,
          publishError: null,
        },
      });

      await prisma.activityLog.create({
        data: {
          clientId: post.clientId,
          actor: "openclaw",
          action: "content_published",
          details: `Published ${post.platform} post: ${post.title || "(untitled)"}`,
        },
      });

      results.push({ id: post.id, status: "PUBLISHED" });
    } catch (err) {
      const error = err instanceof Error ? err.message : "Unknown publish error";

      await prisma.contentPost.update({
        where: { id: post.id },
        data: {
          status: "FAILED",
          publishError: error,
        },
      });

      await prisma.activityLog.create({
        data: {
          clientId: post.clientId,
          actor: "openclaw",
          action: "content_publish_failed",
          details: `Failed to publish ${post.platform} post: ${error}`,
        },
      });

      results.push({ id: post.id, status: "FAILED", error });
    }
  }

  const published = results.filter((r) => r.status === "PUBLISHED").length;
  const failed = results.filter((r) => r.status === "FAILED").length;

  return NextResponse.json({ success: true, published, failed, results });
}
