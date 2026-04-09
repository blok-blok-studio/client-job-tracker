import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET() {
  const posts = await prisma.contentPost.findMany({
    where: {
      NOT: { mediaUrls: { equals: [] } },
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const report = posts.map((p: any) => ({
    id: p.id,
    clientId: p.clientId,
    title: (p.title || "").slice(0, 40),
    scheduledAt: p.scheduledAt,
    mediaUrls: p.mediaUrls,
    hasHeic: p.mediaUrls.some((url: string) => /\.heic|\.heif/i.test(url)),
  }));

  return NextResponse.json({
    totalPosts: report.length,
    postsWithHeic: report.filter((r: any) => r.hasHeic),
    allPosts: report,
  });
}
