import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET() {
  // Find all posts with broken or non-standard image URLs
  const posts = await prisma.contentPost.findMany({
    where: {
      NOT: { mediaUrls: { equals: [] } },
    },
    select: {
      id: true,
      title: true,
      mediaUrls: true,
      client: { select: { name: true } },
      scheduledAt: true,
    },
    orderBy: { scheduledAt: "desc" },
  });

  const report = posts.map((p) => ({
    id: p.id,
    client: p.client?.name,
    title: p.title?.slice(0, 40),
    scheduledAt: p.scheduledAt,
    mediaUrls: p.mediaUrls,
    issues: p.mediaUrls
      .map((url, i) => {
        if (/\.heic|\.heif/i.test(url)) return `[${i}] still HEIC`;
        if (!url.startsWith("http")) return `[${i}] invalid URL`;
        return null;
      })
      .filter(Boolean),
  }));

  return NextResponse.json({
    totalPosts: posts.length,
    postsWithIssues: report.filter((r) => r.issues.length > 0),
    allPosts: report,
  });
}
