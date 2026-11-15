import { NextRequest, NextResponse } from "next/server";
import { siteByShare } from "@/lib/analytics/share";

// GET /api/stats/[token] — which website a read-only link shows. Public, token-scoped.
export async function GET(_request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const site = await siteByShare((await params).token);
  if (!site) return NextResponse.json({ success: false, error: "This link is no longer active." }, { status: 404 });
  return NextResponse.json({ success: true, data: { id: site.id, name: site.name, domain: site.domain, active: site.active } });
}
