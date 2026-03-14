import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

// GET — list audio tracks (uploaded + cached from APIs)
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const search = searchParams.get("search");
  const genre = searchParams.get("genre");
  const mood = searchParams.get("mood");
  const source = searchParams.get("source");

  const where: Record<string, unknown> = {};
  if (genre) where.genre = genre;
  if (mood) where.mood = mood;
  if (source) where.source = source;
  if (search) {
    where.OR = [
      { title: { contains: search, mode: "insensitive" } },
      { artist: { contains: search, mode: "insensitive" } },
      { tags: { has: search.toLowerCase() } },
    ];
  }

  const tracks = await prisma.audioTrack.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return NextResponse.json({ success: true, data: tracks });
}

// POST — upload custom audio track
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const track = await prisma.audioTrack.create({
      data: {
        title: body.title,
        artist: body.artist || null,
        genre: body.genre || null,
        mood: body.mood || null,
        duration: body.duration || 0,
        url: body.url,
        source: body.source || "upload",
        sourceId: body.sourceId || null,
        sourceUrl: body.sourceUrl || null,
        bpm: body.bpm || null,
        tags: body.tags || [],
      },
    });

    return NextResponse.json({ success: true, data: track }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to save audio track";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
