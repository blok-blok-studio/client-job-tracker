import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { forgetSite, normaliseDomain } from "@/lib/analytics/ingest";
import { newShareToken } from "@/lib/analytics/share";

type Ctx = { params: Promise<{ id: string }> };

// PATCH /api/analytics/sites/[id] — rename, re-link to a client, change domain, pause
export async function PATCH(request: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const data: Record<string, unknown> = {};
  if (typeof body.name === "string" && body.name.trim()) data.name = body.name.trim().slice(0, 80);
  if (typeof body.domain === "string" && body.domain.trim()) {
    const domain = normaliseDomain(body.domain);
    if (!/^[a-z0-9.-]+$/.test(domain)) return NextResponse.json({ success: false, error: "That domain does not look right" }, { status: 400 });
    data.domain = domain;
  }
  if ("clientId" in body) data.clientId = typeof body.clientId === "string" && body.clientId ? body.clientId : null;
  if (typeof body.active === "boolean") data.active = body.active;
  // A read-only link for the client: switching it on makes a new address, switching it off kills the old one.
  if (typeof body.share === "boolean") data.shareToken = body.share ? newShareToken() : null;
  try {
    const site = await prisma.analyticsSite.update({
      where: { id },
      data,
      include: { client: { select: { id: true, name: true, company: true } } },
    });
    forgetSite(site.key);
    return NextResponse.json({ success: true, data: site });
  } catch {
    return NextResponse.json({ success: false, error: "Site not found" }, { status: 404 });
  }
}

// DELETE /api/analytics/sites/[id] — owner only: removes the site and all of its collected data
export async function DELETE(_request: NextRequest, { params }: Ctx) {
  const session = await getSession();
  if (session?.role !== "OWNER") return NextResponse.json({ success: false, error: "Only the owner can delete a site" }, { status: 403 });
  const { id } = await params;
  try {
    const site = await prisma.analyticsSite.delete({ where: { id } });
    forgetSite(site.key);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ success: false, error: "Site not found" }, { status: 404 });
  }
}
