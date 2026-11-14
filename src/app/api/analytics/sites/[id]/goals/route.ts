import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { cleanPath } from "@/lib/analytics/ingest";

// POST /api/analytics/sites/[id]/goals — measure a click on an element, or a visit to a page
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 80) : "";
  const kind = body.kind === "page" ? "page" : "click";
  let match = typeof body.match === "string" ? body.match.trim().slice(0, 500) : "";
  if (kind === "page" && match) {
    const wild = match.endsWith("*");
    match = cleanPath(wild ? match.slice(0, -1) : match) + (wild ? "*" : "");
    if (wild) match = match.replace(/\/?\*$/, "/*").replace(/^\/\/\*$/, "/*");
  }
  if (!name || !match) return NextResponse.json({ success: false, error: "A goal needs a name and something to match" }, { status: 400 });
  if (!(await prisma.analyticsSite.findUnique({ where: { id }, select: { id: true } }))) {
    return NextResponse.json({ success: false, error: "Site not found" }, { status: 404 });
  }
  const goal = await prisma.analyticsGoal.create({
    data: { siteId: id, name, kind, match, path: kind === "click" && typeof body.path === "string" ? cleanPath(body.path) : null },
  });
  return NextResponse.json({ success: true, data: goal }, { status: 201 });
}
