import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { cleanPath, createHeatToken } from "@/lib/analytics/ingest";
import { pageDetail, parseFilters } from "@/lib/analytics/query";

// GET /api/analytics/sites/[id]/page?path=/pricing&range=7d&device=all
// One page in detail, plus a link that opens the heatmap on the live site.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const site = await prisma.analyticsSite.findUnique({ where: { id }, select: { id: true, domain: true } });
  if (!site) return NextResponse.json({ success: false, error: "Site not found" }, { status: 404 });
  const filters = parseFilters(request.nextUrl.searchParams);
  const path = cleanPath(request.nextUrl.searchParams.get("path"));
  const data = await pageDetail(site.id, path, filters);
  const scheme = site.domain === "localhost" || site.domain.startsWith("localhost:") ? "http" : "https";
  const host = request.nextUrl.searchParams.get("host") || site.domain;
  const heatUrl = `${scheme}://${host}${path}#bb-heat=${createHeatToken(site.id)}&bb-range=${filters.range}`;
  return NextResponse.json({ success: true, data: { ...data, heatUrl } });
}
