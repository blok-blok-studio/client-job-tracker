import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { publishPost } from "@/lib/social/publisher";
import { humanDelay } from "@/lib/social/http";

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
  // Auth check for OpenClaw / Cron
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

  const results: { id: string; platform: string; status: "PUBLISHED" | "FAILED"; error?: string }[] = [];
  const MAX_RETRIES = 2;

  for (const post of duePosts) {
    // Mark as publishing
    await prisma.contentPost.update({
      where: { id: post.id },
      data: { status: "PUBLISHING" },
    });

    // Fetch client credentials
    const credentials = await prisma.credential.findMany({
      where: { clientId: post.clientId },
    });

    let lastError = "";
    let published = false;

    // Retry loop with exponential backoff
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        if (attempt > 0) {
          const backoff = Math.pow(2, attempt) * 2000 + Math.random() * 2000;
          await new Promise((r) => setTimeout(r, backoff));
        }

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
            details: `Published ${post.platform} post: ${post.title || "(untitled)"}${attempt > 0 ? ` (retry ${attempt})` : ""}`,
          },
        });

        results.push({ id: post.id, platform: post.platform, status: "PUBLISHED" });
        published = true;
        break;
      } catch (err) {
        lastError = err instanceof Error ? err.message : "Unknown publish error";

        // Don't retry on auth/credential errors (they won't succeed)
        if (
          lastError.includes("credentials") ||
          lastError.includes("Unauthorized") ||
          lastError.includes("401")
        ) {
          break;
        }
      }
    }

    if (!published) {
      await prisma.contentPost.update({
        where: { id: post.id },
        data: {
          status: "FAILED",
          publishError: lastError,
        },
      });

      await prisma.activityLog.create({
        data: {
          clientId: post.clientId,
          actor: "openclaw",
          action: "content_publish_failed",
          details: `Failed to publish ${post.platform} post after ${MAX_RETRIES + 1} attempts: ${lastError}`,
        },
      });

      results.push({ id: post.id, platform: post.platform, status: "FAILED", error: lastError });
    }

    // Stagger publishing between posts to avoid platform rate limits
    if (duePosts.indexOf(post) < duePosts.length - 1) {
      await humanDelay(2000, 5000);
    }
  }

  const published = results.filter((r) => r.status === "PUBLISHED").length;
  const failed = results.filter((r) => r.status === "FAILED").length;

  return NextResponse.json({ success: true, published, failed, results });
}
