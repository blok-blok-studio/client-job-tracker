"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Plus, Settings, Users, Eye, Activity, LogOut, Timer, MousePointerClick, Flame, Copy, Target, Trash2, ArrowRight,
  ExternalLink, Filter, X, Download, Gauge, Globe, ArrowUpRight, ArrowDownRight, Link2,
} from "lucide-react";
import TopBar from "@/components/layout/TopBar";
import Modal from "@/components/shared/Modal";
import { useToast } from "@/components/shared/Toast";
import { TrendChart, compact } from "@/components/content/analytics/charts";
import { cn } from "@/lib/utils";

interface Site {
  id: string;
  key: string;
  name: string;
  domain: string;
  active: boolean;
  clientId: string | null;
  client: { id: string; name: string; company: string | null } | null;
  visitors7d: number;
  visits7d: number;
  views7d: number;
  days: number[];
  lastSeen: string | null;
  shareToken?: string | null;
}
interface Named { name: string; count: number }
interface PageRow { path: string; count: number; visitors: number; avgMs: number; avgScroll: number; entries: number; exits: number; lcp: number | null; inp: number | null; cls: number | null }
interface Goal { id: string; name: string; kind: string; match: string; path: string | null; conversions: number; rate: number; byChannel: { name: string; count: number; rate: number }[] }
interface Visit { id: string; at: string; source: string; channel: string; country: string | null; device: string; browser: string | null; ms: number; pages: string[]; did: string[] }
interface Totals { visitors: number; sessions: number; pageviews: number; bounceRate: number; avgSessionMs: number; pagesPerSession: number }
type VitalKey = "lcp" | "inp" | "cls" | "fcp" | "ttfb";
type Vitals = Record<VitalKey, { p75: number | null; good: number; samples: number }>;
interface Summary {
  hourly: boolean;
  truncated: boolean;
  live: number;
  totals: Totals & { avgFold: number | null };
  previous: Totals;
  series: { t: string; views: number; visitors: number }[];
  week: number[][];
  pages: PageRow[];
  sources: Named[];
  channels: Named[];
  campaigns: Named[];
  countries: Named[];
  devices: Named[];
  browsers: Named[];
  systems: Named[];
  languages: Named[];
  hosts: Named[];
  flow: { entries: Named[]; exits: Named[]; steps: { from: string; to: string; count: number }[] };
  clicks: { path: string; selector: string; label: string | null; count: number }[];
  events: { name: string; count: number; visits: number; values: Named[] }[];
  forms: { started: number; sent: number };
  broken: Named[];
  speed: Vitals & { samples: number };
  goals: Goal[];
  funnels: { id: string; name: string; steps: { kind: string; match: string; count: number }[] }[];
  visits: Visit[];
}
interface PageDetail {
  path: string;
  views: number;
  visitors: number;
  clicks: number;
  avgMs: number;
  avgFold: number | null;
  reach: number[];
  speed: Vitals;
  before: Named[];
  after: Named[];
  elements: { selector: string; label: string | null; href: string | null; count: number }[];
  heatUrl: string | null;
}
interface ClientOption { id: string; name: string; company: string | null }
type FilterKey = "page" | "source" | "channel" | "campaign" | "country" | "browser" | "os" | "language" | "host";

const RANGES = [
  { key: "today", label: "Today" },
  { key: "7d", label: "7 days" },
  { key: "30d", label: "30 days" },
  { key: "90d", label: "90 days" },
  { key: "12mo", label: "12 months" },
];
const DEVICES = [
  { key: "all", label: "All devices" },
  { key: "desktop", label: "Desktop" },
  { key: "tablet", label: "Tablet" },
  { key: "mobile", label: "Mobile" },
];
const FILTER_LABEL: Record<FilterKey, string> = {
  page: "Visited", source: "Source", channel: "Channel", campaign: "Campaign", country: "Country",
  browser: "Browser", os: "System", language: "Language", host: "Host",
};
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// Google's published limits: [good up to, poor from]
const VITALS: { key: VitalKey; name: string; what: string; limits: [number, number]; unit: "ms" | "" }[] = [
  { key: "lcp", name: "Main content shows", what: "Largest Contentful Paint", limits: [2500, 4000], unit: "ms" },
  { key: "inp", name: "Reacts to a tap", what: "Interaction to Next Paint", limits: [200, 500], unit: "ms" },
  { key: "cls", name: "Layout stays put", what: "Cumulative Layout Shift", limits: [0.1, 0.25], unit: "" },
  { key: "fcp", name: "First thing shows", what: "First Contentful Paint", limits: [1800, 3000], unit: "ms" },
  { key: "ttfb", name: "Server answers", what: "Time to First Byte", limits: [800, 1800], unit: "ms" },
];

const pct = (n: number) => `${Math.round(n * 100)}%`;
const pct100 = (n: number) => `${(n * 100).toFixed(n > 0 && n < 0.1 ? 1 : 0)}%`;

function duration(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`;
}

function speedText(value: number | null, unit: "ms" | ""): string {
  if (value === null) return "–";
  if (unit === "") return value.toFixed(2);
  return value >= 1000 ? `${(value / 1000).toFixed(1)}s` : `${Math.round(value)}ms`;
}

function rating(value: number | null, limits: readonly [number, number]) {
  if (value === null) return { word: "No data yet", tone: "text-bb-dim", dot: "bg-bb-border" };
  if (value <= limits[0]) return { word: "Good", tone: "text-green-400", dot: "bg-green-400" };
  if (value <= limits[1]) return { word: "Needs work", tone: "text-amber-400", dot: "bg-amber-400" };
  return { word: "Poor", tone: "text-red-400", dot: "bg-red-400" };
}

function ago(iso: string | null): string {
  if (!iso) return "";
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (mins < 2) return "just now";
  if (mins < 60) return `${mins} min ago`;
  if (mins < 60 * 48) return `${Math.round(mins / 60)} h ago`;
  return `${Math.round(mins / 1440)} days ago`;
}

const regionNames = typeof Intl !== "undefined" ? new Intl.DisplayNames(["en"], { type: "region" }) : null;
const languageNames = typeof Intl !== "undefined" ? new Intl.DisplayNames(["en"], { type: "language" }) : null;
const named = (names: Intl.DisplayNames | null, code: string) => {
  try {
    return names?.of(code) || code;
  } catch {
    return code;
  }
};
const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const card = "bg-bb-surface border border-bb-border rounded-lg";
const input = "w-full bg-bb-black border border-bb-border rounded-md px-3 py-2 text-sm text-white placeholder:text-bb-dim focus:outline-none focus:border-bb-blue";
const select = "bg-bb-surface border border-bb-border rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:border-bb-blue";

/** A ranked list where each row carries a bar sized to its share of the biggest row. */
function Ranked({
  rows, empty, onPick, onFilter, pickLabel,
}: {
  rows: { key: string; label: React.ReactNode; count: number; hint?: string }[];
  empty: string;
  onPick?: (key: string) => void;
  onFilter?: (key: string) => void;
  pickLabel?: string;
}) {
  if (!rows.length) return <p className="text-sm text-bb-dim py-6 text-center">{empty}</p>;
  const max = Math.max(...rows.map((r) => r.count), 1);
  return (
    <ul className="space-y-1">
      {rows.map((r) => {
        const inner = (
          <>
            <span className="absolute inset-y-0 left-0 rounded bg-bb-blue/20" style={{ width: `${(r.count / max) * 100}%` }} aria-hidden />
            <span className="relative flex items-center justify-between gap-3 px-2.5 py-1.5">
              <span className="min-w-0 truncate text-sm text-white">{r.label}</span>
              <span className="shrink-0 text-sm tabular-nums text-bb-muted">
                {r.hint && <span className="text-bb-dim mr-2 hidden sm:inline">{r.hint}</span>}
                {r.count.toLocaleString()}
              </span>
            </span>
          </>
        );
        return (
          <li key={r.key} className="flex items-stretch gap-1">
            {onPick ? (
              <button type="button" title={pickLabel} onClick={() => onPick(r.key)} className="relative block flex-1 min-w-0 text-left rounded hover:bg-bb-elevated transition-colors">
                {inner}
              </button>
            ) : (
              <div className="relative flex-1 min-w-0 rounded">{inner}</div>
            )}
            {onFilter && (
              <button type="button" onClick={() => onFilter(r.key)} aria-label="Show only visits like this" title="Show only visits like this" className="px-2 rounded text-bb-dim hover:text-white hover:bg-bb-elevated shrink-0">
                <Filter size={13} />
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function Panel({ title, action, children, className }: { title: string; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn(card, "p-4", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <h2 className="text-sm font-semibold text-white">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function Tabs<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { key: T; label: string }[] }) {
  return (
    <div className="flex gap-1 bg-bb-black border border-bb-border rounded-md p-0.5 overflow-x-auto max-w-full">
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          onClick={() => onChange(o.key)}
          className={cn("px-2.5 py-1 text-xs rounded transition-colors whitespace-nowrap", value === o.key ? "bg-bb-elevated text-white" : "text-bb-muted hover:text-white")}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Change against the period before. `lowerIsBetter` flips which direction reads as good. */
function Delta({ now, before, lowerIsBetter }: { now: number; before: number; lowerIsBetter?: boolean }) {
  if (!before || !Number.isFinite(now / before)) return null;
  const change = (now - before) / before;
  if (Math.abs(change) < 0.005) return <span className="text-xs text-bb-dim">no change</span>;
  const up = change > 0;
  const good = lowerIsBetter ? !up : up;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={cn("inline-flex items-center gap-0.5 text-xs tabular-nums", good ? "text-green-400" : "text-red-400")} title="Compared with the period before">
      <Icon size={12} aria-hidden />
      {up ? "up" : "down"} {Math.abs(change) >= 10 ? "10x+" : `${Math.round(Math.abs(change) * 100)}%`}
    </span>
  );
}

function SpeedCards({ speed }: { speed: Vitals }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
      {VITALS.map((v) => {
        const stat = speed[v.key];
        const r = rating(stat.p75, v.limits);
        return (
          <div key={v.key} className="bg-bb-black border border-bb-border rounded-md p-3" title={v.what}>
            <p className="text-xs text-bb-dim truncate">{v.name}</p>
            <p className="text-lg font-semibold text-white tabular-nums">{speedText(stat.p75, v.unit)}</p>
            <p className={cn("flex items-center gap-1.5 text-xs", r.tone)}>
              <span className={cn("inline-block w-1.5 h-1.5 rounded-full", r.dot)} aria-hidden />
              {r.word}
              {stat.samples > 0 && <span className="text-bb-dim">· {pct(stat.good)} good</span>}
            </p>
          </div>
        );
      })}
    </div>
  );
}

/** The Analytics tab. With `share` it is the read-only page a client opens through a link: same numbers, nothing to change. */
export default function AnalyticsView({ share }: { share?: string }) {
  const ro = !!share;
  const { toast } = useToast();
  const [sites, setSites] = useState<Site[] | null>(null);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [siteId, setSiteId] = useState<string>(""); // "" = all websites
  const [range, setRange] = useState("7d");
  const [device, setDevice] = useState("all");
  const [filters, setFilters] = useState<Partial<Record<FilterKey, string>>>({});
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(false);
  const [metric, setMetric] = useState<"visitors" | "views">("visitors");
  const [sourceTab, setSourceTab] = useState<"channels" | "sources" | "campaigns">("channels");
  const [techTab, setTechTab] = useState<"devices" | "browsers" | "systems">("devices");
  const [openEvent, setOpenEvent] = useState<string | null>(null);
  const [openGoal, setOpenGoal] = useState<string | null>(null);
  const [gone, setGone] = useState(false);
  const [funnelForm, setFunnelForm] = useState<{ name: string; steps: { kind: "page" | "event"; match: string }[] } | null>(null);
  const [showLinks, setShowLinks] = useState(false);
  const [link, setLink] = useState({ path: "/", source: "", medium: "", campaign: "" });
  const [digest, setDigest] = useState<{ weeklyDigest: boolean; preview: string | null } | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [pagePath, setPagePath] = useState<string | null>(null);
  const [page, setPage] = useState<PageDetail | null>(null);
  const [isOwner, setIsOwner] = useState(false);
  const [form, setForm] = useState({ name: "", domain: "", clientId: "" });
  const [goalForm, setGoalForm] = useState({ name: "", match: "" });
  const [saving, setSaving] = useState(false);

  const site = useMemo(() => sites?.find((s) => s.id === siteId) || null, [sites, siteId]);
  const tz = useMemo(() => -new Date().getTimezoneOffset(), []);
  const baseQuery = `range=${range}&device=${device}&tz=${tz}`;
  const query = useMemo(
    () => baseQuery + Object.entries(filters).map(([k, v]) => `&f_${k}=${encodeURIComponent(v)}`).join(""),
    [baseQuery, filters]
  );

  const api = share ? `/api/stats/${share}` : `/api/analytics/sites/${siteId}`;

  const loadSites = useCallback(async () => {
    if (share) {
      // A client's link shows exactly one website
      try {
        const json = await (await fetch(`/api/stats/${share}`)).json();
        if (!json.success) return setGone(true);
        setSites([{ ...json.data, key: "", clientId: null, client: null, visitors7d: 0, visits7d: 0, views7d: 0, days: [], lastSeen: "shared" }]);
        setSiteId(json.data.id);
      } catch {
        setGone(true);
      }
      return;
    }
    try {
      const res = await fetch(`/api/analytics/sites?tz=${tz}`);
      const json = await res.json();
      if (!json.success) throw new Error();
      const list: Site[] = json.data;
      setSites(list);
      setSiteId((current) => {
        if (current && list.some((s) => s.id === current)) return current;
        // /analytics?site=<id> opens that site, /analytics?client=<id> that client's first site
        const params = new URLSearchParams(window.location.search);
        const wantedSite = params.get("site");
        const wantedClient = params.get("client");
        const match = list.find((s) => wantedSite && s.id === wantedSite) || list.find((s) => wantedClient && s.clientId === wantedClient);
        return match?.id || (list.length === 1 ? list[0].id : "");
      });
    } catch {
      setSites([]);
    }
  }, [tz, share]);

  useEffect(() => {
    loadSites();
    if (share) return;
    fetch("/api/clients?type=ALL")
      .then((r) => r.json())
      .then((d) => d.success && setClients(d.data.map((c: ClientOption) => ({ id: c.id, name: c.name, company: c.company }))))
      .catch(() => {});
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setIsOwner(d?.user?.role === "OWNER"))
      .catch(() => {});
    fetch("/api/analytics/settings")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d?.success && setDigest(d.data))
      .catch(() => {});
  }, [loadSites, share]);

  const loadSummary = useCallback(async () => {
    if (!siteId) return;
    setLoading(true);
    try {
      const res = await fetch(`${api}/summary?${query}`);
      const json = await res.json();
      setSummary(json.success ? json.data : null);
    } catch {
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, [siteId, query, api]);

  useEffect(() => {
    setSummary(null);
    loadSummary();
  }, [loadSummary]);

  // Keep the numbers fresh while the tab is open
  useEffect(() => {
    if (!siteId) return;
    const t = setInterval(() => document.visibilityState === "visible" && loadSummary(), 60_000);
    return () => clearInterval(t);
  }, [siteId, loadSummary]);

  useEffect(() => {
    if (!pagePath || !siteId) return;
    setPage(null);
    fetch(`${api}/page?path=${encodeURIComponent(pagePath)}&${baseQuery}`)
      .then((r) => r.json())
      .then((j) => j.success && setPage(j.data))
      .catch(() => {});
  }, [pagePath, siteId, baseQuery, api]);

  const openSite = (id: string) => {
    setFilters({});
    setSiteId(id);
  };
  const addFilter = (key: FilterKey, value: string) => setFilters((f) => ({ ...f, [key]: value }));
  const dropFilter = (key: FilterKey) =>
    setFilters((f) => {
      const next = { ...f };
      delete next[key];
      return next;
    });
  const filterValue = (key: FilterKey, value: string) =>
    key === "country" ? named(regionNames, value) : key === "language" ? capital(named(languageNames, value)) : value;

  async function addSite(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/analytics/sites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!json.success) return toast(json.error || "Could not add the site", "error");
      setSites((prev) => [...(prev || []), json.data]);
      openSite(json.data.id);
      setShowAdd(false);
      setForm({ name: "", domain: "", clientId: "" });
      setShowSettings(true);
    } finally {
      setSaving(false);
    }
  }

  async function patchSite(data: Record<string, unknown>) {
    if (!site) return;
    const res = await fetch(`/api/analytics/sites/${site.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const json = await res.json();
    if (!json.success) return toast(json.error || "Could not save", "error");
    setSites((prev) => (prev || []).map((s) => (s.id === site.id ? { ...s, ...json.data } : s)));
    toast("Saved", "success");
  }

  async function deleteSite() {
    if (!site) return;
    if (!window.confirm(`Delete ${site.name} and everything collected for it? This cannot be undone.`)) return;
    const res = await fetch(`/api/analytics/sites/${site.id}`, { method: "DELETE" });
    const json = await res.json();
    if (!json.success) return toast(json.error || "Could not delete", "error");
    setShowSettings(false);
    setSiteId("");
    loadSites();
  }

  async function addGoal(goal: { name: string; kind: "click" | "page" | "event"; match: string; path?: string }) {
    if (!site) return;
    const res = await fetch(`/api/analytics/sites/${site.id}/goals`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(goal),
    });
    const json = await res.json();
    if (!json.success) return toast(json.error || "Could not add the goal", "error");
    toast(`Goal added: ${goal.name}`, "success");
    setGoalForm({ name: "", match: "" });
    loadSummary();
  }

  async function saveFunnel(e: React.FormEvent) {
    e.preventDefault();
    if (!site || !funnelForm) return;
    const res = await fetch(`/api/analytics/sites/${site.id}/funnels`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(funnelForm),
    });
    const json = await res.json();
    if (!json.success) return toast(json.error || "Could not save the funnel", "error");
    setFunnelForm(null);
    loadSummary();
  }

  async function removeFunnel(id: string) {
    await fetch(`/api/analytics/funnels/${id}`, { method: "DELETE" });
    loadSummary();
  }

  async function toggleDigest() {
    if (!digest) return;
    const res = await fetch("/api/analytics/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ weeklyDigest: !digest.weeklyDigest }),
    });
    const json = await res.json();
    if (!json.success) return toast(json.error || "Could not change this", "error");
    setDigest({ ...digest, weeklyDigest: json.data.weeklyDigest });
    toast(json.data.weeklyDigest ? "Monday summary switched on" : "Monday summary switched off", "success");
  }

  async function removeGoal(id: string) {
    await fetch(`/api/analytics/goals/${id}`, { method: "DELETE" });
    loadSummary();
  }

  function exportCsv() {
    if (!summary || !site) return;
    const cell = (v: string | number | null) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const block = (title: string, head: string[], rows: (string | number | null)[][]) =>
      [cell(title), head.map(cell).join(","), ...rows.map((r) => r.map(cell).join(",")), ""].join("\n");
    const t = summary.totals;
    const csv = [
      block(`${site.name} (${site.domain}), ${RANGES.find((r) => r.key === range)?.label}`, ["Visitors", "Visits", "Page views", "Bounce rate", "Time per visit (s)", "Pages per visit"], [
        [t.visitors, t.sessions, t.pageviews, pct(t.bounceRate), Math.round(t.avgSessionMs / 1000), t.pagesPerSession.toFixed(2)],
      ]),
      block("By day", ["Start", "Visitors", "Page views"], summary.series.map((s) => [s.t, s.visitors, s.views])),
      block("Pages", ["Page", "Views", "Visitors", "Avg time (s)", "Avg scroll %", "Landed here", "Left here", "LCP p75 (ms)"], summary.pages.map((p) => [p.path, p.count, p.visitors, Math.round(p.avgMs / 1000), p.avgScroll, p.entries, p.exits, p.lcp])),
      block("Channels", ["Channel", "Visits"], summary.channels.map((r) => [r.name, r.count])),
      block("Sources", ["Source", "Visits"], summary.sources.map((r) => [r.name, r.count])),
      block("Campaigns", ["Campaign", "Visits"], summary.campaigns.map((r) => [r.name, r.count])),
      block("Countries", ["Country", "Visits"], summary.countries.map((r) => [named(regionNames, r.name), r.count])),
      block("Events", ["Event", "Times", "Visits"], summary.events.map((e) => [e.name, e.count, e.visits])),
      block("Most clicked", ["Page", "Element", "Clicks"], summary.clicks.map((c) => [c.path, c.label || c.selector, c.count])),
      block("Goals", ["Goal", "Visits that did it", "Rate"], summary.goals.map((g) => [g.name, g.conversions, pct(g.rate)])),
    ].join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `${site.domain}-analytics-${range}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const snippet = site ? `<script defer src="${origin}/bb.js" data-site="${site.key}"></script>` : "";
  const consentSnippet = site ? `<script defer src="${origin}/bb.js" data-site="${site.key}" data-consent="wait"></script>` : "";
  const campaignLink = (() => {
    if (!site) return "";
    const path = link.path.startsWith("/") ? link.path : `/${link.path}`;
    const q = new URLSearchParams();
    const slug = (v: string) => v.trim().toLowerCase().replace(/\s+/g, "-");
    if (link.source.trim()) q.set("utm_source", slug(link.source));
    if (link.medium.trim()) q.set("utm_medium", slug(link.medium));
    if (link.campaign.trim()) q.set("utm_campaign", slug(link.campaign));
    const qs = q.toString();
    return `https://${site.domain}${path}${qs ? `?${qs}` : ""}`;
  })();
  const copy = (text: string, what: string) =>
    navigator.clipboard.writeText(text).then(() => toast(`${what} copied`, "success")).catch(() => toast("Could not copy", "error"));

  const t = summary?.totals;
  const p = summary?.previous;
  const tiles = [
    { label: "Visitors", value: t ? compact(t.visitors) : "–", icon: Users, now: t?.visitors, before: p?.visitors },
    { label: "Visits", value: t ? compact(t.sessions) : "–", icon: Activity, now: t?.sessions, before: p?.sessions },
    { label: "Page views", value: t ? compact(t.pageviews) : "–", icon: Eye, now: t?.pageviews, before: p?.pageviews },
    { label: "Bounce rate", value: t && t.sessions ? pct(t.bounceRate) : "–", icon: LogOut, now: t?.bounceRate, before: p?.sessions ? p.bounceRate : 0, lowerIsBetter: true },
    { label: "Time per visit", value: t && t.sessions ? duration(t.avgSessionMs) : "–", icon: Timer, now: t?.avgSessionMs, before: p?.avgSessionMs },
    { label: "Pages per visit", value: t && t.sessions ? t.pagesPerSession.toFixed(1) : "–", icon: MousePointerClick, now: t?.pagesPerSession, before: p?.pagesPerSession },
  ];
  const weekMax = summary ? Math.max(1, ...summary.week.flat()) : 1;
  const slowPages = (summary?.pages || []).filter((r) => r.lcp !== null).sort((a, b) => (b.lcp || 0) - (a.lcp || 0)).slice(0, 6);
  const activeFilters = Object.entries(filters) as [FilterKey, string][];

  function addModal() {
    return (
      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Add a website">
        <form onSubmit={addSite} className="space-y-4">
          <label className="block">
            <span className="block text-xs text-bb-muted mb-1.5">Name</span>
            <input className={input} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Blok Blok Studio" required />
          </label>
          <label className="block">
            <span className="block text-xs text-bb-muted mb-1.5">Domain</span>
            <input className={input} value={form.domain} onChange={(e) => setForm({ ...form, domain: e.target.value })} placeholder="example.com" required autoCapitalize="none" autoCorrect="off" />
            <span className="block text-xs text-bb-dim mt-1.5">Without www. Subdomains are counted too. Works on any website that lets you add a script tag.</span>
          </label>
          <label className="block">
            <span className="block text-xs text-bb-muted mb-1.5">Client</span>
            <select className={cn(select, "w-full")} value={form.clientId} onChange={(e) => setForm({ ...form, clientId: e.target.value })}>
              <option value="">No client (our own site)</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.name}{c.company ? ` · ${c.company}` : ""}</option>
              ))}
            </select>
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setShowAdd(false)} className="px-4 py-2 text-sm text-bb-muted hover:text-white">Cancel</button>
            <button type="submit" disabled={saving} className="px-4 py-2 bg-bb-blue hover:bg-bb-blue-light disabled:opacity-50 text-white text-sm font-medium rounded-md transition-colors">
              {saving ? "Adding…" : "Add website"}
            </button>
          </div>
        </form>
      </Modal>
    );
  }

  // ─── No sites yet ───
  if (sites && sites.length === 0) {
    return (
      <div>
        <TopBar title="Analytics" subtitle="Traffic, clicks, speed and heatmaps for the websites we build" />
        <div className="px-4 lg:px-6">
          <div className={cn(card, "p-8 text-center max-w-xl mx-auto mt-8")}>
            <Flame size={28} className="text-bb-accent mx-auto mb-3" />
            <h2 className="text-lg font-display font-semibold text-white mb-2">No websites tracked yet</h2>
            <p className="text-sm text-bb-muted mb-5">Add a site, paste one line into its code, and visits start showing here.</p>
            <button onClick={() => setShowAdd(true)} className="inline-flex items-center gap-2 px-4 py-2 bg-bb-blue hover:bg-bb-blue-light text-white text-sm font-medium rounded-md transition-colors">
              <Plus size={16} /> Add a website
            </button>
          </div>
        </div>
        {addModal()}
      </div>
    );
  }

  if (gone) {
    return (
      <div className="px-4 py-24 text-center">
        <h1 className="text-lg font-display font-semibold text-white mb-2">This link is no longer active</h1>
        <p className="text-sm text-bb-muted">Ask your contact at Blok Blok Studio for a new one.</p>
      </div>
    );
  }

  return (
    <div>
      {ro ? (
        <header className="px-4 lg:px-6 py-4">
          <h1 className="text-xl font-display font-semibold text-white">{site ? site.name : "Website analytics"}</h1>
          <p className="text-sm text-bb-muted">{site ? `${site.domain} · visitors, pages and sources, prepared by Blok Blok Studio` : ""}</p>
        </header>
      ) : (
        <TopBar title="Analytics" subtitle="Traffic, clicks, speed and heatmaps for the websites we build" />
      )}
      <div className="px-4 lg:px-6 pb-10 space-y-4">
        {/* ─── Controls ─── */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className={cn("items-center gap-2 min-w-0", ro ? "hidden" : "flex")}>
            <select aria-label="Website" className={cn(select, "min-w-0 flex-1 lg:flex-none lg:min-w-64")} value={siteId} onChange={(e) => openSite(e.target.value)}>
              <option value="">All websites</option>
              {(sites || []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}{s.client ? ` · ${s.client.name}` : ""}{s.active ? "" : " (paused)"}
                </option>
              ))}
            </select>
            {site && (
              <button onClick={() => setShowSettings(true)} aria-label="Site setup" title="Site setup" className="p-2 rounded-md border border-bb-border text-bb-muted hover:text-white hover:bg-bb-elevated transition-colors shrink-0">
                <Settings size={16} />
              </button>
            )}
            <button onClick={() => setShowAdd(true)} className="flex items-center gap-1.5 px-3 py-2 bg-bb-blue hover:bg-bb-blue-light text-white text-sm font-medium rounded-md transition-colors shrink-0">
              <Plus size={16} /> <span className="hidden sm:inline">Add website</span>
            </button>
          </div>
          {site && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 text-xs text-bb-muted mr-1" title="Visitors with a page view in the last five minutes">
                <span className={cn("inline-block w-2 h-2 rounded-full", summary?.live ? "bg-green-400" : "bg-bb-border")} aria-hidden />
                {summary ? `${summary.live} on the site now` : "…"}
              </span>
              <Tabs value={range} onChange={setRange} options={RANGES} />
              <select aria-label="Device" className={cn(select, "py-1.5 text-xs shrink-0")} value={device} onChange={(e) => setDevice(e.target.value)}>
                {DEVICES.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
              </select>
              {!ro && (
                <button onClick={() => setShowLinks(true)} title="Make a link that shows up under its own source and campaign" className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs border border-bb-border rounded-md text-bb-muted hover:text-white hover:bg-bb-elevated">
                  <Link2 size={13} /> Campaign link
                </button>
              )}
              <button onClick={exportCsv} disabled={!summary} title="Download these numbers as a spreadsheet file" className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs border border-bb-border rounded-md text-bb-muted hover:text-white hover:bg-bb-elevated disabled:opacity-50">
                <Download size={13} /> Export
              </button>
            </div>
          )}
        </div>

        {/* ─── All websites ─── */}
        {!site && !ro && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {(sites || []).map((s) => {
              const peak = Math.max(1, ...s.days);
              return (
                <button key={s.id} type="button" onClick={() => openSite(s.id)} className={cn(card, "p-4 text-left hover:border-bb-blue/60 transition-colors")}>
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-white truncate">{s.name}</p>
                      <p className="text-xs text-bb-dim truncate">{s.domain}{s.client ? ` · ${s.client.name}` : ""}</p>
                    </div>
                    <div className="flex items-end gap-0.5 h-8 shrink-0" aria-label="Visitors per day, last seven days">
                      {s.days.map((n, i) => (
                        <span key={i} className="w-1.5 rounded-sm bg-bb-blue" style={{ height: `${Math.max(6, (n / peak) * 100)}%`, opacity: n ? 1 : 0.25 }} />
                      ))}
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 mb-3">
                    {[["Visitors", s.visitors7d], ["Visits", s.visits7d], ["Page views", s.views7d]].map(([label, value]) => (
                      <div key={label as string}>
                        <p className="text-lg font-semibold text-white tabular-nums">{compact(value as number)}</p>
                        <p className="text-xs text-bb-dim">{label}</p>
                      </div>
                    ))}
                  </div>
                  <p className="flex items-center gap-1.5 text-xs text-bb-muted">
                    <span className={cn("inline-block w-1.5 h-1.5 rounded-full", !s.active ? "bg-amber-400" : s.lastSeen ? "bg-green-400" : "bg-bb-border")} aria-hidden />
                    {!s.active ? "Tracking paused" : s.lastSeen ? `Receiving data · last visit ${ago(s.lastSeen)}` : "Waiting for the first visit"}
                    <span className="ml-auto text-bb-dim">Last 7 days</span>
                  </p>
                </button>
              );
            })}
          </div>
        )}

        {!site && !ro && digest && (
          <div className={cn(card, "p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3")}>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-white">Monday summary in Slack</p>
              <p className="text-xs text-bb-muted">One message each Monday morning in the team channel: visitors, change on the week before, top page and main source for every website here.</p>
              {digest.preview && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs text-bb-accent">See what it would say today</summary>
                  <pre className="mt-2 bg-bb-black border border-bb-border rounded-md p-3 text-xs text-bb-gray whitespace-pre-wrap break-words font-sans">{digest.preview.replace(/[*]/g, "").replace(":bar_chart: ", "")}</pre>
                </details>
              )}
            </div>
            {isOwner ? (
              <button type="button" role="switch" aria-checked={digest.weeklyDigest} aria-label="Monday summary in Slack" onClick={toggleDigest} className={cn("relative w-11 h-6 rounded-full shrink-0 transition-colors", digest.weeklyDigest ? "bg-bb-blue" : "bg-bb-border")}>
                <span className={cn("absolute top-1 w-4 h-4 rounded-full bg-white transition-all", digest.weeklyDigest ? "left-6" : "left-1")} />
              </button>
            ) : (
              <span className="text-xs text-bb-dim shrink-0">{digest.weeklyDigest ? "On" : "Off"} · owner setting</span>
            )}
          </div>
        )}

        {site && (
          <>
            {activeFilters.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-bb-dim">Showing only visits where</span>
                {activeFilters.map(([key, value]) => (
                  <button key={key} onClick={() => dropFilter(key)} className="inline-flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 text-xs rounded-full bg-bb-blue/20 border border-bb-blue/40 text-white hover:bg-bb-blue/30" aria-label={`Remove filter ${FILTER_LABEL[key]}: ${value}`}>
                    <span className="text-bb-accent-light">{FILTER_LABEL[key]}</span> {filterValue(key, value)} <X size={12} />
                  </button>
                ))}
                <button onClick={() => setFilters({})} className="text-xs text-bb-accent hover:text-bb-accent-light">Clear all</button>
              </div>
            )}

            {!ro && !site.lastSeen && summary && summary.totals.pageviews === 0 && (
              <div className={cn(card, "p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3")}>
                <p className="text-sm text-bb-muted">
                  Nothing has arrived from <span className="text-white">{site.domain}</span> yet. Add the tracking line to the site and the first visit shows here within a minute.
                </p>
                <button onClick={() => setShowSettings(true)} className="text-sm text-bb-accent hover:text-bb-accent-light shrink-0">Show the tracking line</button>
              </div>
            )}

            {/* ─── Totals ─── */}
            <div className={cn("grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 transition-opacity", loading && "opacity-60")}>
              {tiles.map((tile) => (
                <div key={tile.label} className={cn(card, "p-4")}>
                  <p className="flex items-center gap-1.5 text-xs text-bb-dim mb-1"><tile.icon size={13} className="text-bb-accent" />{tile.label}</p>
                  <p className="text-2xl font-display font-semibold text-white tabular-nums">{tile.value}</p>
                  <div className="h-4 mt-0.5">
                    {tile.now !== undefined && tile.before !== undefined && <Delta now={tile.now} before={tile.before} lowerIsBetter={tile.lowerIsBetter} />}
                  </div>
                </div>
              ))}
            </div>

            {/* ─── Trend ─── */}
            <Panel
              title={metric === "visitors" ? "Visitors" : "Page views"}
              action={<Tabs value={metric} onChange={setMetric} options={[{ key: "visitors", label: "Visitors" }, { key: "views", label: "Page views" }]} />}
            >
              {summary ? (
                <TrendChart
                  data={summary.series}
                  dataKey={metric}
                  xKey="t"
                  metricLabel={metric === "visitors" ? "Visitors" : "Page views"}
                  dateFormat={summary.hourly ? "HH:mm" : "MMM d"}
                  tooltipDateFormat={summary.hourly ? "HH:mm" : "EEE MMM d"}
                />
              ) : (
                <div className="h-[220px] animate-pulse rounded bg-bb-elevated/40" />
              )}
              {summary?.truncated && <p className="text-xs text-bb-dim mt-2">This period has more traffic than one view can total. Pick a shorter period for exact numbers.</p>}
            </Panel>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Panel title="Top pages" action={<span className="text-xs text-bb-dim">{ro ? "Open a page for clicks, scrolling and speed" : "Open a page for clicks, heatmap and speed"}</span>}>
                <Ranked
                  empty="No page views yet"
                  onPick={setPagePath}
                  pickLabel="Open this page"
                  onFilter={(key) => addFilter("page", key)}
                  rows={(summary?.pages || []).slice(0, 12).map((r) => ({ key: r.path, label: r.path, count: r.count, hint: `${r.avgScroll}% scrolled · ${duration(r.avgMs)}` }))}
                />
              </Panel>

              <Panel
                title="Where visitors come from"
                action={<Tabs value={sourceTab} onChange={setSourceTab} options={[{ key: "channels", label: "Channels" }, { key: "sources", label: "Sources" }, { key: "campaigns", label: "Campaigns" }]} />}
              >
                <Ranked
                  empty={sourceTab === "campaigns" ? "No links with utm_campaign yet" : "No visits yet"}
                  onPick={(key) => addFilter(sourceTab === "channels" ? "channel" : sourceTab === "sources" ? "source" : "campaign", key)}
                  pickLabel="Show only these visits"
                  rows={(summary?.[sourceTab] || []).map((r) => ({ key: r.name, label: r.name, count: r.count }))}
                />
                {sourceTab === "channels" && <p className="text-xs text-bb-dim mt-3">AI assistants covers visits sent by ChatGPT, Perplexity, Claude, Gemini, Copilot and similar.</p>}
              </Panel>
            </div>

            {/* ─── Flow ─── */}
            <Panel title="Traffic flow" action={<span className="text-xs text-bb-dim">Counted per visit</span>}>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                <div>
                  <h3 className="text-xs text-bb-dim mb-2">Where people land</h3>
                  <Ranked empty="No visits yet" onPick={setPagePath} rows={(summary?.flow.entries || []).map((r) => ({ key: r.name, label: r.name, count: r.count }))} />
                </div>
                <div>
                  <h3 className="text-xs text-bb-dim mb-2">Where they go next</h3>
                  <Ranked
                    empty="Nobody has moved between pages yet"
                    rows={(summary?.flow.steps || []).slice(0, 8).map((r) => ({
                      key: `${r.from}>${r.to}`,
                      count: r.count,
                      label: <span className="inline-flex items-center gap-1.5 max-w-full"><span className="truncate">{r.from}</span><ArrowRight size={12} className="text-bb-dim shrink-0" /><span className="truncate">{r.to}</span></span>,
                    }))}
                  />
                </div>
                <div>
                  <h3 className="text-xs text-bb-dim mb-2">Where they leave</h3>
                  <Ranked empty="No visits yet" onPick={setPagePath} rows={(summary?.flow.exits || []).map((r) => ({ key: r.name, label: r.name, count: r.count }))} />
                </div>
              </div>
            </Panel>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* ─── Events ─── */}
              <Panel title="What visitors do" action={<span className="text-xs text-bb-dim">Forms, outbound links, downloads, your own events</span>}>
                {summary && summary.forms.started > 0 && (
                  <p className="text-sm text-bb-muted mb-3">
                    Forms: started in <span className="text-white tabular-nums">{summary.forms.started}</span> {summary.forms.started === 1 ? "visit" : "visits"}, sent in <span className="text-white tabular-nums">{summary.forms.sent}</span>
                    <span className="text-bb-dim"> ({pct(summary.forms.sent / summary.forms.started)})</span>
                  </p>
                )}
                {summary?.events.length ? (
                  <ul className="space-y-1">
                    {summary.events.map((e) => (
                      <li key={e.name} className="rounded bg-bb-black border border-bb-border">
                        <div className="flex items-center justify-between gap-2 px-2.5 py-1.5">
                          <button type="button" onClick={() => setOpenEvent(openEvent === e.name ? null : e.name)} className="min-w-0 flex-1 text-left" aria-expanded={openEvent === e.name}>
                            <span className="block text-sm text-white truncate">{e.name}</span>
                            <span className="block text-xs text-bb-dim tabular-nums">{e.count === 1 ? "Once" : `${e.count.toLocaleString()} times`} in {e.visits.toLocaleString()} {e.visits === 1 ? "visit" : "visits"}</span>
                          </button>
                          {!ro && <button onClick={() => addGoal({ name: e.name, kind: "event", match: e.name })} className="px-2 py-1 text-xs border border-bb-border rounded hover:bg-bb-elevated text-bb-muted hover:text-white whitespace-nowrap">Track as goal</button>}
                        </div>
                        {openEvent === e.name && e.values.length > 0 && (
                          <ul className="px-2.5 pb-2 space-y-0.5">
                            {e.values.map((v) => (
                              <li key={v.name} className="flex items-center justify-between gap-3 text-xs">
                                <span className="truncate text-bb-muted">{v.name}</span>
                                <span className="tabular-nums text-bb-dim">{v.count.toLocaleString()}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-bb-dim py-6 text-center">Nothing yet. Forms, outbound links, downloads, email and phone links are picked up on their own.</p>
                )}
              </Panel>

              {/* ─── Goals ─── */}
              <Panel title="Goals" action={<span className="text-xs text-bb-dim">Share of visits that did it</span>}>
                {summary?.goals.length ? (
                  <ul className="space-y-1 mb-4">
                    {summary.goals.map((g) => (
                      <li key={g.id} className="rounded bg-bb-black border border-bb-border">
                        <div className="flex items-center justify-between gap-3 px-2.5 py-2">
                          <button type="button" onClick={() => setOpenGoal(openGoal === g.id ? null : g.id)} aria-expanded={openGoal === g.id} className="min-w-0 flex-1 text-left">
                            <span className="block text-sm text-white truncate">{g.name}</span>
                            <span className="block text-xs text-bb-dim truncate">{g.kind === "page" ? `Visits ${g.match}` : g.kind === "event" ? "Event" : `Click${g.path ? ` on ${g.path}` : ""}`} · by channel</span>
                          </button>
                          <span className="flex items-center gap-3 shrink-0">
                            <span className="text-right">
                              <span className="block text-sm font-semibold text-white tabular-nums">{(g.rate * 100).toFixed(g.rate > 0 && g.rate < 0.1 ? 1 : 0)}%</span>
                              <span className="block text-xs text-bb-dim tabular-nums">{g.conversions.toLocaleString()} {g.conversions === 1 ? "visit" : "visits"}</span>
                            </span>
                            {!ro && <button onClick={() => removeGoal(g.id)} aria-label={`Remove goal ${g.name}`} className="p-1.5 rounded text-bb-dim hover:text-red-400 hover:bg-bb-elevated"><Trash2 size={14} /></button>}
                          </span>
                        </div>
                        {openGoal === g.id && (
                          <ul className="px-2.5 pb-2 space-y-0.5">
                            {g.byChannel.length === 0 && <li className="text-xs text-bb-dim">Nobody has done this yet in this period.</li>}
                            {g.byChannel.map((c) => (
                              <li key={c.name} className="flex items-center justify-between gap-3 text-xs">
                                <span className="truncate text-bb-muted">{c.name}</span>
                                <span className="tabular-nums text-bb-dim">{c.count.toLocaleString()} · {pct100(c.rate)} of that channel</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-bb-dim mb-4">No goals yet. Choose “Track as goal” on a button or an event, or add a page below.</p>
                )}
                {!ro && <form
                  className="flex flex-col sm:flex-row gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    addGoal({ name: goalForm.name || `Reached ${goalForm.match}`, kind: "page", match: goalForm.match });
                  }}
                >
                  <input className={input} aria-label="Goal name" placeholder="Name, e.g. Saw thank-you page" value={goalForm.name} onChange={(e) => setGoalForm({ ...goalForm, name: e.target.value })} />
                  <input className={input} aria-label="Page path" placeholder="/thanks or /blog/*" value={goalForm.match} onChange={(e) => setGoalForm({ ...goalForm, match: e.target.value })} required />
                  <button type="submit" className="flex items-center justify-center gap-1.5 px-3 py-2 border border-bb-border hover:bg-bb-elevated text-white text-sm rounded-md shrink-0"><Target size={14} /> Add</button>
                </form>}
              </Panel>
            </div>

            {/* ─── Funnels ─── */}
            {(!ro || (summary?.funnels.length || 0) > 0) && (
              <Panel
                title="Funnels"
                action={!ro && !funnelForm ? (
                  <button onClick={() => setFunnelForm({ name: "", steps: [{ kind: "page", match: "/" }, { kind: "page", match: "" }] })} className="flex items-center gap-1 text-xs text-bb-accent hover:text-bb-accent-light"><Plus size={13} /> New funnel</button>
                ) : <span className="text-xs text-bb-dim">Steps done in order within one visit</span>}
              >
                {funnelForm && (
                  <form onSubmit={saveFunnel} className="space-y-2 mb-4 bg-bb-black border border-bb-border rounded-md p-3">
                    <input className={input} aria-label="Funnel name" placeholder="Name, e.g. Home to enquiry" value={funnelForm.name} onChange={(e) => setFunnelForm({ ...funnelForm, name: e.target.value })} required />
                    {funnelForm.steps.map((step, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <span className="w-5 text-xs text-bb-dim tabular-nums shrink-0">{i + 1}.</span>
                        <select aria-label={`Step ${i + 1} kind`} className={cn(select, "py-2 text-xs shrink-0")} value={step.kind} onChange={(e) => setFunnelForm({ ...funnelForm, steps: funnelForm.steps.map((st, j) => (j === i ? { kind: e.target.value as "page" | "event", match: "" } : st)) })}>
                          <option value="page">Visited page</option>
                          <option value="event">Did</option>
                        </select>
                        <input
                          className={input}
                          aria-label={`Step ${i + 1}`}
                          list={step.kind === "page" ? "bb-funnel-pages" : "bb-funnel-events"}
                          placeholder={step.kind === "page" ? "/pricing or /blog/*" : "Form sent"}
                          value={step.match}
                          onChange={(e) => setFunnelForm({ ...funnelForm, steps: funnelForm.steps.map((st, j) => (j === i ? { ...st, match: e.target.value } : st)) })}
                          required
                        />
                        {funnelForm.steps.length > 2 && (
                          <button type="button" aria-label={`Remove step ${i + 1}`} onClick={() => setFunnelForm({ ...funnelForm, steps: funnelForm.steps.filter((_, j) => j !== i) })} className="p-1.5 rounded text-bb-dim hover:text-white hover:bg-bb-elevated shrink-0"><X size={14} /></button>
                        )}
                      </div>
                    ))}
                    <datalist id="bb-funnel-pages">{(summary?.pages || []).slice(0, 40).map((r) => <option key={r.path} value={r.path} />)}</datalist>
                    <datalist id="bb-funnel-events">{["Form started", "Form sent", ...(summary?.events || []).map((e) => e.name)].filter((v, i, all) => all.indexOf(v) === i).map((n) => <option key={n} value={n} />)}</datalist>
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                      {funnelForm.steps.length < 8 ? (
                        <button type="button" onClick={() => setFunnelForm({ ...funnelForm, steps: [...funnelForm.steps, { kind: "page", match: "" }] })} className="text-xs text-bb-accent hover:text-bb-accent-light">Add a step</button>
                      ) : <span />}
                      <span className="flex gap-2">
                        <button type="button" onClick={() => setFunnelForm(null)} className="px-3 py-1.5 text-xs text-bb-muted hover:text-white">Cancel</button>
                        <button type="submit" className="px-3 py-1.5 text-xs bg-bb-blue hover:bg-bb-blue-light text-white rounded-md">Save funnel</button>
                      </span>
                    </div>
                  </form>
                )}
                {summary?.funnels.length ? (
                  <div className="space-y-5">
                    {summary.funnels.map((f) => {
                      const first = f.steps[0]?.count || 0;
                      const last = f.steps[f.steps.length - 1]?.count || 0;
                      return (
                        <div key={f.id}>
                          <div className="flex items-center justify-between gap-2 mb-2">
                            <h3 className="text-sm text-white truncate">{f.name} <span className="text-bb-dim">· {first ? pct100(last / first) : "0%"} get all the way</span></h3>
                            {!ro && <button onClick={() => removeFunnel(f.id)} aria-label={`Remove funnel ${f.name}`} className="p-1.5 rounded text-bb-dim hover:text-red-400 hover:bg-bb-elevated shrink-0"><Trash2 size={14} /></button>}
                          </div>
                          <ol className="space-y-1">
                            {f.steps.map((st, i) => {
                              const prev = i === 0 ? st.count : f.steps[i - 1].count;
                              return (
                                <li key={i} className="relative rounded bg-bb-black border border-bb-border overflow-hidden">
                                  <span className="absolute inset-y-0 left-0 bg-bb-blue/25" style={{ width: `${first ? (st.count / first) * 100 : 0}%` }} aria-hidden />
                                  <span className="relative flex items-center justify-between gap-3 px-2.5 py-1.5 text-sm">
                                    <span className="min-w-0 truncate text-white"><span className="text-bb-dim tabular-nums mr-2">{i + 1}</span>{st.kind === "page" ? `Visited ${st.match}` : st.match}</span>
                                    <span className="shrink-0 tabular-nums text-bb-muted">
                                      {i > 0 && prev > 0 && <span className="text-bb-dim mr-2">{pct100(1 - st.count / prev)} dropped</span>}
                                      {st.count.toLocaleString()}
                                    </span>
                                  </span>
                                </li>
                              );
                            })}
                          </ol>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  !funnelForm && <p className="text-sm text-bb-dim py-4 text-center">No funnels yet. Line up the steps you hope a visitor takes and see where they stop.</p>
                )}
              </Panel>
            )}

            {/* ─── Latest visits ─── */}
            <Panel title="Latest visits" action={<span className="text-xs text-bb-dim">The path each visitor took. No names, nothing personal.</span>}>
              {summary?.visits.length ? (
                <ul className="divide-y divide-bb-border">
                  {summary.visits.slice(0, 12).map((v) => (
                    <li key={v.id + v.at} className="py-2 flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4">
                      <span className="sm:w-52 shrink-0 text-xs text-bb-dim">
                        <span className="text-bb-muted">{ago(v.at)}</span> · {v.source}{v.country ? ` · ${named(regionNames, v.country)}` : ""} · {capital(v.device)}
                      </span>
                      <span className="min-w-0 flex-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm">
                        {v.pages.map((path, i) => (
                          <span key={i} className="inline-flex items-center gap-1.5 min-w-0">
                            {i > 0 && <ArrowRight size={12} className="text-bb-dim shrink-0" />}
                            <span className="truncate max-w-48 text-white">{path}</span>
                          </span>
                        ))}
                        {v.did.map((name) => (
                          <span key={name} className="px-1.5 py-0.5 rounded bg-bb-blue/20 border border-bb-blue/40 text-[11px] text-bb-accent-light whitespace-nowrap">{name}</span>
                        ))}
                      </span>
                      <span className="shrink-0 text-xs tabular-nums text-bb-dim">{duration(v.ms)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-bb-dim py-6 text-center">No visits yet</p>
              )}
            </Panel>

            {/* ─── Speed ─── */}
            <Panel
              title="Speed, as visitors experienced it"
              action={<span className="flex items-center gap-1.5 text-xs text-bb-dim"><Gauge size={13} /> {summary?.speed.samples ? `${summary.speed.samples.toLocaleString()} page loads measured` : "No page loads measured yet"}</span>}
            >
              {summary && <SpeedCards speed={summary.speed} />}
              <p className="text-xs text-bb-dim mt-3">Each number is what three in four visitors got or better, measured in their own browser on the first page of a visit. Safari reports fewer of these than Chrome.</p>
              {slowPages.length > 0 && (
                <div className="mt-4">
                  <h3 className="text-xs text-bb-dim mb-2">Slowest pages to show their main content</h3>
                  <ul className="space-y-1">
                    {slowPages.map((r) => {
                      const rate = rating(r.lcp, [2500, 4000]);
                      return (
                        <li key={r.path}>
                          <button type="button" onClick={() => setPagePath(r.path)} className="flex w-full items-center justify-between gap-3 px-2.5 py-1.5 rounded hover:bg-bb-elevated text-left">
                            <span className="min-w-0 truncate text-sm text-white">{r.path}</span>
                            <span className={cn("shrink-0 text-sm tabular-nums", rate.tone)}>{speedText(r.lcp, "ms")} · {rate.word}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </Panel>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Panel title="Most clicked">
                <Ranked
                  empty="No clicks yet"
                  onPick={(key) => setPagePath(key.split("\u0000")[0])}
                  pickLabel="Open this page"
                  rows={(summary?.clicks || []).map((c) => ({ key: `${c.path}\u0000${c.selector}`, label: c.label || c.selector, count: c.count, hint: c.path }))}
                />
              </Panel>
              <Panel title="When people visit" action={<span className="text-xs text-bb-dim">Visits by weekday and hour, your time</span>}>
                {summary && (
                  <div className="overflow-x-auto">
                    <table className="w-full border-separate" style={{ borderSpacing: 2 }}>
                      <tbody>
                        {summary.week.map((hours, day) => (
                          <tr key={day}>
                            <th scope="row" className="pr-1 text-left text-[11px] font-normal text-bb-dim w-8">{DAYS[day]}</th>
                            {hours.map((n, hour) => (
                              <td key={hour} title={`${DAYS[day]} ${String(hour).padStart(2, "0")}:00, ${n} ${n === 1 ? "visit" : "visits"}`} className="h-4 min-w-2 rounded-sm" style={{ background: n ? `rgba(37,97,216,${0.2 + 0.8 * (n / weekMax)})` : "#1A1A1A" }} />
                            ))}
                          </tr>
                        ))}
                        <tr>
                          <td />
                          {Array.from({ length: 24 }, (_, hour) => (
                            <td key={hour} className="text-[10px] text-bb-dim text-center">{hour % 6 === 0 ? String(hour).padStart(2, "0") : ""}</td>
                          ))}
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}
              </Panel>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <Panel title="Countries">
                <Ranked empty="No visits yet" onPick={(key) => addFilter("country", key)} pickLabel="Show only these visits" rows={(summary?.countries || []).slice(0, 10).map((r) => ({ key: r.name, label: named(regionNames, r.name), count: r.count }))} />
              </Panel>
              <Panel
                title="Devices"
                action={<Tabs value={techTab} onChange={setTechTab} options={[{ key: "devices", label: "Type" }, { key: "browsers", label: "Browser" }, { key: "systems", label: "System" }]} />}
              >
                <Ranked
                  empty="No visits yet"
                  onPick={techTab === "devices" ? (key) => setDevice(key) : (key) => addFilter(techTab === "browsers" ? "browser" : "os", key)}
                  pickLabel="Show only these visits"
                  rows={(summary?.[techTab] || []).map((r) => ({ key: r.name, label: capital(r.name), count: r.count }))}
                />
                {t?.avgFold ? <p className="text-xs text-bb-dim mt-3">Average screen height (the fold): {t.avgFold}px</p> : null}
              </Panel>
              <Panel title="Languages" action={<Globe size={13} className="text-bb-dim" />}>
                <Ranked empty="No visits yet" onPick={(key) => addFilter("language", key)} pickLabel="Show only these visits" rows={(summary?.languages || []).slice(0, 10).map((r) => ({ key: r.name, label: capital(named(languageNames, r.name)), count: r.count }))} />
              </Panel>
            </div>

            {summary && (summary.hosts.length > 1 || summary.broken.length > 0) && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {summary.hosts.length > 1 && (
                  <Panel title="Addresses people used">
                    <Ranked empty="" onPick={(key) => addFilter("host", key)} pickLabel="Show only these visits" rows={summary.hosts.map((r) => ({ key: r.name, label: r.name, count: r.count }))} />
                  </Panel>
                )}
                {summary.broken.length > 0 && (
                  <Panel title="Broken pages people hit" action={<span className="text-xs text-bb-dim">Answered “not found”</span>}>
                    <Ranked empty="" rows={summary.broken.map((r) => ({ key: r.name, label: r.name, count: r.count }))} />
                  </Panel>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {addModal()}

      {/* ─── One page: heatmap link, speed, scroll depth, clicks per element ─── */}
      <Modal open={!!pagePath} onClose={() => setPagePath(null)} title={pagePath || ""} className="max-w-3xl">
        {!page ? (
          <div className="h-64 animate-pulse rounded bg-bb-elevated/40" />
        ) : (
          <div className="space-y-5">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                ["Views", page.views.toLocaleString()],
                ["Visitors", page.visitors.toLocaleString()],
                ["Clicks", page.clicks.toLocaleString()],
                ["Time on page", duration(page.avgMs)],
              ].map(([label, value]) => (
                <div key={label} className="bg-bb-black border border-bb-border rounded-md p-3">
                  <p className="text-xs text-bb-dim">{label}</p>
                  <p className="text-lg font-semibold text-white tabular-nums">{value}</p>
                </div>
              ))}
            </div>

            {page.heatUrl && <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-bb-black border border-bb-border rounded-md p-3">
              <p className="text-sm text-bb-muted">See click counts, the heatmap and scroll depth drawn on the real page.</p>
              <a href={page.heatUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-bb-blue hover:bg-bb-blue-light text-white text-sm font-medium rounded-md transition-colors shrink-0">
                <Flame size={15} /> Open heatmap on the live site <ExternalLink size={13} />
              </a>
            </div>}

            {(page.before.length > 0 || page.after.length > 0) && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <h3 className="text-sm font-semibold text-white mb-2">How people got to this page</h3>
                  <Ranked empty="No visits yet" rows={page.before.map((r) => ({ key: r.name, label: r.name, count: r.count }))} />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-white mb-2">Where they went next</h3>
                  <Ranked empty="No visits yet" rows={page.after.map((r) => ({ key: r.name, label: r.name, count: r.count }))} />
                </div>
              </div>
            )}

            <div>
              <h3 className="text-sm font-semibold text-white mb-2">Speed of this page</h3>
              <SpeedCards speed={page.speed} />
            </div>

            <div>
              <h3 className="text-sm font-semibold text-white mb-2">How far people scroll</h3>
              {page.views === 0 ? (
                <p className="text-sm text-bb-dim">No views in this period.</p>
              ) : (
                <ul className="space-y-1">
                  {page.reach.map((reached, i) => (
                    <li key={i} className="flex items-center gap-3 text-xs">
                      <span className="w-20 shrink-0 text-bb-dim">{i === 9 ? "Bottom" : `${(i + 1) * 10}% down`}</span>
                      <span className="flex-1 h-4 rounded bg-bb-elevated overflow-hidden"><span className="block h-full bg-bb-blue" style={{ width: `${reached}%` }} /></span>
                      <span className="w-10 shrink-0 text-right tabular-nums text-bb-muted">{reached}%</span>
                    </li>
                  ))}
                </ul>
              )}
              {page.avgFold ? <p className="text-xs text-bb-dim mt-2">Average fold: {page.avgFold}px</p> : null}
            </div>

            <div>
              <h3 className="text-sm font-semibold text-white mb-2">Clicks per element</h3>
              {page.elements.length === 0 ? (
                <p className="text-sm text-bb-dim">No clicks on this page in this period.</p>
              ) : (
                <ul className="divide-y divide-bb-border border border-bb-border rounded-md">
                  {page.elements.slice(0, 40).map((el) => (
                    <li key={el.selector} className="flex items-center justify-between gap-3 px-3 py-2">
                      <span className="min-w-0">
                        <span className="block text-sm text-white truncate">
                          {el.label || el.selector}
                          {/^<\w+>$/.test(el.label || "") && <span className="ml-2 px-1.5 py-0.5 rounded bg-amber-400/15 text-amber-400 text-[11px] font-normal">not a link or button</span>}
                        </span>
                        <span className="block text-xs text-bb-dim truncate font-mono" title={el.selector}>{el.href || el.selector}</span>
                      </span>
                      <span className="flex items-center gap-3 shrink-0">
                        <span className="text-right">
                          <span className="block text-sm font-semibold text-white tabular-nums">{el.count.toLocaleString()}</span>
                          <span className="block text-xs text-bb-dim tabular-nums">{pct(el.count / page.clicks)} of clicks</span>
                        </span>
                        {!ro && <button
                          onClick={() => addGoal({ name: `${el.label || "Click"} (${page.path})`.slice(0, 80), kind: "click", match: el.selector, path: page.path })}
                          className="px-2 py-1 text-xs border border-bb-border rounded hover:bg-bb-elevated text-bb-muted hover:text-white whitespace-nowrap"
                        >
                          Track as goal
                        </button>}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* ─── Campaign link builder ─── */}
      <Modal open={showLinks && !!site} onClose={() => setShowLinks(false)} title="Campaign link">
        {site && (
          <div className="space-y-4">
            <p className="text-xs text-bb-muted">Use this link in a post, an ad, an email or a QR code. Visits through it show up under their own source and campaign in “Where visitors come from”.</p>
            <label className="block">
              <span className="block text-xs text-bb-muted mb-1.5">Page on {site.domain}</span>
              <input className={input} list="bb-link-pages" value={link.path} onChange={(e) => setLink({ ...link, path: e.target.value })} placeholder="/" autoCapitalize="none" />
              <datalist id="bb-link-pages">{(summary?.pages || []).slice(0, 40).map((r) => <option key={r.path} value={r.path} />)}</datalist>
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="block">
                <span className="block text-xs text-bb-muted mb-1.5">Where it is posted</span>
                <input className={input} list="bb-link-sources" value={link.source} onChange={(e) => setLink({ ...link, source: e.target.value })} placeholder="instagram" autoCapitalize="none" />
                <datalist id="bb-link-sources">{["instagram", "facebook", "linkedin", "tiktok", "youtube", "google", "newsletter", "whatsapp", "qr-code", "flyer"].map((v) => <option key={v} value={v} />)}</datalist>
              </label>
              <label className="block">
                <span className="block text-xs text-bb-muted mb-1.5">Kind of placement</span>
                <input className={input} list="bb-link-mediums" value={link.medium} onChange={(e) => setLink({ ...link, medium: e.target.value })} placeholder="social" autoCapitalize="none" />
                <datalist id="bb-link-mediums">{["social", "cpc", "email", "bio", "story", "print", "referral"].map((v) => <option key={v} value={v} />)}</datalist>
              </label>
            </div>
            <label className="block">
              <span className="block text-xs text-bb-muted mb-1.5">Campaign name</span>
              <input className={input} value={link.campaign} onChange={(e) => setLink({ ...link, campaign: e.target.value })} placeholder="spring-launch" autoCapitalize="none" />
            </label>
            <div className="relative">
              <pre className="bg-bb-black border border-bb-border rounded-md p-3 pr-11 text-xs text-bb-gray font-mono whitespace-pre-wrap break-all">{campaignLink}</pre>
              <button onClick={() => copy(campaignLink, "Link")} aria-label="Copy the campaign link" className="absolute top-2 right-2 p-1.5 rounded text-bb-muted hover:text-white hover:bg-bb-elevated"><Copy size={14} /></button>
            </div>
            <p className="text-xs text-bb-dim">“cpc” counts as Paid ads and “email” as Email. Anything else is grouped by where it was posted.</p>
          </div>
        )}
      </Modal>

      {/* ─── Site setup ─── */}
      <Modal open={showSettings && !!site} onClose={() => setShowSettings(false)} title={site ? `${site.name} setup` : ""}>
        {site && (
          <div className="space-y-5">
            <p className="flex items-center gap-2 text-sm text-bb-muted">
              <span className={cn("inline-block w-2 h-2 rounded-full", !site.active ? "bg-amber-400" : site.lastSeen ? "bg-green-400" : "bg-bb-border")} aria-hidden />
              {!site.active ? "Tracking is paused." : site.lastSeen ? `Receiving data. Last visit ${ago(site.lastSeen)}.` : "Waiting for the first visit."}
            </p>

            <div>
              <h3 className="text-sm font-semibold text-white mb-1">Tracking line</h3>
              <p className="text-xs text-bb-muted mb-2">Paste this once into the site&apos;s main layout or its “custom code” box, just before the closing body tag. It covers every page, on any kind of website.</p>
              <div className="relative">
                <pre className="bg-bb-black border border-bb-border rounded-md p-3 pr-11 text-xs text-bb-gray font-mono whitespace-pre-wrap break-all">{snippet}</pre>
                <button onClick={() => copy(snippet, "Tracking line")} aria-label="Copy tracking line" className="absolute top-2 right-2 p-1.5 rounded text-bb-muted hover:text-white hover:bg-bb-elevated"><Copy size={14} /></button>
              </div>
              <p className="text-xs text-bb-dim mt-2">
                If the site has a Content-Security-Policy, allow <span className="font-mono">{origin}</span> under script-src and connect-src.
              </p>
            </div>

            <details className="group">
              <summary className="cursor-pointer text-sm font-semibold text-white">Count only after the visitor agrees</summary>
              <p className="text-xs text-bb-muted mt-2 mb-2">For sites with a cookie banner. Use this line instead; nothing is counted until the banner calls <span className="font-mono">bbConsent(true)</span>. <span className="font-mono">bbConsent(false)</span> stops it again.</p>
              <div className="relative">
                <pre className="bg-bb-black border border-bb-border rounded-md p-3 pr-11 text-xs text-bb-gray font-mono whitespace-pre-wrap break-all">{consentSnippet}</pre>
                <button onClick={() => copy(consentSnippet, "Tracking line")} aria-label="Copy the consent tracking line" className="absolute top-2 right-2 p-1.5 rounded text-bb-muted hover:text-white hover:bg-bb-elevated"><Copy size={14} /></button>
              </div>
            </details>

            <details className="group">
              <summary className="cursor-pointer text-sm font-semibold text-white">Count your own events</summary>
              <p className="text-xs text-bb-muted mt-2">Forms, outbound links, downloads, email and phone links are counted on their own. For anything else, mark the element or call it from code:</p>
              <pre className="bg-bb-black border border-bb-border rounded-md p-3 mt-2 text-xs text-bb-gray font-mono whitespace-pre-wrap break-all">{`<button data-bb-event="Booked a call">Book a call</button>\n\nbb("Signed up", { plan: "pro" })`}</pre>
            </details>

            <div>
              <h3 className="text-sm font-semibold text-white mb-1">Leave my own visits out</h3>
              <p className="text-xs text-bb-muted mb-2">Open this link once in each browser you use. That browser stops being counted.</p>
              <a href={`https://${site.domain}/#bb-ignore`} target="_blank" rel="noopener noreferrer" className="text-sm text-bb-accent hover:text-bb-accent-light break-all">
                https://{site.domain}/#bb-ignore
              </a>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-white mb-1">Share with the client</h3>
              <p className="text-xs text-bb-muted mb-2">A read-only page with these numbers that anyone holding the link can open, no login. Switch it off and the link stops working.</p>
              {site.shareToken ? (
                <div className="space-y-2">
                  <div className="relative">
                    <pre className="bg-bb-black border border-bb-border rounded-md p-3 pr-11 text-xs text-bb-gray font-mono whitespace-pre-wrap break-all">{`${origin}/stats/${site.shareToken}`}</pre>
                    <button onClick={() => copy(`${origin}/stats/${site.shareToken}`, "Link")} aria-label="Copy the client link" className="absolute top-2 right-2 p-1.5 rounded text-bb-muted hover:text-white hover:bg-bb-elevated"><Copy size={14} /></button>
                  </div>
                  <button onClick={() => patchSite({ share: false })} className="px-3 py-1.5 text-xs border border-bb-border rounded-md text-white hover:bg-bb-elevated">Switch the link off</button>
                </div>
              ) : (
                <button onClick={() => patchSite({ share: true })} className="px-3 py-1.5 text-xs border border-bb-border rounded-md text-white hover:bg-bb-elevated">Make a client link</button>
              )}
            </div>

            <label className="block">
              <span className="block text-sm font-semibold text-white mb-1.5">Client</span>
              <select className={cn(select, "w-full")} value={site.clientId || ""} onChange={(e) => patchSite({ clientId: e.target.value })}>
                <option value="">No client (our own site)</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}{c.company ? ` · ${c.company}` : ""}</option>
                ))}
              </select>
            </label>

            <div className="flex items-center justify-between gap-3 pt-3 border-t border-bb-border">
              <button onClick={() => patchSite({ active: !site.active })} className="px-3 py-2 text-sm border border-bb-border rounded-md text-white hover:bg-bb-elevated">
                {site.active ? "Pause tracking" : "Resume tracking"}
              </button>
              {isOwner && (
                <button onClick={deleteSite} className="flex items-center gap-1.5 px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 rounded-md">
                  <Trash2 size={14} /> Delete site and data
                </button>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
