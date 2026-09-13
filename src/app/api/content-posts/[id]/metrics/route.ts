import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

/** GET /api/content-posts/[id]/metrics — the post's stats history, oldest first. */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const post = await prisma.contentPost.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      body: true,
      platform: true,
      externalUrl: true,
      publishedAt: true,
      metrics: true,
      metricsUpdatedAt: true,
    },
  });
  if (!post) {
    return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  }

  const snapshots = await prisma.contentPostMetricSnapshot.findMany({
    where: { postId: id },
    select: { fetchedAt: true, views: true, likes: true, comments: true, shares: true, saves: true, reach: true },
    orderBy: { fetchedAt: "desc" },
    take: 500,
  });

  return NextResponse.json({ success: true, data: { post, snapshots: snapshots.reverse() } });
}
