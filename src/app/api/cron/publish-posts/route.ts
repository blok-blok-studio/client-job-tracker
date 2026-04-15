import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { publishPost, sanitizePublishError } from "@/lib/social/publisher";
import { humanDelay } from "@/lib/social/http";
import crypto from "crypto";

function verifyBearerToken(authHeader: string | null): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || !authHeader) return false;
  const token = authHeader.replace("Bearer ", "");
  const tokenHash = crypto.createHash("sha256").update(token).digest();
  const secretHash = crypto.createHash("sha256").update(secret).digest();
  return crypto.timingSafeEqual(tokenHash, secretHash);
}

/**
 * Vercel Cron calls this every 15 minutes via GET.
 * Finds all SCHEDULED posts that are due and publishes them.
 */
export async function GET(request: NextRequest) {
  if (!verifyBearerToken(request.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
    orderBy: { scheduledAt: "asc" },
  });

  if (duePosts.length === 0) {
    return NextResponse.json({ success: true, message: "No posts due", published: 0, failed: 0 });
  }

  const results: { id: string; platform: string; status: "PUBLISHED" | "FAILED"; error?: string }[] = [];
  const MAX_RETRIES = 2;

  for (const post of duePosts) {
    await prisma.contentPost.update({
      where: { id: post.id },
      data: { status: "PUBLISHING" },
    });

    const credentials = post.credentialId
      ? await prisma.credential.findMany({ where: { id: post.credentialId } })
      : await prisma.credential.findMany({ where: { clientId: post.clientId } });

    let lastError = "";
    let published = false;

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
            actor: "cron",
            action: "content_published",
            details: `Published ${post.platform} post: ${post.title || "(untitled)"}${attempt > 0 ? ` (retry ${attempt})` : ""}`,
          },
        });

        results.push({ id: post.id, platform: post.platform, status: "PUBLISHED" });
        published = true;
        break;
      } catch (err) {
        lastError = sanitizePublishError(err instanceof Error ? err.message : "Unknown publish error");
        if (lastError.includes("credentials") || lastError.includes("Unauthorized") || lastError.includes("401")) {
          break;
        }
      }
    }

    if (!published) {
      await prisma.contentPost.update({
        where: { id: post.id },
        data: { status: "FAILED", publishError: lastError },
      });

      await prisma.activityLog.create({
        data: {
          clientId: post.clientId,
          actor: "cron",
          action: "content_publish_failed",
          details: `Failed to publish ${post.platform} post after ${MAX_RETRIES + 1} attempts: ${lastError}`,
        },
      });

      results.push({ id: post.id, platform: post.platform, status: "FAILED", error: lastError });
    }

    if (duePosts.indexOf(post) < duePosts.length - 1) {
      await humanDelay(2000, 5000);
    }
  }

  const publishedCount = results.filter((r) => r.status === "PUBLISHED").length;
  const failedCount = results.filter((r) => r.status === "FAILED").length;

  return NextResponse.json({ success: true, published: publishedCount, failed: failedCount, results });
}
