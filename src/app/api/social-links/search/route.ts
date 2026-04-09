import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

// GET /api/social-links/search?q=keyword&platform=INSTAGRAM
export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q") || "";
  const platform = request.nextUrl.searchParams.get("platform") || "";

  const where: Record<string, unknown> = {};
  if (platform) where.platform = platform.toUpperCase();
  if (q) {
    where.OR = [
      { handle: { contains: q, mode: "insensitive" } },
      { client: { name: { contains: q, mode: "insensitive" } } },
    ];
  }

  const links = await prisma.socialLink.findMany({
    where,
    include: { client: { select: { id: true, name: true, avatarUrl: true } } },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  return NextResponse.json(
    links.map((l) => ({
      id: l.id,
      platform: l.platform,
      handle: l.handle,
      url: l.url,
      clientId: l.client.id,
      clientName: l.client.name,
      clientAvatar: l.client.avatarUrl,
    }))
  );
}
