import prisma from "@/lib/prisma";

export const RANGES: Record<string, { label: string; days: number }> = {
  today: { label: "Today", days: 1 },
  "7d": { label: "7 days", days: 7 },
  "30d": { label: "30 days", days: 30 },
  "90d": { label: "90 days", days: 90 },
  "12mo": { label: "12 months", days: 365 },
};

export const DEVICES = ["all", "desktop", "tablet", "mobile"] as const;

/** Start of the range in the viewer's local time. `tz` is minutes east of UTC. */
export function rangeStart(range: string, tz: number): Date {
  const days = (RANGES[range] || RANGES["7d"]).days;
  const localNow = Date.now() + tz * 60_000;
  const localMidnight = Math.floor(localNow / 86_400_000) * 86_400_000;
  return new Date(localMidnight - (days - 1) * 86_400_000 - tz * 60_000);
}

export function parseFilters(params: URLSearchParams) {
  const range = RANGES[params.get("range") || ""] ? (params.get("range") as string) : "7d";
  const tzRaw = parseInt(params.get("tz") || "0", 10);
  const tz = Number.isFinite(tzRaw) ? Math.max(-840, Math.min(840, tzRaw)) : 0;
  const d = params.get("device") || "all";
  const device = (DEVICES as readonly string[]).includes(d) ? d : "all";
  return { range, tz, device, since: rangeStart(range, tz) };
}

const top = <T extends { count: number }>(rows: T[], n: number) => rows.sort((a, b) => b.count - a.count).slice(0, n);

function tally(map: Map<string, number>, key: string | null | undefined) {
  if (!key) return;
  map.set(key, (map.get(key) || 0) + 1);
}

const list = (map: Map<string, number>, n: number) => top([...map].map(([name, count]) => ({ name, count })), n);

const MAX_ROWS = 150_000;

export async function siteSummary(siteId: string, opts: { range: string; tz: number; device: string; since: Date }) {
  const where = {
    siteId,
    createdAt: { gte: opts.since },
    ...(opts.device !== "all" ? { device: opts.device } : {}),
  };

  const [views, clickGroups, goals] = await Promise.all([
    prisma.analyticsPageview.findMany({
      where,
      orderBy: { createdAt: "asc" },
      take: MAX_ROWS,
      select: {
        visitorId: true, sessionId: true, path: true, referrer: true, utmSource: true, utmMedium: true,
        utmCampaign: true, country: true, device: true, browser: true, os: true, maxScroll: true,
        foldPx: true, durationMs: true, createdAt: true,
      },
    }),
    prisma.analyticsClick.groupBy({
      by: ["path", "selector", "label"],
      where,
      _count: { _all: true },
      orderBy: { _count: { selector: "desc" } },
      take: 400,
      // The Accelerate-extended client loses groupBy result inference inside Promise.all
    }) as unknown as Promise<Array<{ path: string; selector: string; label: string | null; _count: { _all: number } }>>,
    prisma.analyticsGoal.findMany({ where: { siteId }, orderBy: { createdAt: "asc" } }),
  ]);

  // ── Time series ──
  const hourly = opts.range === "today";
  const step = hourly ? 3_600_000 : 86_400_000;
  const startLocal = opts.since.getTime() + opts.tz * 60_000;
  const buckets = Math.max(1, Math.ceil((Date.now() + opts.tz * 60_000 - startLocal) / step));
  const series = Array.from({ length: buckets }, (_, i) => ({
    t: new Date(startLocal + i * step).toISOString(),
    views: 0,
    visitors: new Set<string>(),
  }));

  // ── One pass over the page views ──
  const visitors = new Set<string>();
  const sessions = new Map<string, { paths: string[]; ms: number; first: (typeof views)[number] }>();
  const pages = new Map<string, { views: number; visitors: Set<string>; ms: number; scroll: number; entries: number; exits: number }>();
  const countries = new Map<string, number>();
  const devices = new Map<string, number>();
  const browsers = new Map<string, number>();
  const systems = new Map<string, number>();
  let foldSum = 0;
  let foldN = 0;

  for (const v of views) {
    visitors.add(v.visitorId);
    const b = series[Math.floor((v.createdAt.getTime() + opts.tz * 60_000 - startLocal) / step)];
    if (b) {
      b.views++;
      b.visitors.add(v.visitorId);
    }
    const s = sessions.get(v.sessionId);
    if (s) {
      s.paths.push(v.path);
      s.ms += v.durationMs;
    } else {
      sessions.set(v.sessionId, { paths: [v.path], ms: v.durationMs, first: v });
    }
    const p = pages.get(v.path) || { views: 0, visitors: new Set<string>(), ms: 0, scroll: 0, entries: 0, exits: 0 };
    p.views++;
    p.visitors.add(v.visitorId);
    p.ms += v.durationMs;
    p.scroll += v.maxScroll;
    pages.set(v.path, p);
    if (v.foldPx) {
      foldSum += v.foldPx;
      foldN++;
    }
  }

  // ── Sessions: sources, flow, bounce ──
  const sources = new Map<string, number>();
  const campaigns = new Map<string, number>();
  const entries = new Map<string, number>();
  const exits = new Map<string, number>();
  const steps = new Map<string, number>();
  let bounces = 0;
  let sessionMs = 0;
  for (const s of sessions.values()) {
    const f = s.first;
    tally(sources, f.utmSource ? `${f.utmSource}${f.utmMedium ? ` / ${f.utmMedium}` : ""}` : f.referrer || "Direct");
    tally(campaigns, f.utmCampaign);
    tally(countries, f.country);
    tally(devices, f.device);
    tally(browsers, f.browser);
    tally(systems, f.os);
    const first = s.paths[0];
    const last = s.paths[s.paths.length - 1];
    tally(entries, first);
    tally(exits, last);
    pages.get(first)!.entries++;
    pages.get(last)!.exits++;
    if (s.paths.length === 1) bounces++;
    sessionMs += s.ms;
    for (let i = 1; i < s.paths.length; i++) {
      if (s.paths[i] !== s.paths[i - 1]) tally(steps, `${s.paths[i - 1]}\u0000${s.paths[i]}`);
    }
  }

  // ── Clicks ──
  const elements = new Map<string, { path: string; selector: string; label: string | null; count: number; best: number }>();
  for (const g of clickGroups) {
    const key = `${g.path}\u0000${g.selector}`;
    const n = g._count._all;
    const e = elements.get(key) || { path: g.path, selector: g.selector, label: null, count: 0, best: 0 };
    e.count += n;
    if (g.label && n > e.best) {
      e.label = g.label;
      e.best = n;
    }
    elements.set(key, e);
  }

  // ── Goals ──
  const goalRows = await Promise.all(
    goals.map(async (g) => {
      let converted = 0;
      if (g.kind === "click") {
        const rows = await prisma.analyticsClick.findMany({
          where: { ...where, selector: g.match, ...(g.path ? { path: g.path } : {}) },
          distinct: ["sessionId"],
          select: { sessionId: true },
        });
        converted = rows.length;
      } else {
        const prefix = g.match.endsWith("*") ? g.match.slice(0, -1) : null;
        for (const s of sessions.values()) {
          if (s.paths.some((p) => (prefix !== null ? p.startsWith(prefix) : p === g.match))) converted++;
        }
      }
      return {
        id: g.id, name: g.name, kind: g.kind, match: g.match, path: g.path,
        conversions: converted,
        rate: sessions.size ? converted / sessions.size : 0,
      };
    })
  );

  return {
    range: opts.range,
    hourly,
    truncated: views.length >= MAX_ROWS,
    totals: {
      visitors: visitors.size,
      sessions: sessions.size,
      pageviews: views.length,
      bounceRate: sessions.size ? bounces / sessions.size : 0,
      avgSessionMs: sessions.size ? Math.round(sessionMs / sessions.size) : 0,
      pagesPerSession: sessions.size ? views.length / sessions.size : 0,
      avgFold: foldN ? Math.round(foldSum / foldN) : null,
    },
    series: series.map((b) => ({ t: b.t, views: b.views, visitors: b.visitors.size })),
    pages: top(
      [...pages].map(([path, p]) => ({
        path,
        count: p.views,
        visitors: p.visitors.size,
        avgMs: Math.round(p.ms / p.views),
        avgScroll: Math.round(p.scroll / p.views),
        entries: p.entries,
        exits: p.exits,
      })),
      50
    ),
    sources: list(sources, 12),
    campaigns: list(campaigns, 12),
    countries: list(countries, 12),
    devices: list(devices, 3),
    browsers: list(browsers, 6),
    systems: list(systems, 6),
    flow: {
      entries: list(entries, 8),
      exits: list(exits, 8),
      steps: top([...steps].map(([k, count]) => ({ from: k.split("\u0000")[0], to: k.split("\u0000")[1], count })), 15),
    },
    clicks: top([...elements.values()].map((e) => ({ path: e.path, selector: e.selector, label: e.label, count: e.count })), 12),
    goals: goalRows,
  };
}

/** Everything about one page: clicks per element, click positions, how far people scroll. */
export async function pageDetail(
  siteId: string,
  path: string,
  opts: { since: Date; device: string },
  withPoints = false
) {
  const where = {
    siteId,
    path,
    createdAt: { gte: opts.since },
    ...(opts.device !== "all" ? { device: opts.device } : {}),
  };
  const [views, groups, points] = await Promise.all([
    prisma.analyticsPageview.findMany({
      where,
      take: MAX_ROWS,
      select: { visitorId: true, maxScroll: true, foldPx: true, durationMs: true },
    }),
    prisma.analyticsClick.groupBy({ by: ["selector", "label", "href"], where, _count: { _all: true } }) as unknown as Promise<
      Array<{ selector: string; label: string | null; href: string | null; _count: { _all: number } }>
    >,
    withPoints
      ? prisma.analyticsClick.findMany({
          where,
          orderBy: { createdAt: "desc" },
          take: 6000,
          select: { selector: true, x: true, y: true, ex: true, ey: true },
        })
      : Promise.resolve([]),
  ]);

  const elements = new Map<string, { selector: string; label: string | null; href: string | null; count: number; best: number }>();
  let clicks = 0;
  for (const g of groups) {
    const n = g._count._all;
    clicks += n;
    const e = elements.get(g.selector) || { selector: g.selector, label: null, href: null, count: 0, best: 0 };
    e.count += n;
    if (n > e.best && (g.label || g.href)) {
      e.label = g.label || e.label;
      e.href = g.href || e.href;
      e.best = n;
    }
    elements.set(g.selector, e);
  }

  // reach[i] = share of views that got at least (i+1)*10 percent down the page
  const reach = Array.from({ length: 10 }, () => 0);
  let fold = 0;
  let foldN = 0;
  let ms = 0;
  for (const v of views) {
    for (let i = 0; i < 10; i++) if (v.maxScroll >= (i + 1) * 10) reach[i]++;
    if (v.foldPx) {
      fold += v.foldPx;
      foldN++;
    }
    ms += v.durationMs;
  }

  return {
    path,
    views: views.length,
    visitors: new Set(views.map((v) => v.visitorId)).size,
    clicks,
    avgMs: views.length ? Math.round(ms / views.length) : 0,
    avgFold: foldN ? Math.round(fold / foldN) : null,
    reach: reach.map((n) => (views.length ? Math.round((n / views.length) * 100) : 0)),
    elements: top([...elements.values()].map((e) => ({ selector: e.selector, label: e.label, href: e.href, count: e.count })), 200),
    points: points.map((p) => [p.selector, +p.ex.toFixed(3), +p.ey.toFixed(3), +p.x.toFixed(4), p.y] as const),
  };
}
