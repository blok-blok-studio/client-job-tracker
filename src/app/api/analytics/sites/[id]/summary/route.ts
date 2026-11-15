import { NextRequest, NextResponse } from "next/server";
import { parseDimensionFilters, parseFilters, siteSummary } from "@/lib/analytics/query";

// GET /api/analytics/sites/[id]/summary?range=7d&device=all&tz=60&f_country=DE&f_channel=Search…
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const params = request.nextUrl.searchParams;
    const data = await siteSummary(id, parseFilters(params), parseDimensionFilters(params));
    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error("Analytics summary failed:", err);
    return NextResponse.json({ success: false, error: "Could not load analytics" }, { status: 500 });
  }
}
