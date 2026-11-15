import { NextRequest, NextResponse } from "next/server";
import { siteByShare } from "@/lib/analytics/share";
import { cleanPath } from "@/lib/analytics/ingest";
import { pageDetail, parseFilters } from "@/lib/analytics/query";

// GET /api/stats/[token]/page?path= — one page in detail, read-only. No heatmap link: that stays with the team.
export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const site = await siteByShare((await params).token);
  if (!site) return NextResponse.json({ success: false, error: "This link is no longer active." }, { status: 404 });
  const query = request.nextUrl.searchParams;
  const data = await pageDetail(site.id, cleanPath(query.get("path")), parseFilters(query));
  return NextResponse.json({ success: true, data: { ...data, heatUrl: null } });
}
