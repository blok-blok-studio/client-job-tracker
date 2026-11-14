import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { cleanPath, verifyHeatToken } from "@/lib/analytics/ingest";
import { pageDetail, parseFilters } from "@/lib/analytics/query";

// GET /api/bb/heat?token=&path=&range=&device= — numbers for the heatmap the
// team opens on top of the live site (public/bb-heat.js). The token comes from
// the Analytics tab, names one site and expires after four hours.

const CORS = { "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store" };

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const siteId = verifyHeatToken(params.get("token") || "");
  if (!siteId) return NextResponse.json({ error: "This heatmap link has expired. Open it again from the Analytics tab." }, { status: 401, headers: CORS });
  const site = await prisma.analyticsSite.findUnique({ where: { id: siteId }, select: { name: true } });
  if (!site) return NextResponse.json({ error: "Site not found" }, { status: 404, headers: CORS });
  const filters = parseFilters(params);
  const data = await pageDetail(siteId, cleanPath(params.get("path")), filters, true);
  return NextResponse.json({ site: site.name, range: filters.range, device: filters.device, ...data }, { headers: CORS });
}
