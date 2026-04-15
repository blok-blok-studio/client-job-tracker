import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { publishPost, sanitizePublishError } from "@/lib/social/publisher";
import { humanDelay } from "@/lib/social/http";

export const maxDuration = 3000;

// POST: Auto-publish due posts (called by content calendar polling)
// Session-authenticated via middleware — no extra auth needed
export async function POST() {
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
    take: 10, // Process up to 10 at a time to stay within function timeout
  });

  if (duePosts.length === 0) {
    return NextResponse.json({ success: true, published: 0, failed: 0 });
  }

  const results: { id: string; platform: string; status: string; error?: string }[] = [];
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
            actor: "auto-publish",
            action: "content_published",
            details: `Published ${post.platform} post: ${post.title || "(untitled)"}`,
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
          actor: "auto-publish",
          action: "content_publish_failed",
          details: `Failed to publish ${post.platform} post: ${lastError}`,
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
