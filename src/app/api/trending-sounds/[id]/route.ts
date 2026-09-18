import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { platformFromSoundUrl } from "@/lib/trending-sound";

// PATCH — edit a saved sound, or archive it once the trend has passed
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid request" }, { status: 400 });
  }

  const existing = await prisma.trendingSound.findUnique({ where: { id }, select: { id: true } });
  if (!existing) return NextResponse.json({ success: false, error: "Sound not found" }, { status: 404 });

  const data: Record<string, unknown> = {};
  if (typeof body.name === "string") {
    const name = body.name.trim().slice(0, 200);
    if (!name) return NextResponse.json({ success: false, error: "Give the sound a name." }, { status: 400 });
    data.name = name;
  }
  if (typeof body.url === "string") {
    const url = body.url.trim().slice(0, 1000);
    const platform = platformFromSoundUrl(url);
    if (!platform) {
      return NextResponse.json({ success: false, error: "Paste the sound's link from Instagram or TikTok." }, { status: 400 });
    }
    data.url = url;
    data.platform = platform;
  }
  if (typeof body.artist === "string") data.artist = body.artist.trim().slice(0, 200) || null;
  if (typeof body.note === "string") data.note = body.note.trim().slice(0, 2000) || null;
  if (typeof body.archived === "boolean") data.archived = body.archived;
  if (body.clientId === null || body.clientId === "") data.clientId = null;
  else if (typeof body.clientId === "string") {
    const client = await prisma.client.findUnique({ where: { id: body.clientId }, select: { id: true } });
    if (!client) return NextResponse.json({ success: false, error: "Client not found" }, { status: 404 });
    data.clientId = body.clientId;
  }

  const sound = await prisma.trendingSound.update({
    where: { id },
    data,
    include: { client: { select: { id: true, name: true } } },
  });
  return NextResponse.json({ success: true, data: sound });
}

// DELETE — posts keep their own copy of the name and link, so nothing breaks
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const existing = await prisma.trendingSound.findUnique({ where: { id }, select: { id: true } });
  if (!existing) return NextResponse.json({ success: false, error: "Sound not found" }, { status: 404 });
  await prisma.trendingSound.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
