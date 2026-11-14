import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import {
  SESSION_GAP_MS, cleanPath, hostMatches, hostOf, isBot, newId, num, parseUa, siteByKey, str, visitorIds,
} from "@/lib/analytics/ingest";

// POST /api/bb/e — the tracker (public/bb.js) posts page views, page leaves and
// clicks here from client websites. Public, cross-origin, no cookies.
// Body is JSON sent as text/plain so the browser skips the CORS preflight.

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "no-store",
};

const done = () => new NextResponse(null, { status: 204, headers: CORS });

export function OPTIONS() {
  return done();
}

type Ev = Record<string, unknown>;

export async function POST(request: NextRequest) {
  try {
    const text = await request.text();
    if (text.length > 64_000) return done();
    const body = JSON.parse(text) as { k?: unknown; e?: unknown };
    if (typeof body.k !== "string" || !Array.isArray(body.e)) return done();

    const ua = request.headers.get("user-agent") || "";
    if (isBot(ua)) return done();

    const site = await siteByKey(body.k.slice(0, 40));
    if (!site || !site.active) return done();

    // Only accept events sent from the site's own pages
    const from = hostOf(request.headers.get("origin")) || hostOf(request.headers.get("referer"));
    if (!hostMatches(from, site.domain)) return done();

    const ip = request.headers.get("x-real-ip") || request.headers.get("x-vercel-forwarded-for") ||
      request.headers.get("x-forwarded-for")?.split(",")[0].trim() || "";
    const country = str(request.headers.get("x-vercel-ip-country"), 2);
    const { device, browser, os } = parseUa(ua);
    const events = (body.e as Ev[]).slice(0, 60).filter((e) => e && typeof e === "object");

    for (const e of events.filter((x) => x.t === "pv")) {
      const pid = str(e.pid, 40);
      if (!pid) continue;
      const now = new Date();
      const ids = visitorIds(site.id, ip, ua, now);
      const last = await prisma.analyticsPageview.findFirst({
        where: {
          siteId: site.id,
          visitorId: { in: [ids.today, ids.yesterday] },
          createdAt: { gte: new Date(now.getTime() - SESSION_GAP_MS) },
        },
        orderBy: { createdAt: "desc" },
        select: { sessionId: true },
      });
      const refHost = hostOf(str(e.r, 500));
      const gclid = e.g === 1;
      await prisma.analyticsPageview
        .create({
          data: {
            siteId: site.id,
            pid,
            visitorId: ids.today,
            sessionId: last?.sessionId || newId(),
            path: cleanPath(e.p),
            referrer: refHost && !hostMatches(refHost, site.domain) ? refHost : null,
            utmSource: str(e.us, 80)?.toLowerCase() || (gclid ? "google" : null),
            utmMedium: str(e.um, 80)?.toLowerCase() || (gclid ? "cpc" : null),
            utmCampaign: str(e.uc, 120),
            country,
            device,
            browser,
            os,
            viewportW: num(e.w, 0, 10000) !== null ? Math.round(num(e.w, 0, 10000)!) : null,
            foldPx: num(e.h, 0, 10000) !== null ? Math.round(num(e.h, 0, 10000)!) : null,
          },
        })
        .catch(() => {}); // duplicate pid: the same view sent twice
    }

    for (const e of events.filter((x) => x.t === "pl")) {
      const pid = str(e.pid, 40);
      if (!pid) continue;
      await prisma.analyticsPageview.updateMany({
        where: { pid, siteId: site.id },
        data: {
          maxScroll: Math.round(num(e.s, 0, 100) ?? 0),
          durationMs: Math.round(num(e.d, 0, 4 * 60 * 60 * 1000) ?? 0),
        },
      });
    }

    const clicks = events.filter((x) => x.t === "c");
    if (clicks.length) {
      const pids = [...new Set(clicks.map((c) => str(c.pid, 40)).filter(Boolean) as string[])];
      const views = await prisma.analyticsPageview.findMany({
        where: { pid: { in: pids }, siteId: site.id },
        select: { pid: true, sessionId: true, path: true, device: true },
      });
      const byPid = new Map(views.map((v) => [v.pid, v]));
      const rows = [];
      for (const c of clicks) {
        const view = byPid.get(str(c.pid, 40) || "");
        const selector = str(c.sel, 500);
        if (!view || !selector) continue;
        rows.push({
          siteId: site.id,
          pid: view.pid,
          sessionId: view.sessionId,
          path: view.path,
          device: view.device,
          selector,
          label: str(c.l, 80),
          href: str(c.hr, 200)?.split("?")[0] || null,
          x: num(c.x, 0, 1) ?? 0,
          y: Math.round(num(c.y, 0, 200000) ?? 0),
          ex: num(c.ex, 0, 1) ?? 0.5,
          ey: num(c.ey, 0, 1) ?? 0.5,
        });
      }
      if (rows.length) await prisma.analyticsClick.createMany({ data: rows });
    }
  } catch (err) {
    console.error("[analytics] collect failed:", err);
  }
  return done();
}
