import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

/**
 * GET /api/content-posts/analytics?clientId&platform&from&to&tz
 *
 * Stats for posts published in the window, built from each post's latest
 * metrics (refreshed hourly by /api/cron/social-metrics). Daily series buckets
 * by publish day in the viewer's timezone (tz), so a post's lifetime numbers
 * land on the day it went out.
 */

interface Numbers {
  views: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
}

type MetricsJson = Partial<Record<keyof Numbers | "reach", number | null>> | null;

const DAY = 24 * 60 * 60 * 1000;

function emptyNumbers(): Numbers {
  return { views: 0, likes: 0, comments: 0, shares: 0, saves: 0 };
}

function add(target: Numbers, m: MetricsJson) {
  if (!m) return;
  target.views += m.views || 0;
  target.likes += m.likes || 0;
  target.comments += m.comments || 0;
  target.shares += m.shares || 0;
  target.saves += m.saves || 0;
}

function interactions(n: Numbers) {
  return n.likes + n.comments + n.shares + n.saves;
}

function rate(n: Numbers): number | null {
  return n.views > 0 ? interactions(n) / n.views : null;
}

function dayKey(date: Date, tz: string): string {
  // en-CA formats as YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const clientId = searchParams.get("clientId");
  const platform = searchParams.get("platform");
  let tz = searchParams.get("tz") || "UTC";
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: tz });
  } catch {
    tz = "UTC";
  }

  const to = searchParams.get("to") ? new Date(searchParams.get("to")!) : new Date();
  const from = searchParams.get("from") ? new Date(searchParams.get("from")!) : new Date(to.getTime() - 30 * DAY);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) {
    return NextResponse.json({ success: false, error: "Invalid date range" }, { status: 400 });
  }

  const where: Record<string, unknown> = {
    status: "PUBLISHED",
    publishedAt: { gte: from, lte: to },
  };
  if (clientId) where.clientId = clientId;
  if (platform) where.platform = platform;

  // Cast: Prisma's select/include type inference is broken repo-wide
  const posts = (await prisma.contentPost.findMany({
    where,
    select: {
      id: true,
      title: true,
      body: true,
      platform: true,
      publishMode: true,
      mediaUrls: true,
      externalUrl: true,
      publishedAt: true,
      metrics: true,
      metricsUpdatedAt: true,
      client: { select: { id: true, name: true } },
      credential: { select: { label: true, meta: true } },
    },
    orderBy: { publishedAt: "desc" },
    take: 2000,
  })) as unknown as Array<{
    id: string;
    title: string | null;
    body: string | null;
    platform: string;
    publishMode: string;
    mediaUrls: string[];
    externalUrl: string | null;
    publishedAt: Date;
    metrics: MetricsJson;
    metricsUpdatedAt: Date | null;
    client: { id: string; name: string };
    credential: { label: string | null; meta: { avatarUrl?: string; username?: string } | null } | null;
  }>;

  // Thumbnails: match the first media URL to the client's library (videos have a JPEG thumb there)
  const firstUrls = [...new Set(posts.map((p) => p.mediaUrls[0]).filter(Boolean))];
  const media = firstUrls.length
    ? await prisma.clientMedia.findMany({
        where: { url: { in: firstUrls } },
        select: { url: true, thumbnailUrl: true, fileType: true },
      })
    : [];
  const thumbByUrl = new Map(
    media.map((m) => [m.url, m.thumbnailUrl || (m.fileType === "IMAGE" ? m.url : null)])
  );
  const thumbFor = (url: string | undefined) => {
    if (!url) return null;
    if (thumbByUrl.has(url)) return thumbByUrl.get(url) || null;
    return /\.(jpe?g|png|webp|gif)(\?|$)/i.test(url) ? url : null;
  };

  const totals = emptyNumbers();
  const platforms = new Map<string, Numbers & { posts: number; postsWithStats: number }>();
  const daily = new Map<string, Numbers & { posts: number }>();
  let postsWithStats = 0;
  let manualPosts = 0;
  let lastUpdated: Date | null = null;

  // Every day in the window so the series has no gaps
  for (let t = from.getTime(); t <= to.getTime() + DAY / 2; t += DAY) {
    daily.set(dayKey(new Date(t), tz), { ...emptyNumbers(), posts: 0 });
  }

  for (const post of posts) {
    const hasStats = !!post.metrics && post.metricsUpdatedAt !== null;
    if (post.publishMode === "ASSISTED") manualPosts++;
    if (hasStats) postsWithStats++;
    if (post.metricsUpdatedAt && (!lastUpdated || post.metricsUpdatedAt > lastUpdated)) lastUpdated = post.metricsUpdatedAt;

    add(totals, post.metrics);

    const p = platforms.get(post.platform) || { ...emptyNumbers(), posts: 0, postsWithStats: 0 };
    p.posts++;
    if (hasStats) p.postsWithStats++;
    add(p, post.metrics);
    platforms.set(post.platform, p);

    const key = dayKey(post.publishedAt, tz);
    const d = daily.get(key) || { ...emptyNumbers(), posts: 0 };
    d.posts++;
    add(d, post.metrics);
    daily.set(key, d);
  }

  const rows = posts
    .filter((p) => p.metrics)
    .map((p) => {
      const n = emptyNumbers();
      add(n, p.metrics);
      return {
        id: p.id,
        title: p.title || p.body?.slice(0, 80) || "(untitled)",
        platform: p.platform,
        clientId: p.client.id,
        clientName: p.client.name,
        account: p.credential?.label || null,
        avatarUrl: p.credential?.meta?.avatarUrl || null,
        thumbUrl: thumbFor(p.mediaUrls[0]),
        externalUrl: p.externalUrl,
        publishedAt: p.publishedAt.toISOString(),
        metricsUpdatedAt: p.metricsUpdatedAt?.toISOString() || null,
        ...n,
        reach: p.metrics?.reach ?? null,
        interactions: interactions(n),
        engagementRate: rate(n),
      };
    });

  const topPosts = [...rows].sort((a, b) => b.views - a.views || b.interactions - a.interactions).slice(0, 10);

  return NextResponse.json({
    success: true,
    data: {
      range: { from: from.toISOString(), to: to.toISOString(), tz },
      postsPublished: posts.length,
      postsWithStats,
      manualPosts,
      lastUpdated: lastUpdated?.toISOString() || null,
      totals: { ...totals, interactions: interactions(totals), engagementRate: rate(totals) },
      byPlatform: [...platforms.entries()]
        .map(([key, n]) => ({ platform: key, ...n, interactions: interactions(n), engagementRate: rate(n) }))
        .sort((a, b) => b.views - a.views || b.posts - a.posts),
      daily: [...daily.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, n]) => ({ date, ...n, interactions: interactions(n) })),
      topPosts,
      posts: rows.slice(0, 200),
    },
  });
}
