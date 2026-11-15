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

// ── Filters: click a row anywhere on the dashboard to narrow everything to it ──
export const FILTER_KEYS = ["page", "source", "channel", "campaign", "country", "browser", "os", "language", "host"] as const;
export type FilterKey = (typeof FILTER_KEYS)[number];
export type Filters = Partial<Record<FilterKey, string>>;

export function parseDimensionFilters(params: URLSearchParams): Filters {
  const out: Filters = {};
  for (const key of FILTER_KEYS) {
    const v = params.get(`f_${key}`);
    if (v) out[key] = v.slice(0, 300);
  }
  return out;
}

// ── Where a visit came from, grouped the way a marketer reads it ──
const SEARCH = /(^|\.)(google|bing|duckduckgo|yahoo|ecosia|brave|startpage|yandex|baidu|qwant|kagi|naver|seznam)\./;
const SOCIAL = /(^|\.)(facebook|instagram|linkedin|lnkd|twitter|x|t|tiktok|youtube|youtu|pinterest|reddit|threads|snapchat|whatsapp|telegram|discord|mastodon|bsky|xing)\.(com|co|in|be|net|social|app|me|org|tv|gg)$/;
const AI = /(^|\.)(chatgpt\.com|openai\.com|perplexity\.ai|claude\.ai|anthropic\.com|gemini\.google\.com|copilot\.microsoft\.com|you\.com|phind\.com|poe\.com|deepseek\.com|meta\.ai|grok\.com|x\.ai|mistral\.ai|kagi\.com\/assistant)$/;

export function channelOf(v: { referrer: string | null; utmSource: string | null; utmMedium: string | null }): string {
  const medium = v.utmMedium || "";
  const source = (v.utmSource || v.referrer || "").toLowerCase();
  if (AI.test(source)) return "AI assistants";
  if (/^(cpc|ppc|paid|paidsocial|paid-social|paid_social|display|ads?|banner|retargeting)$/.test(medium)) return "Paid ads";
  if (/^e-?mail$|newsletter/.test(medium) || /newsletter|mailchimp|resend|klaviyo/.test(source)) return "Email";
  if (!source) return "Direct";
  if (SEARCH.test(source) || /^(google|bing|duckduckgo)$/.test(source)) return "Search";
  if (SOCIAL.test(source) || /^(facebook|instagram|linkedin|tiktok|youtube|twitter|x|reddit|pinterest|threads|ig|fb|meta)$/.test(source) || /social/.test(medium)) return "Social";
  return "Other websites";
}

const sourceOf = (v: { referrer: string | null; utmSource: string | null; utmMedium: string | null }) =>
  v.utmSource ? `${v.utmSource}${v.utmMedium ? ` / ${v.utmMedium}` : ""}` : v.referrer || "Direct";

/** The 75th percentile: the value three in four visitors did at least this well on. */
function p75(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.75) - 1)];
}

// Google's published thresholds: [good up to, poor from]
export const VITAL_LIMITS = { lcp: [2500, 4000], inp: [200, 500], cls: [0.1, 0.25], fcp: [1800, 3000], ttfb: [800, 1800] } as const;
type VitalKey = keyof typeof VITAL_LIMITS;
const VITAL_KEYS = Object.keys(VITAL_LIMITS) as VitalKey[];

function vitalStats(rows: Array<Partial<Record<VitalKey, number | null>>>) {
  const out = {} as Record<VitalKey, { p75: number | null; good: number; samples: number }>;
  for (const key of VITAL_KEYS) {
    const values = rows.map((r) => r[key]).filter((n): n is number => typeof n === "number");
    out[key] = {
      p75: p75(values),
      good: values.length ? values.filter((n) => n <= VITAL_LIMITS[key][0]).length / values.length : 0,
      samples: values.length,
    };
  }
  return out;
}

const VIEW_SELECT = {
  visitorId: true, sessionId: true, path: true, referrer: true, utmSource: true, utmMedium: true,
  utmCampaign: true, country: true, device: true, browser: true, os: true, maxScroll: true,
  foldPx: true, durationMs: true, createdAt: true, hostname: true, language: true, status: true,
  lcp: true, fcp: true, ttfb: true, inp: true, cls: true,
} as const;

type View = {
  visitorId: string; sessionId: string; path: string; referrer: string | null; utmSource: string | null; utmMedium: string | null;
  utmCampaign: string | null; country: string | null; device: string; browser: string | null; os: string | null; maxScroll: number;
  foldPx: number | null; durationMs: number; createdAt: Date; hostname: string | null; language: string | null; status: number | null;
  lcp: number | null; fcp: number | null; ttfb: number | null; inp: number | null; cls: number | null;
};

type Session = { id: string; views: View[]; first: View; ms: number };

function loadViews(siteId: string, from: Date, to: Date | null, device: string): Promise<View[]> {
  return prisma.analyticsPageview.findMany({
    where: { siteId, createdAt: to ? { gte: from, lt: to } : { gte: from }, ...(device !== "all" ? { device } : {}) },
    orderBy: { createdAt: "asc" },
    take: MAX_ROWS,
    select: VIEW_SELECT,
  }) as unknown as Promise<View[]>;
}

/** Group page views into visits and keep the visits that match every active filter. */
function sessionsOf(views: View[], filters: Filters): Session[] {
  const map = new Map<string, Session>();
  for (const v of views) {
    const s = map.get(v.sessionId);
    if (s) {
      s.views.push(v);
      s.ms += v.durationMs;
    } else map.set(v.sessionId, { id: v.sessionId, views: [v], first: v, ms: v.durationMs });
  }
  const f = filters;
  return [...map.values()].filter((s) => {
    const a = s.first;
    if (f.page && !s.views.some((v) => v.path === f.page)) return false;
    if (f.source && sourceOf(a) !== f.source) return false;
    if (f.channel && channelOf(a) !== f.channel) return false;
    if (f.campaign && a.utmCampaign !== f.campaign) return false;
    if (f.country && a.country !== f.country) return false;
    if (f.browser && a.browser !== f.browser) return false;
    if (f.os && a.os !== f.os) return false;
    if (f.language && (a.language || "").split("-")[0].toLowerCase() !== f.language) return false;
    if (f.host && a.hostname !== f.host) return false;
    return true;
  });
}

function totalsOf(sessions: Session[]) {
  const visitors = new Set<string>();
  let pageviews = 0;
  let bounces = 0;
  let ms = 0;
  for (const s of sessions) {
    visitors.add(s.first.visitorId);
    pageviews += s.views.length;
    if (s.views.length === 1) bounces++;
    ms += s.ms;
  }
  const n = sessions.length;
  return {
    visitors: visitors.size,
    sessions: n,
    pageviews,
    bounceRate: n ? bounces / n : 0,
    avgSessionMs: n ? Math.round(ms / n) : 0,
    pagesPerSession: n ? pageviews / n : 0,
  };
}

export async function siteSummary(
  siteId: string,
  opts: { range: string; tz: number; device: string; since: Date },
  filters: Filters = {}
) {
  const now = new Date();
  const span = now.getTime() - opts.since.getTime();
  const before = new Date(opts.since.getTime() - span);
  const scope = { siteId, createdAt: { gte: opts.since }, ...(opts.device !== "all" ? { device: opts.device } : {}) };

  const [views, earlier, clickRows, eventRows, goals, live] = await Promise.all([
    loadViews(siteId, opts.since, null, opts.device),
    loadViews(siteId, before, opts.since, opts.device),
    prisma.analyticsClick.findMany({
      where: scope,
      orderBy: { createdAt: "desc" },
      take: 60_000,
      select: { sessionId: true, path: true, selector: true, label: true },
    }),
    prisma.analyticsEvent.findMany({
      where: scope,
      orderBy: { createdAt: "desc" },
      take: 60_000,
      select: { sessionId: true, path: true, name: true, value: true },
    }),
    prisma.analyticsGoal.findMany({ where: { siteId }, orderBy: { createdAt: "asc" } }),
    prisma.analyticsPageview.findMany({
      where: { siteId, createdAt: { gte: new Date(now.getTime() - 5 * 60_000) } },
      distinct: ["visitorId"],
      select: { visitorId: true },
    }),
  ]);

  const sessions = sessionsOf(views, filters);
  const kept = new Set(sessions.map((s) => s.id));
  const totals = totalsOf(sessions);
  const previous = totalsOf(sessionsOf(earlier, filters));

  // ── Time series, and the week grid of when people visit ──
  const hourly = opts.range === "today";
  const step = hourly ? 3_600_000 : 86_400_000;
  const startLocal = opts.since.getTime() + opts.tz * 60_000;
  const buckets = Math.max(1, Math.ceil((now.getTime() + opts.tz * 60_000 - startLocal) / step));
  const series = Array.from({ length: buckets }, (_, i) => ({
    // The real moment each bucket starts; the browser shows it in the viewer's own time zone
    t: new Date(opts.since.getTime() + i * step).toISOString(),
    views: 0,
    visitors: new Set<string>(),
  }));
  const week = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0)); // [weekday Mon=0][hour]

  const pages = new Map<string, { views: number; visitors: Set<string>; ms: number; scroll: number; entries: number; exits: number; speed: View[] }>();
  const sources = new Map<string, number>();
  const channels = new Map<string, number>();
  const campaigns = new Map<string, number>();
  const countries = new Map<string, number>();
  const devices = new Map<string, number>();
  const browsers = new Map<string, number>();
  const systems = new Map<string, number>();
  const languages = new Map<string, number>();
  const hosts = new Map<string, number>();
  const entries = new Map<string, number>();
  const exits = new Map<string, number>();
  const steps = new Map<string, number>();
  const broken = new Map<string, number>();
  const speedRows: View[] = [];
  let foldSum = 0;
  let foldN = 0;

  for (const s of sessions) {
    const a = s.first;
    tally(sources, sourceOf(a));
    tally(channels, channelOf(a));
    tally(campaigns, a.utmCampaign);
    tally(countries, a.country);
    tally(devices, a.device);
    tally(browsers, a.browser);
    tally(systems, a.os);
    tally(languages, (a.language || "").split("-")[0].toLowerCase());
    tally(hosts, a.hostname);
    const local = new Date(a.createdAt.getTime() + opts.tz * 60_000);
    week[(local.getUTCDay() + 6) % 7][local.getUTCHours()]++;

    s.views.forEach((v, i) => {
      const b = series[Math.floor((v.createdAt.getTime() + opts.tz * 60_000 - startLocal) / step)];
      if (b) {
        b.views++;
        b.visitors.add(v.visitorId);
      }
      const p = pages.get(v.path) || { views: 0, visitors: new Set<string>(), ms: 0, scroll: 0, entries: 0, exits: 0, speed: [] };
      p.views++;
      p.visitors.add(v.visitorId);
      p.ms += v.durationMs;
      p.scroll += v.maxScroll;
      if (i === 0) p.entries++;
      if (i === s.views.length - 1) p.exits++;
      if (v.lcp !== null || v.fcp !== null) {
        p.speed.push(v);
        speedRows.push(v);
      }
      pages.set(v.path, p);
      if (v.foldPx) {
        foldSum += v.foldPx;
        foldN++;
      }
      if (v.status === 404 || v.status === 410) tally(broken, v.path);
      if (i > 0 && v.path !== s.views[i - 1].path) tally(steps, `${s.views[i - 1].path}\u0000${v.path}`);
    });
    tally(entries, a.path);
    tally(exits, s.views[s.views.length - 1].path);
  }

  // ── Clicks ──
  const elements = new Map<string, { path: string; selector: string; label: string | null; count: number; labels: Map<string, number> }>();
  const clickSessions = new Map<string, Set<string>>(); // selector\0path -> sessions, for goals
  for (const c of clickRows) {
    if (!kept.has(c.sessionId)) continue;
    const key = `${c.path}\u0000${c.selector}`;
    const e = elements.get(key) || { path: c.path, selector: c.selector, label: null, count: 0, labels: new Map() };
    e.count++;
    if (c.label) e.labels.set(c.label, (e.labels.get(c.label) || 0) + 1);
    elements.set(key, e);
    const set = clickSessions.get(key) || new Set<string>();
    set.add(c.sessionId);
    clickSessions.set(key, set);
  }

  // ── Events ──
  const events = new Map<string, { count: number; sessions: Set<string>; values: Map<string, number> }>();
  for (const e of eventRows) {
    if (!kept.has(e.sessionId)) continue;
    const row = events.get(e.name) || { count: 0, sessions: new Set<string>(), values: new Map() };
    row.count++;
    row.sessions.add(e.sessionId);
    if (e.value) row.values.set(e.value, (row.values.get(e.value) || 0) + 1);
    events.set(e.name, row);
  }

  // ── Goals: which visits did it, and through which channel they came ──
  const channelSize = new Map<string, number>();
  const channelBySession = new Map<string, string>();
  for (const s of sessions) {
    const c = channelOf(s.first);
    channelBySession.set(s.id, c);
    channelSize.set(c, (channelSize.get(c) || 0) + 1);
  }
  const goalRows = goals.map((g) => {
    const did = new Set<string>();
    if (g.kind === "click") {
      for (const [key, set] of clickSessions) {
        if (g.path ? key === `${g.path}\u0000${g.match}` : key.endsWith(`\u0000${g.match}`)) set.forEach((id) => did.add(id));
      }
    } else if (g.kind === "event") {
      events.get(g.match)?.sessions.forEach((id) => did.add(id));
    } else {
      const prefix = g.match.endsWith("*") ? g.match.slice(0, -1) : null;
      for (const s of sessions) {
        if (s.views.some((v) => (prefix !== null ? v.path.startsWith(prefix) : v.path === g.match))) did.add(s.id);
      }
    }
    const by = new Map<string, number>();
    did.forEach((id) => tally(by, channelBySession.get(id)));
    return {
      id: g.id, name: g.name, kind: g.kind, match: g.match, path: g.path,
      conversions: did.size,
      rate: sessions.length ? did.size / sessions.length : 0,
      byChannel: top([...by].map(([name, count]) => ({ name, count, rate: count / (channelSize.get(name) || 1) })), 8),
    };
  });

  // ── The latest visits, each as the path one person took ──
  const eventsBySession = new Map<string, string[]>();
  for (const e of eventRows) {
    if (!kept.has(e.sessionId)) continue;
    const names = eventsBySession.get(e.sessionId) || [];
    if (!names.includes(e.name)) names.push(e.name);
    eventsBySession.set(e.sessionId, names);
  }
  const visits = sessions
    .slice(-25)
    .reverse()
    .map((s) => ({
      id: s.id.slice(0, 8),
      at: s.first.createdAt.toISOString(),
      source: sourceOf(s.first),
      channel: channelOf(s.first),
      country: s.first.country,
      device: s.first.device,
      browser: s.first.browser,
      ms: s.ms,
      pages: s.views.map((v) => v.path).filter((p, i, all) => i === 0 || p !== all[i - 1]).slice(0, 12),
      did: eventsBySession.get(s.id) || [],
    }));

  const formsStarted = events.get("Form started");
  const formsSent = events.get("Form sent");

  return {
    range: opts.range,
    hourly,
    truncated: views.length >= MAX_ROWS,
    live: live.length,
    filters,
    totals: { ...totals, avgFold: foldN ? Math.round(foldSum / foldN) : null },
    previous,
    series: series.map((b) => ({ t: b.t, views: b.views, visitors: b.visitors.size })),
    week,
    pages: top(
      [...pages].map(([path, p]) => ({
        path,
        count: p.views,
        visitors: p.visitors.size,
        avgMs: Math.round(p.ms / p.views),
        avgScroll: Math.round(p.scroll / p.views),
        entries: p.entries,
        exits: p.exits,
        lcp: p75(p.speed.map((v) => v.lcp).filter((n): n is number => n !== null)),
        inp: p75(p.speed.map((v) => v.inp).filter((n): n is number => n !== null)),
        cls: p75(p.speed.map((v) => v.cls).filter((n): n is number => n !== null)),
      })),
      150
    ),
    sources: list(sources, 15),
    channels: list(channels, 8),
    campaigns: list(campaigns, 15),
    countries: list(countries, 20),
    devices: list(devices, 3),
    browsers: list(browsers, 8),
    systems: list(systems, 8),
    languages: list(languages, 12),
    hosts: list(hosts, 8),
    flow: {
      entries: list(entries, 8),
      exits: list(exits, 8),
      steps: top([...steps].map(([k, count]) => ({ from: k.split("\u0000")[0], to: k.split("\u0000")[1], count })), 15),
    },
    clicks: top(
      [...elements.values()].map((e) => ({
        path: e.path,
        selector: e.selector,
        label: [...e.labels].sort((a, b) => b[1] - a[1])[0]?.[0] || null,
        count: e.count,
      })),
      12
    ),
    events: top(
      [...events].map(([name, e]) => ({
        name,
        count: e.count,
        visits: e.sessions.size,
        values: top([...e.values].map(([value, count]) => ({ name: value, count })), 6),
      })),
      30
    ),
    forms: {
      started: formsStarted?.sessions.size || 0,
      sent: formsSent?.sessions.size || 0,
    },
    broken: list(broken, 10),
    speed: { ...vitalStats(speedRows), samples: speedRows.length },
    goals: goalRows,
    visits,
  };
}

/** One line per tracked website, for the page that shows them all side by side. */
export async function sitesOverview(tz: number) {
  const since = rangeStart("7d", tz);
  const [sites, views] = await Promise.all([
    prisma.analyticsSite.findMany({
      include: { client: { select: { id: true, name: true, company: true } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.analyticsPageview.findMany({
      where: { createdAt: { gte: since } },
      take: MAX_ROWS,
      select: { siteId: true, visitorId: true, sessionId: true, createdAt: true },
    }),
  ]);
  const latest = (await prisma.analyticsPageview.groupBy({ by: ["siteId"], _max: { createdAt: true } })) as unknown as Array<{
    siteId: string;
    _max: { createdAt: Date | null };
  }>;
  const lastSeen = new Map(latest.map((r) => [r.siteId, r._max.createdAt]));
  const startLocal = since.getTime() + tz * 60_000;
  return sites.map((site) => {
    const mine = views.filter((v) => v.siteId === site.id);
    const days = Array.from({ length: 7 }, () => new Set<string>());
    for (const v of mine) days[Math.min(6, Math.floor((v.createdAt.getTime() + tz * 60_000 - startLocal) / 86_400_000))]?.add(v.visitorId);
    return {
      ...site,
      visitors7d: new Set(mine.map((v) => v.visitorId)).size,
      visits7d: new Set(mine.map((v) => v.sessionId)).size,
      views7d: mine.length,
      days: days.map((d) => d.size),
      lastSeen: lastSeen.get(site.id) || null,
    };
  });
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
  const [views, groups, points, around] = await Promise.all([
    prisma.analyticsPageview.findMany({
      where,
      take: MAX_ROWS,
      select: { visitorId: true, maxScroll: true, foldPx: true, durationMs: true, lcp: true, fcp: true, ttfb: true, inp: true, cls: true },
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
    // every page view of the period, to read what came before and after this page in each visit
    withPoints
      ? Promise.resolve([])
      : prisma.analyticsPageview.findMany({
          where: { siteId, createdAt: { gte: opts.since }, ...(opts.device !== "all" ? { device: opts.device } : {}) },
          orderBy: { createdAt: "asc" },
          take: MAX_ROWS,
          select: { sessionId: true, path: true, referrer: true, utmSource: true, utmMedium: true },
        }),
  ]);

  const before = new Map<string, number>();
  const after = new Map<string, number>();
  type Around = { sessionId: string; path: string; referrer: string | null; utmSource: string | null; utmMedium: string | null };
  const bySession = new Map<string, Around[]>();
  for (const v of around as Around[]) {
    const list = bySession.get(v.sessionId);
    if (list) list.push(v);
    else bySession.set(v.sessionId, [v]);
  }
  for (const list of bySession.values()) {
    list.forEach((v, i) => {
      if (v.path !== path) return;
      const prev = list[i - 1];
      const next = list[i + 1];
      if (!prev) tally(before, `Arrived from ${channelOf(v) === "Direct" ? "a typed address or bookmark" : sourceOf(v)}`);
      else if (prev.path !== path) tally(before, prev.path);
      if (!next) tally(after, "Left the site");
      else if (next.path !== path) tally(after, next.path);
    });
  }

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
    speed: vitalStats(views),
    before: list(before, 8),
    after: list(after, 8),
    elements: top([...elements.values()].map((e) => ({ selector: e.selector, label: e.label, href: e.href, count: e.count })), 200),
    points: points.map((p) => [p.selector, +p.ex.toFixed(3), +p.ey.toFixed(3), +p.x.toFixed(4), p.y] as const),
  };
}
