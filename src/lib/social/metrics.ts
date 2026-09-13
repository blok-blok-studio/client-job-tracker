/**
 * Pulls post stats back from the platforms and stores a snapshot per fetch.
 *
 * Cadence by post age: hourly for the first 2 days, every 6 hours to day 14,
 * then daily until day 90, after which a post's numbers are left as they are.
 */

import type { ContentPost } from "@prisma/client";
import prisma from "@/lib/prisma";
import { fetchMetricsForPosts, getAdapter, resolveCredentialForPost } from "@/lib/social/publisher";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

function isDue(post: Pick<ContentPost, "publishedAt" | "metricsUpdatedAt">, now: number): boolean {
  if (!post.publishedAt) return false;
  const age = now - post.publishedAt.getTime();
  if (age > 90 * DAY) return false;
  if (!post.metricsUpdatedAt) return true;
  const since = now - post.metricsUpdatedAt.getTime();
  if (age < 2 * DAY) return since >= HOUR - 5 * 60 * 1000;
  if (age < 14 * DAY) return since >= 6 * HOUR - 5 * 60 * 1000;
  return since >= DAY - 5 * 60 * 1000;
}

export async function refreshPostMetrics(opts: { budgetMs?: number } = {}): Promise<{ updated: number; groups: number; errors: string[] }> {
  const { budgetMs = 240_000 } = opts;
  const startedAt = Date.now();
  const now = Date.now();

  const candidates = await prisma.contentPost.findMany({
    where: {
      status: "PUBLISHED",
      externalId: { not: null },
      publishedAt: { gte: new Date(now - 90 * DAY) },
      platform: { in: ["INSTAGRAM", "TIKTOK", "YOUTUBE"] },
    },
    select: {
      id: true,
      clientId: true,
      credentialId: true,
      platform: true,
      externalId: true,
      platformSettings: true,
      publishedAt: true,
      metricsUpdatedAt: true,
    },
    orderBy: { publishedAt: "desc" },
    take: 1000,
  });

  const due = candidates.filter((p) => isDue(p, now) && getAdapter(p.platform)?.fetchMetrics);

  // One API conversation per connected account
  const groups = new Map<string, typeof due>();
  for (const post of due) {
    const key = `${post.platform}:${post.credentialId || post.clientId}`;
    groups.set(key, [...(groups.get(key) || []), post]);
  }

  let updated = 0;
  const errors: string[] = [];

  for (const [key, posts] of groups) {
    if (Date.now() - startedAt > budgetMs) break;
    try {
      const credential = await resolveCredentialForPost(posts[0]);
      const results = await fetchMetricsForPosts(posts[0].platform, credential, posts);

      for (const post of posts) {
        const m = post.externalId ? results[post.externalId] : undefined;
        if (!m) {
          await prisma.contentPost.update({ where: { id: post.id }, data: { metricsUpdatedAt: new Date() } });
          continue;
        }
        const numbers = {
          views: m.views ?? null,
          likes: m.likes ?? null,
          comments: m.comments ?? null,
          shares: m.shares ?? null,
          saves: m.saves ?? null,
          reach: m.reach ?? null,
        };
        await prisma.$transaction([
          prisma.contentPostMetricSnapshot.create({
            data: { postId: post.id, ...numbers, raw: (m.raw as object) ?? undefined },
          }),
          prisma.contentPost.update({
            where: { id: post.id },
            data: { metrics: numbers, metricsUpdatedAt: new Date() },
          }),
        ]);
        updated++;
      }
    } catch (err) {
      errors.push(`${key}: ${(err as Error).message.slice(0, 200)}`);
      // Back off this group for a cycle rather than retrying every run
      await prisma.contentPost.updateMany({
        where: { id: { in: posts.map((p) => p.id) } },
        data: { metricsUpdatedAt: new Date() },
      });
    }
  }

  return { updated, groups: groups.size, errors };
}
