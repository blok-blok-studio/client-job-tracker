import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

type SocialLinkResult = {
  id: string;
  platform: string;
  handle: string | null;
  url: string;
  client: { id: string; name: string; avatarUrl: string | null };
};

// GET /api/social-links/search?q=keyword&platform=INSTAGRAM
export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q") || "";
  const platform = request.nextUrl.searchParams.get("platform") || "";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {};
  if (platform) where.platform = platform.toUpperCase();
  if (q) {
    where.OR = [
      { handle: { contains: q, mode: "insensitive" } },
      { client: { name: { contains: q, mode: "insensitive" } } },
    ];
  }

  const links = await prisma.socialLink.findMany({
    where,
    select: {
      id: true,
      platform: true,
      handle: true,
      url: true,
      client: { select: { id: true, name: true, avatarUrl: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 20,
  }) as unknown as SocialLinkResult[];

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
