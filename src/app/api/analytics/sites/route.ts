import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import prisma from "@/lib/prisma";
import { normaliseDomain } from "@/lib/analytics/ingest";
import { sitesOverview } from "@/lib/analytics/query";

const include = { client: { select: { id: true, name: true, company: true } } };

// GET /api/analytics/sites?tz=60 — every tracked website with its client and the last seven days
export async function GET(request: NextRequest) {
  const tzRaw = parseInt(request.nextUrl.searchParams.get("tz") || "0", 10);
  const tz = Number.isFinite(tzRaw) ? Math.max(-840, Math.min(840, tzRaw)) : 0;
  return NextResponse.json({ success: true, data: await sitesOverview(tz) });
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
    return NextResponse.json({ success: true, data: { ...site, visitors7d: 0, visits7d: 0, views7d: 0, days: [0, 0, 0, 0, 0, 0, 0], lastSeen: null } }, { status: 201 });
  } catch (err) {
    console.error("Failed to add analytics site:", err);
    return NextResponse.json({ success: false, error: "Could not add the site" }, { status: 500 });
  }
}
