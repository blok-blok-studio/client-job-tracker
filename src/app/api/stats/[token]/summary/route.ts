import { NextRequest, NextResponse } from "next/server";
import { siteByShare } from "@/lib/analytics/share";
import { parseDimensionFilters, parseFilters, siteSummary } from "@/lib/analytics/query";

// GET /api/stats/[token]/summary — the same numbers as the team's tab, read-only. Public, token-scoped.
export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const site = await siteByShare((await params).token);
  if (!site) return NextResponse.json({ success: false, error: "This link is no longer active." }, { status: 404 });
  const query = request.nextUrl.searchParams;
  const data = await siteSummary(site.id, parseFilters(query), parseDimensionFilters(query));
  return NextResponse.json({ success: true, data });
}
