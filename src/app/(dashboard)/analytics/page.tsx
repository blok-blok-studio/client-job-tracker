"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Plus, Settings, Users, Eye, Activity, LogOut, Timer, MousePointerClick, Flame, Copy, Target, Trash2, ArrowRight, ExternalLink,
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
  views24h: number;
}
interface Named { name: string; count: number }
interface PageRow { path: string; count: number; visitors: number; avgMs: number; avgScroll: number; entries: number; exits: number }
interface Goal { id: string; name: string; kind: string; match: string; path: string | null; conversions: number; rate: number }
interface Summary {
  hourly: boolean;
  truncated: boolean;
  totals: { visitors: number; sessions: number; pageviews: number; bounceRate: number; avgSessionMs: number; pagesPerSession: number; avgFold: number | null };
  series: { t: string; views: number; visitors: number }[];
  pages: PageRow[];
  sources: Named[];
  campaigns: Named[];
  countries: Named[];
  devices: Named[];
  browsers: Named[];
  systems: Named[];
  flow: { entries: Named[]; exits: Named[]; steps: { from: string; to: string; count: number }[] };
  clicks: { path: string; selector: string; label: string | null; count: number }[];
  goals: Goal[];
}
interface PageDetail {
  path: string;
  views: number;
  visitors: number;
  clicks: number;
  avgMs: number;
  avgFold: number | null;
  reach: number[];
  elements: { selector: string; label: string | null; href: string | null; count: number }[];
  heatUrl: string;
}
interface ClientOption { id: string; name: string; company: string | null }

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

const share = (n: number) => `${Math.round(n * 100)}%`;

function duration(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`;
}

const regionNames = typeof Intl !== "undefined" ? new Intl.DisplayNames(["en"], { type: "region" }) : null;
function country(code: string): string {
  try {
    return regionNames?.of(code) || code;
  } catch {
    return code;
  }
}

const card = "bg-bb-surface border border-bb-border rounded-lg";
const input = "w-full bg-bb-black border border-bb-border rounded-md px-3 py-2 text-sm text-white placeholder:text-bb-dim focus:outline-none focus:border-bb-blue";
const select = "bg-bb-surface border border-bb-border rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:border-bb-blue";

/** A ranked list where each row carries a bar sized to its share of the biggest row. */
function Ranked({
  rows, empty, onPick, format = (n) => n.toLocaleString(),
}: {
  rows: { key: string; label: React.ReactNode; count: number; hint?: string }[];
  empty: string;
  onPick?: (key: string) => void;
  format?: (n: number) => string;
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
                {r.hint && <span className="text-bb-dim mr-2">{r.hint}</span>}
                {format(r.count)}
              </span>
            </span>
          </>
        );
        return (
          <li key={r.key}>
            {onPick ? (
              <button type="button" onClick={() => onPick(r.key)} className="relative block w-full text-left rounded hover:bg-bb-elevated transition-colors">
                {inner}
              </button>
            ) : (
              <div className="relative rounded">{inner}</div>
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
      <div className="flex items-center justify-between gap-2 mb-3">
        <h2 className="text-sm font-semibold text-white">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function Tabs<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { key: T; label: string }[] }) {
  return (
    <div className="flex gap-1 bg-bb-black border border-bb-border rounded-md p-0.5">
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

export default function AnalyticsPage() {
  const { toast } = useToast();
  const [sites, setSites] = useState<Site[] | null>(null);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [siteId, setSiteId] = useState<string>("");
  const [range, setRange] = useState("7d");
  const [device, setDevice] = useState("all");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(false);
  const [metric, setMetric] = useState<"visitors" | "views">("visitors");
  const [sourceTab, setSourceTab] = useState<"sources" | "campaigns">("sources");
  const [techTab, setTechTab] = useState<"devices" | "browsers" | "systems">("devices");
  const [showAdd, setShowAdd] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [pagePath, setPagePath] = useState<string | null>(null);
  const [page, setPage] = useState<PageDetail | null>(null);
  const [isOwner, setIsOwner] = useState(false);
  const [form, setForm] = useState({ name: "", domain: "", clientId: "" });
  const [goalForm, setGoalForm] = useState({ name: "", match: "" });
  const [saving, setSaving] = useState(false);

  const site = useMemo(() => sites?.find((s) => s.id === siteId) || null, [sites, siteId]);
  const query = useMemo(
    () => `range=${range}&device=${device}&tz=${-new Date().getTimezoneOffset()}`,
    [range, device]
  );

  const loadSites = useCallback(async () => {
    try {
      const res = await fetch("/api/analytics/sites");
      const json = await res.json();
      if (!json.success) throw new Error();
      const list: Site[] = json.data;
      setSites(list);
      setSiteId((current) => {
        if (current && list.some((s) => s.id === current)) return current;
        // /analytics?site=<id> opens that site, /analytics?client=<id> that client's first site
        const params = new URLSearchParams(window.location.search);
        const site = params.get("site");
        const client = params.get("client");
        return (list.find((s) => site && s.id === site) || list.find((s) => client && s.clientId === client) || list[0])?.id || "";
      });
    } catch {
      setSites([]);
    }
  }, []);

  useEffect(() => {
    loadSites();
    fetch("/api/clients?type=ALL")
      .then((r) => r.json())
      .then((d) => d.success && setClients(d.data.map((c: ClientOption) => ({ id: c.id, name: c.name, company: c.company }))))
      .catch(() => {});
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setIsOwner(d?.user?.role === "OWNER"))
      .catch(() => {});
  }, [loadSites]);

  const loadSummary = useCallback(async () => {
    if (!siteId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/analytics/sites/${siteId}/summary?${query}`);
      const json = await res.json();
      setSummary(json.success ? json.data : null);
    } catch {
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, [siteId, query]);

  useEffect(() => {
    setSummary(null);
    loadSummary();
  }, [loadSummary]);

  useEffect(() => {
    if (!pagePath || !siteId) return;
    setPage(null);
    fetch(`/api/analytics/sites/${siteId}/page?path=${encodeURIComponent(pagePath)}&${query}`)
      .then((r) => r.json())
      .then((j) => j.success && setPage(j.data))
      .catch(() => {});
  }, [pagePath, siteId, query]);

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
      setSiteId(json.data.id);
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

  async function addGoal(goal: { name: string; kind: "click" | "page"; match: string; path?: string }) {
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

  async function removeGoal(id: string) {
    await fetch(`/api/analytics/goals/${id}`, { method: "DELETE" });
    loadSummary();
  }

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const snippet = site ? `<script defer src="${origin}/bb.js" data-site="${site.key}"></script>` : "";
  const copy = (text: string, what: string) =>
    navigator.clipboard.writeText(text).then(() => toast(`${what} copied`, "success")).catch(() => toast("Could not copy", "error"));

  const t = summary?.totals;
  const tiles = [
    { label: "Visitors", value: t ? compact(t.visitors) : "–", icon: Users },
    { label: "Visits", value: t ? compact(t.sessions) : "–", icon: Activity },
    { label: "Page views", value: t ? compact(t.pageviews) : "–", icon: Eye },
    { label: "Bounce rate", value: t && t.sessions ? share(t.bounceRate) : "–", icon: LogOut },
    { label: "Time per visit", value: t && t.sessions ? duration(t.avgSessionMs) : "–", icon: Timer },
    { label: "Pages per visit", value: t && t.sessions ? t.pagesPerSession.toFixed(1) : "–", icon: MousePointerClick },
  ];

  // ─── No sites yet ───
  if (sites && sites.length === 0) {
    return (
      <div>
        <TopBar title="Analytics" subtitle="Traffic, clicks and heatmaps for the websites we build" />
        <div className="px-4 lg:px-6">
          <div className={cn(card, "p-8 text-center max-w-xl mx-auto mt-8")}>
            <Flame size={28} className="text-bb-accent mx-auto mb-3" />
            <h2 className="text-lg font-display font-semibold text-white mb-2">No websites tracked yet</h2>
            <p className="text-sm text-bb-muted mb-5">
              Add a site, paste one line into its code, and visits start showing here. No cookies, so no consent banner.
            </p>
            <button onClick={() => setShowAdd(true)} className="inline-flex items-center gap-2 px-4 py-2 bg-bb-blue hover:bg-bb-blue-light text-white text-sm font-medium rounded-md transition-colors">
              <Plus size={16} /> Add a website
            </button>
          </div>
        </div>
        {addModal()}
      </div>
    );
  }

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
            <span className="block text-xs text-bb-dim mt-1.5">Without www. Subdomains are counted too.</span>
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

  return (
    <div>
      <TopBar title="Analytics" subtitle="Traffic, clicks and heatmaps for the websites we build" />
      <div className="px-4 lg:px-6 pb-10 space-y-4">
        {/* ─── Controls ─── */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <select aria-label="Website" className={cn(select, "min-w-0 flex-1 lg:flex-none lg:min-w-64")} value={siteId} onChange={(e) => setSiteId(e.target.value)}>
              {(sites || []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}{s.client ? ` · ${s.client.name}` : ""}{s.active ? "" : " (paused)"}
                </option>
              ))}
            </select>
            <button onClick={() => setShowSettings(true)} disabled={!site} aria-label="Site setup" title="Site setup" className="p-2 rounded-md border border-bb-border text-bb-muted hover:text-white hover:bg-bb-elevated transition-colors shrink-0">
              <Settings size={16} />
            </button>
            <button onClick={() => setShowAdd(true)} className="flex items-center gap-1.5 px-3 py-2 bg-bb-blue hover:bg-bb-blue-light text-white text-sm font-medium rounded-md transition-colors shrink-0">
              <Plus size={16} /> <span className="hidden sm:inline">Add website</span>
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Tabs value={range} onChange={setRange} options={RANGES} />
            <select aria-label="Device" className={cn(select, "py-1.5 text-xs shrink-0")} value={device} onChange={(e) => setDevice(e.target.value)}>
              {DEVICES.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
            </select>
          </div>
        </div>

        {site && site.views24h === 0 && summary && summary.totals.pageviews === 0 && (
          <div className={cn(card, "p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3")}>
            <p className="text-sm text-bb-muted">
              Nothing recorded for <span className="text-white">{site.domain}</span> in this period. If the site is new here, add the tracking line to its code.
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
          {/* ─── Pages ─── */}
          <Panel title="Top pages" action={<span className="text-xs text-bb-dim">Pick a page for clicks and heatmap</span>}>
            <Ranked
              empty="No page views yet"
              onPick={setPagePath}
              rows={(summary?.pages || []).slice(0, 12).map((p) => ({ key: p.path, label: p.path, count: p.count, hint: `${p.avgScroll}% scrolled · ${duration(p.avgMs)}` }))}
            />
          </Panel>

          {/* ─── Sources ─── */}
          <Panel
            title="Where visitors come from"
            action={<Tabs value={sourceTab} onChange={setSourceTab} options={[{ key: "sources", label: "Sources" }, { key: "campaigns", label: "Campaigns" }]} />}
          >
            <Ranked
              empty={sourceTab === "sources" ? "No visits yet" : "No links with utm_campaign yet"}
              rows={(summary?.[sourceTab] || []).map((r) => ({ key: r.name, label: r.name, count: r.count }))}
            />
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
          {/* ─── Clicks ─── */}
          <Panel title="Most clicked">
            <Ranked
              empty="No clicks yet"
              onPick={(key) => setPagePath(key.split("\u0000")[0])}
              rows={(summary?.clicks || []).map((c) => ({ key: `${c.path}\u0000${c.selector}`, label: c.label || c.selector, count: c.count, hint: c.path }))}
            />
          </Panel>

          {/* ─── Goals ─── */}
          <Panel title="Goals" action={<span className="text-xs text-bb-dim">Share of visits that did it</span>}>
            {summary?.goals.length ? (
              <ul className="space-y-1 mb-4">
                {summary.goals.map((g) => (
                  <li key={g.id} className="flex items-center justify-between gap-3 px-2.5 py-2 rounded bg-bb-black border border-bb-border">
                    <span className="min-w-0">
                      <span className="block text-sm text-white truncate">{g.name}</span>
                      <span className="block text-xs text-bb-dim truncate">{g.kind === "page" ? `Visits ${g.match}` : `Click${g.path ? ` on ${g.path}` : ""}`}</span>
                    </span>
                    <span className="flex items-center gap-3 shrink-0">
                      <span className="text-right">
                        <span className="block text-sm font-semibold text-white tabular-nums">{(g.rate * 100).toFixed(g.rate > 0 && g.rate < 0.1 ? 1 : 0)}%</span>
                        <span className="block text-xs text-bb-dim tabular-nums">{g.conversions.toLocaleString()} visits</span>
                      </span>
                      <button onClick={() => removeGoal(g.id)} aria-label={`Remove goal ${g.name}`} className="p-1.5 rounded text-bb-dim hover:text-red-400 hover:bg-bb-elevated"><Trash2 size={14} /></button>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-bb-dim mb-4">No goals yet. Open a page and choose “Track as goal” on a button, or add a page below.</p>
            )}
            <form
              className="flex flex-col sm:flex-row gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                addGoal({ name: goalForm.name || `Reached ${goalForm.match}`, kind: "page", match: goalForm.match });
              }}
            >
              <input className={input} aria-label="Goal name" placeholder="Name, e.g. Saw thank-you page" value={goalForm.name} onChange={(e) => setGoalForm({ ...goalForm, name: e.target.value })} />
              <input className={input} aria-label="Page path" placeholder="/thanks or /blog/*" value={goalForm.match} onChange={(e) => setGoalForm({ ...goalForm, match: e.target.value })} required />
              <button type="submit" className="flex items-center justify-center gap-1.5 px-3 py-2 border border-bb-border hover:bg-bb-elevated text-white text-sm rounded-md shrink-0"><Target size={14} /> Add</button>
            </form>
          </Panel>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Panel title="Countries">
            <Ranked empty="No visits yet" rows={(summary?.countries || []).map((r) => ({ key: r.name, label: country(r.name), count: r.count }))} />
          </Panel>
          <Panel
            title="Devices"
            action={<Tabs value={techTab} onChange={setTechTab} options={[{ key: "devices", label: "Type" }, { key: "browsers", label: "Browser" }, { key: "systems", label: "System" }]} />}
          >
            <Ranked empty="No visits yet" rows={(summary?.[techTab] || []).map((r) => ({ key: r.name, label: r.name.charAt(0).toUpperCase() + r.name.slice(1), count: r.count }))} />
            {t?.avgFold ? <p className="text-xs text-bb-dim mt-3">Average screen height (the fold): {t.avgFold}px</p> : null}
          </Panel>
        </div>
      </div>

      {addModal()}

      {/* ─── One page: heatmap link, scroll depth, clicks per element ─── */}
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

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-bb-black border border-bb-border rounded-md p-3">
              <p className="text-sm text-bb-muted">See click counts, the heatmap and scroll depth drawn on the real page.</p>
              <a href={page.heatUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-bb-blue hover:bg-bb-blue-light text-white text-sm font-medium rounded-md transition-colors shrink-0">
                <Flame size={15} /> Open heatmap on the live site <ExternalLink size={13} />
              </a>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-white mb-2">How far people scroll</h3>
              {page.views === 0 ? (
                <p className="text-sm text-bb-dim">No views in this period.</p>
              ) : (
                <ul className="space-y-1">
                  {page.reach.map((share, i) => (
                    <li key={i} className="flex items-center gap-3 text-xs">
                      <span className="w-20 shrink-0 text-bb-dim">{i === 9 ? "Bottom" : `${(i + 1) * 10}% down`}</span>
                      <span className="flex-1 h-4 rounded bg-bb-elevated overflow-hidden"><span className="block h-full bg-bb-blue" style={{ width: `${share}%` }} /></span>
                      <span className="w-10 shrink-0 text-right tabular-nums text-bb-muted">{share}%</span>
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
                        <span className="block text-sm text-white truncate">{el.label || el.selector}</span>
                        <span className="block text-xs text-bb-dim truncate font-mono" title={el.selector}>{el.href || el.selector}</span>
                      </span>
                      <span className="flex items-center gap-3 shrink-0">
                        <span className="text-right">
                          <span className="block text-sm font-semibold text-white tabular-nums">{el.count.toLocaleString()}</span>
                          <span className="block text-xs text-bb-dim tabular-nums">{share(el.count / page.clicks)} of clicks</span>
                        </span>
                        <button
                          onClick={() => addGoal({ name: `${el.label || "Click"} (${page.path})`.slice(0, 80), kind: "click", match: el.selector, path: page.path })}
                          className="px-2 py-1 text-xs border border-bb-border rounded hover:bg-bb-elevated text-bb-muted hover:text-white whitespace-nowrap"
                        >
                          Track as goal
                        </button>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* ─── Site setup ─── */}
      <Modal open={showSettings && !!site} onClose={() => setShowSettings(false)} title={site ? `${site.name} setup` : ""}>
        {site && (
          <div className="space-y-5">
            <div>
              <h3 className="text-sm font-semibold text-white mb-1">Tracking line</h3>
              <p className="text-xs text-bb-muted mb-2">Paste this once into the site&apos;s main layout, just before the closing body tag. It covers every page.</p>
              <div className="relative">
                <pre className="bg-bb-black border border-bb-border rounded-md p-3 pr-11 text-xs text-bb-gray font-mono whitespace-pre-wrap break-all">{snippet}</pre>
                <button onClick={() => copy(snippet, "Tracking line")} aria-label="Copy tracking line" className="absolute top-2 right-2 p-1.5 rounded text-bb-muted hover:text-white hover:bg-bb-elevated"><Copy size={14} /></button>
              </div>
              <p className="text-xs text-bb-dim mt-2">
                If the site has a Content-Security-Policy, allow <span className="font-mono">{origin}</span> under script-src and connect-src.
              </p>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-white mb-1">Leave my own visits out</h3>
              <p className="text-xs text-bb-muted mb-2">Open this link once in each browser you use. That browser stops being counted.</p>
              <a href={`https://${site.domain}/#bb-ignore`} target="_blank" rel="noopener noreferrer" className="text-sm text-bb-accent hover:text-bb-accent-light break-all">
                https://{site.domain}/#bb-ignore
              </a>
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
