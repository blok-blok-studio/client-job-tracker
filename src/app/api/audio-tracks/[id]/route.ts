import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

// PATCH — rename an uploaded track
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid request" }, { status: 400 });
  }

  const existing = await prisma.audioTrack.findUnique({ where: { id }, select: { id: true } });
  if (!existing) return NextResponse.json({ success: false, error: "Track not found" }, { status: 404 });

  const data: Record<string, unknown> = {};
  if (typeof body.title === "string") {
    const title = body.title.trim().slice(0, 200);
    if (!title) return NextResponse.json({ success: false, error: "Give the track a name." }, { status: 400 });
    data.title = title;
  }
  if (typeof body.artist === "string") data.artist = body.artist.trim().slice(0, 200) || null;

  const track = await prisma.audioTrack.update({ where: { id }, data });
  return NextResponse.json({ success: true, data: track });
}

// DELETE — removes the track from the list. The file itself stays in storage,
// and videos already made with it have the audio baked in.
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const existing = await prisma.audioTrack.findUnique({ where: { id }, select: { id: true } });
  if (!existing) return NextResponse.json({ success: false, error: "Track not found" }, { status: 404 });
  await prisma.audioTrack.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
