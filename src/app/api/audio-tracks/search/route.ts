import { NextRequest, NextResponse } from "next/server";

// Proxy search to Pixabay Music API (free, no attribution required)
// Docs: https://pixabay.com/api/docs/#api_search_music
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const query = searchParams.get("q") || "";
  const genre = searchParams.get("genre") || "";
  const mood = searchParams.get("mood") || "";
  const page = searchParams.get("page") || "1";

  const apiKey = process.env.PIXABAY_API_KEY;

  if (!apiKey) {
    // Return empty results if no API key configured — user can still use uploaded audio
    return NextResponse.json({
      success: true,
      data: [],
      message: "PIXABAY_API_KEY not configured. Add it to .env to enable music search.",
    });
  }

  try {
    const params = new URLSearchParams({
      key: apiKey,
      per_page: "20",
      page,
    });

    if (query) params.set("q", query);
    if (genre) params.set("genre", genre);
    if (mood) params.set("mood", mood);

    const res = await fetch(`https://pixabay.com/api/music/?${params}`, {
      next: { revalidate: 300 }, // Cache 5 min
    });

    if (!res.ok) {
      return NextResponse.json({ success: false, error: "Music search failed" }, { status: 502 });
    }

    const data = await res.json();

    // Normalize response
    const tracks = (data.hits || []).map((hit: Record<string, unknown>) => ({
      id: `pixabay-${hit.id}`,
      title: hit.title || "Untitled",
      artist: (hit.user as string) || "Unknown",
      genre: hit.genre || null,
      mood: hit.mood || null,
      duration: hit.duration || 0,
      url: hit.audio || hit.preview || "",
      previewUrl: hit.preview || "",
      source: "pixabay",
      sourceId: String(hit.id),
      sourceUrl: hit.pageURL || "",
      bpm: hit.bpm || null,
      tags: typeof hit.tags === "string" ? (hit.tags as string).split(",").map((t: string) => t.trim()) : [],
      downloads: hit.downloads || 0,
      likes: hit.likes || 0,
    }));

    return NextResponse.json({
      success: true,
      data: tracks,
      total: data.totalHits || 0,
      page: Number(page),
    });
  } catch {
    return NextResponse.json({ success: false, error: "Music search failed" }, { status: 500 });
  }
}
