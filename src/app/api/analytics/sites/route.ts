import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import prisma from "@/lib/prisma";
import { normaliseDomain } from "@/lib/analytics/ingest";

const include = { client: { select: { id: true, name: true, company: true } } };

// GET /api/analytics/sites — every tracked website, with its client and the last 24h of traffic
export async function GET() {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [sites, recent] = await Promise.all([
    prisma.analyticsSite.findMany({ include, orderBy: { createdAt: "asc" } }),
    // The Accelerate-extended client loses groupBy result inference inside Promise.all
    prisma.analyticsPageview.groupBy({ by: ["siteId"], where: { createdAt: { gte: since } }, _count: { _all: true } }) as unknown as Promise<
      Array<{ siteId: string; _count: { _all: number } }>
    >,
  ]);
  const views = new Map(recent.map((r) => [r.siteId, r._count._all]));
  return NextResponse.json({ success: true, data: sites.map((s) => ({ ...s, views24h: views.get(s.id) || 0 })) });
}

// POST /api/analytics/sites — start tracking a website
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const name = typeof body.name === "string" ? body.name.trim().slice(0, 80) : "";
    const domain = typeof body.domain === "string" ? normaliseDomain(body.domain) : "";
    if (!name || !/^[a-z0-9.-]+$/.test(domain) || !(domain.includes(".") || domain === "localhost")) {
      return NextResponse.json({ success: false, error: "A name and a domain like example.com are needed" }, { status: 400 });
    }
    const clientId = typeof body.clientId === "string" && body.clientId ? body.clientId : null;
    if (clientId && !(await prisma.client.findUnique({ where: { id: clientId }, select: { id: true } }))) {
      return NextResponse.json({ success: false, error: "Client not found" }, { status: 404 });
    }
    const site = await prisma.analyticsSite.create({
      data: { name, domain, clientId, key: randomBytes(6).toString("hex") },
      include,
    });
    return NextResponse.json({ success: true, data: { ...site, views24h: 0 } }, { status: 201 });
  } catch (err) {
    console.error("Failed to add analytics site:", err);
    return NextResponse.json({ success: false, error: "Could not add the site" }, { status: 500 });
  }
}
