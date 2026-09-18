import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { isValidTimezone, zonedLocalToIso } from "@/components/content/composer/timezone";

const PLATFORM_NAMES: Record<string, string> = {
  INSTAGRAM: "Instagram",
  TIKTOK: "TikTok",
  YOUTUBE: "YouTube",
  FACEBOOK: "Facebook",
  LINKEDIN: "LinkedIn",
  TWITTER: "X",
  THREADS: "Threads",
  REDNOTE: "RedNote",
};
const METRICS = ["views", "reach", "likes", "comments", "shares", "saves"] as const;
type MetricKey = (typeof METRICS)[number];

// GET /api/content-posts/month-summary?clientId=&month=YYYY-MM
// Plain-text summary of what the scheduler published that month, with the
// latest stats we hold per post. Fed into the monthly client report as data.
export async function GET(request: NextRequest) {
  const clientId = request.nextUrl.searchParams.get("clientId") || "";
  const month = request.nextUrl.searchParams.get("month") || "";
  const m = month.match(/^(\d{4})-(\d{2})$/);
  if (!clientId || !m) return NextResponse.json({ success: false, error: "clientId and month (YYYY-MM) are required" }, { status: 400 });

  const client = await prisma.client.findUnique({ where: { id: clientId }, select: { name: true, timezone: true } });
  if (!client) return NextResponse.json({ success: false, error: "Client not found" }, { status: 404 });

  // The month as the client lives it, not as UTC cuts it
  const zone = isValidTimezone(client.timezone) ? client.timezone : "UTC";
  const next = Number(m[2]) === 12 ? `${Number(m[1]) + 1}-01` : `${m[1]}-${String(Number(m[2]) + 1).padStart(2, "0")}`;
  const from = new Date(zonedLocalToIso(`${month}-01T00:00`, zone));
  const to = new Date(zonedLocalToIso(`${next}-01T00:00`, zone));

  const posts = await prisma.contentPost.findMany({
    where: { clientId, status: "PUBLISHED", publishedAt: { gte: from, lt: to } },
    select: { id: true, platform: true, title: true, body: true, publishedAt: true, externalUrl: true, platformSettings: true },
    orderBy: { publishedAt: "asc" },
  });

  const snapshots = posts.length
    ? await prisma.contentPostMetricSnapshot.findMany({
        where: { postId: { in: posts.map((p) => p.id) } },
        orderBy: { fetchedAt: "desc" },
        select: { postId: true, views: true, likes: true, comments: true, shares: true, saves: true, reach: true },
      })
    : [];
  const latest = new Map<string, (typeof snapshots)[number]>();
  for (const s of snapshots) if (!latest.has(s.postId)) latest.set(s.postId, s);

  const lines: string[] = [`===== SOCIAL POSTS PUBLISHED FOR ${client.name.toUpperCase()}, ${month} (from the Blok Blok scheduler) =====`];
  if (posts.length === 0) {
    lines.push("No posts were published through the scheduler this month.");
    return NextResponse.json({ success: true, data: { text: lines.join("\n"), postCount: 0, withStats: 0 } });
  }

  const byPlatform = new Map<string, typeof posts>();
  for (const p of posts) byPlatform.set(p.platform, [...(byPlatform.get(p.platform) || []), p]);

  let withStats = 0;
  for (const [platform, list] of byPlatform) {
    const totals: Partial<Record<MetricKey, number>> = {};
    let counted = 0;
    for (const p of list) {
      const s = latest.get(p.id);
      if (!s) continue;
      counted++;
      for (const k of METRICS) if (s[k] != null) totals[k] = (totals[k] || 0) + (s[k] as number);
    }
    withStats += counted;
    const totalText = METRICS.filter((k) => totals[k] != null).map((k) => `${k} ${totals[k]}`).join(", ");
    lines.push("", `${PLATFORM_NAMES[platform] || platform}: ${list.length} post${list.length === 1 ? "" : "s"} published${totalText ? `. Totals across the ${counted} with stats: ${totalText}` : ". No stats collected yet"}`);

    for (const p of list) {
      const s = latest.get(p.id);
      const type = (p.platformSettings as Record<string, unknown> | null)?.postType;
      const label = (p.title || p.body || "(no caption)").replace(/\s+/g, " ").slice(0, 90);
      const stats = s ? METRICS.filter((k) => s[k] != null).map((k) => `${k} ${s[k]}`).join(", ") : "";
      lines.push(`- ${p.publishedAt!.toISOString().slice(0, 10)}${typeof type === "string" ? ` [${type}]` : ""} "${label}"${stats ? ` | ${stats}` : " | no stats"}${p.externalUrl ? ` | ${p.externalUrl}` : ""}`);
    }
  }

  return NextResponse.json({ success: true, data: { text: lines.join("\n"), postCount: posts.length, withStats } });
}
