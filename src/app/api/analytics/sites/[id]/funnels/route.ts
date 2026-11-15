import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { cleanPath } from "@/lib/analytics/ingest";

// POST /api/analytics/sites/[id]/funnels — a named sequence of steps: pages visited and events done, in order
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 80) : "";
  const steps = (Array.isArray(body.steps) ? body.steps : [])
    .slice(0, 8)
    .map((s: { kind?: unknown; match?: unknown }) => {
      const raw = typeof s?.match === "string" ? s.match.trim().slice(0, 300) : "";
      if (!raw) return null;
      if (s.kind === "event") return { kind: "event", match: raw.slice(0, 60) };
      const wild = raw.endsWith("*");
      const path = cleanPath(wild ? raw.slice(0, -1) : raw);
      return { kind: "page", match: wild ? `${path === "/" ? "" : path}/*` : path };
    })
    .filter(Boolean);
  if (!name || steps.length < 2) {
    return NextResponse.json({ success: false, error: "A funnel needs a name and at least two steps" }, { status: 400 });
  }
  if (!(await prisma.analyticsSite.findUnique({ where: { id }, select: { id: true } }))) {
    return NextResponse.json({ success: false, error: "Site not found" }, { status: 404 });
  }
  const funnel = await prisma.analyticsFunnel.create({ data: { siteId: id, name, steps } });
  return NextResponse.json({ success: true, data: funnel }, { status: 201 });
}
