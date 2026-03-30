import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

/**
 * Returns best times to post for a given platform, based on historical
 * engagement data (published posts that succeeded). Falls back to
 * industry-standard recommendations when insufficient data exists.
 */

// Industry-standard best posting times (UTC hours)
const DEFAULT_BEST_TIMES: Record<string, { day: number; hour: number; label: string }[]> = {
  INSTAGRAM: [
    { day: 1, hour: 11, label: "Mon 11:00 AM" },
    { day: 2, hour: 10, label: "Tue 10:00 AM" },
    { day: 3, hour: 11, label: "Wed 11:00 AM" },
    { day: 4, hour: 14, label: "Thu 2:00 PM" },
    { day: 5, hour: 10, label: "Fri 10:00 AM" },
    { day: 6, hour: 9, label: "Sat 9:00 AM" },
  ],
  TWITTER: [
    { day: 1, hour: 8, label: "Mon 8:00 AM" },
    { day: 2, hour: 10, label: "Tue 10:00 AM" },
    { day: 3, hour: 12, label: "Wed 12:00 PM" },
    { day: 4, hour: 9, label: "Thu 9:00 AM" },
    { day: 5, hour: 11, label: "Fri 11:00 AM" },
  ],
  LINKEDIN: [
    { day: 2, hour: 10, label: "Tue 10:00 AM" },
    { day: 3, hour: 12, label: "Wed 12:00 PM" },
    { day: 4, hour: 10, label: "Thu 10:00 AM" },
  ],
  FACEBOOK: [
    { day: 1, hour: 9, label: "Mon 9:00 AM" },
    { day: 3, hour: 11, label: "Wed 11:00 AM" },
    { day: 5, hour: 13, label: "Fri 1:00 PM" },
  ],
  TIKTOK: [
    { day: 2, hour: 10, label: "Tue 10:00 AM" },
    { day: 4, hour: 12, label: "Thu 12:00 PM" },
    { day: 5, hour: 17, label: "Fri 5:00 PM" },
    { day: 6, hour: 11, label: "Sat 11:00 AM" },
  ],
  YOUTUBE: [
    { day: 5, hour: 15, label: "Fri 3:00 PM" },
    { day: 6, hour: 12, label: "Sat 12:00 PM" },
    { day: 0, hour: 14, label: "Sun 2:00 PM" },
  ],
  THREADS: [
    { day: 1, hour: 10, label: "Mon 10:00 AM" },
    { day: 3, hour: 12, label: "Wed 12:00 PM" },
    { day: 4, hour: 11, label: "Thu 11:00 AM" },
    { day: 5, hour: 9, label: "Fri 9:00 AM" },
  ],
};

export async function GET(request: NextRequest) {
  const platform = request.nextUrl.searchParams.get("platform") || "INSTAGRAM";
  const clientId = request.nextUrl.searchParams.get("clientId");

  // Try to derive best times from historical published posts
  const where: Record<string, unknown> = {
    status: "PUBLISHED",
    platform,
    publishedAt: { not: null },
  };
  if (clientId) where.clientId = clientId;

  const publishedPosts = await prisma.contentPost.findMany({
    where,
    select: { publishedAt: true },
    orderBy: { publishedAt: "desc" },
    take: 100,
  });

  if (publishedPosts.length >= 10) {
    // Aggregate by day-of-week and hour
    const hourCounts: Record<string, number> = {};

    for (const post of publishedPosts) {
      if (!post.publishedAt) continue;
      const d = new Date(post.publishedAt);
      const key = `${d.getUTCDay()}-${d.getUTCHours()}`;
      hourCounts[key] = (hourCounts[key] || 0) + 1;
    }

    // Sort by frequency and return top 5
    const sorted = Object.entries(hourCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

    const bestTimes = sorted.map(([key, count]) => {
      const [dayStr, hourStr] = key.split("-");
      const day = parseInt(dayStr);
      const hour = parseInt(hourStr);
      const ampm = hour >= 12 ? "PM" : "AM";
      const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
      return {
        day,
        hour,
        label: `${dayNames[day]} ${displayHour}:00 ${ampm}`,
        count,
        source: "historical" as const,
      };
    });

    return NextResponse.json({ success: true, data: bestTimes, source: "historical" });
  }

  // Fall back to defaults
  const defaults = DEFAULT_BEST_TIMES[platform] || DEFAULT_BEST_TIMES.INSTAGRAM;
  const data = defaults.map((t) => ({ ...t, count: 0, source: "recommended" as const }));

  return NextResponse.json({ success: true, data, source: "recommended" });
}
