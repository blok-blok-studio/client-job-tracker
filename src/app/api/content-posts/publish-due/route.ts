import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { publishPost, sanitizePublishError } from "@/lib/social/publisher";
import { humanDelay } from "@/lib/social/http";
import crypto from "crypto";

function timingSafeTokenCheck(token: string | undefined, secret: string | undefined): boolean {
  if (!token || !secret) return false;
  const tokenHash = crypto.createHash("sha256").update(token).digest();
  const secretHash = crypto.createHash("sha256").update(secret).digest();
  return crypto.timingSafeEqual(tokenHash, secretHash);
}

// GET: List posts due for publishing (for OpenClaw inspection) — requires auth
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");
  const cronSecret = process.env.CRON_SECRET;
  const openclawToken = process.env.OPENCLAW_API_TOKEN;

  if (!timingSafeTokenCheck(token, cronSecret) && !timingSafeTokenCheck(token, openclawToken)) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const duePosts = await prisma.contentPost.findMany({
    where: {
      status: "SCHEDULED",
      scheduledAt: { lte: new Date() },
      NOT: {
        platform: { in: ["TWITTER", "THREADS"] },
        client: { name: { contains: "Chase Haynes" } },
      },
    },
    select: { id: true, platform: true, status: true, scheduledAt: true, title: true },
    orderBy: { scheduledAt: "asc" },
  });

  return NextResponse.json({ success: true, count: duePosts.length });
}

// POST: Publish all due posts (called by OpenClaw heartbeat or Vercel Cron)
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");
  const cronSecret = process.env.CRON_SECRET;
  const openclawToken = process.env.OPENCLAW_API_TOKEN;

  if (!timingSafeTokenCheck(token, cronSecret) && !timingSafeTokenCheck(token, openclawToken)) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const duePosts = await prisma.contentPost.findMany({
    where: {
      status: "SCHEDULED",
      scheduledAt: { lte: new Date() },
      // Exclude auto-publishing X/Threads for Chase Haynes — manual publish only
      NOT: {
        platform: { in: ["TWITTER", "THREADS"] },
        client: { name: { contains: "Chase Haynes" } },
      },
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

    // Fetch credentials — specific one if linked, otherwise all for the client
    const credentials = post.credentialId
      ? await prisma.credential.findMany({ where: { id: post.credentialId } })
      : await prisma.credential.findMany({ where: { clientId: post.clientId } });

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
        lastError = sanitizePublishError(err instanceof Error ? err.message : "Unknown publish error");

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
