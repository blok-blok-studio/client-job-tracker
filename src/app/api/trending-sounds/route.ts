import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { platformFromSoundUrl } from "@/lib/trending-sound";

// GET /api/trending-sounds — saved sounds, newest first.
// ?platform=INSTAGRAM|TIKTOK, ?includeArchived=1
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const platform = searchParams.get("platform");
  const includeArchived = searchParams.get("includeArchived") === "1";

  const where: Record<string, unknown> = {};
  if (platform) where.platform = platform;
  if (!includeArchived) where.archived = false;

  const sounds = await prisma.trendingSound.findMany({
    where,
    include: { client: { select: { id: true, name: true } } },
    orderBy: [{ archived: "asc" }, { createdAt: "desc" }],
    take: 200,
  });

  return NextResponse.json({ success: true, data: sounds });
}

// POST — save a sound. The platform comes from the link itself.
export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid request" }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim().slice(0, 200) : "";
  const url = typeof body.url === "string" ? body.url.trim().slice(0, 1000) : "";
  if (!name) return NextResponse.json({ success: false, error: "Give the sound a name." }, { status: 400 });
  const platform = platformFromSoundUrl(url);
  if (!platform) {
    return NextResponse.json({ success: false, error: "Paste the sound's link from Instagram or TikTok (Share, then Copy link)." }, { status: 400 });
  }

  const clientId = typeof body.clientId === "string" && body.clientId ? body.clientId : null;
  if (clientId) {
    const client = await prisma.client.findUnique({ where: { id: clientId }, select: { id: true } });
    if (!client) return NextResponse.json({ success: false, error: "Client not found" }, { status: 404 });
  }

  const session = await getSession();
  const sound = await prisma.trendingSound.create({
    data: {
      name,
      artist: typeof body.artist === "string" ? body.artist.trim().slice(0, 200) || null : null,
      platform,
      url,
      note: typeof body.note === "string" ? body.note.trim().slice(0, 2000) || null : null,
      clientId,
      addedBy: session?.name || null,
    },
    include: { client: { select: { id: true, name: true } } },
  });

  return NextResponse.json({ success: true, data: sound }, { status: 201 });
}
