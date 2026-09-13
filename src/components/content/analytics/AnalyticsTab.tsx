"use client";

import { useEffect, useMemo, useState } from "react";
import { format, formatDistanceToNowStrict, parseISO, subDays } from "date-fns";
import { BarChart3, ExternalLink, Film, Loader2, RefreshCw, Table2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { readJson } from "@/lib/fetch-json";
import { optimizedThumb } from "@/lib/media-thumb";
import PlatformIcon, { getPlatformLabel } from "@/components/content/PlatformIcon";
import { BarList, compact, pct, TrendChart } from "./charts";
import PostMetricsDrawer from "./PostMetricsDrawer";

interface Numbers {
  views: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  interactions: number;
}

export interface AnalyticsRow extends Numbers {
  id: string;
  title: string;
  platform: string;
  clientId: string;
  clientName: string;
  account: string | null;
  avatarUrl: string | null;
  thumbUrl: string | null;
  externalUrl: string | null;
  publishedAt: string;
  metricsUpdatedAt: string | null;
  reach: number | null;
  engagementRate: number | null;
}

interface AnalyticsData {
  range: { from: string; to: string; tz: string };
  postsPublished: number;
  postsWithStats: number;
  manualPosts: number;
  lastUpdated: string | null;
  totals: Numbers & { engagementRate: number | null };
  byPlatform: (Numbers & { platform: string; posts: number; postsWithStats: number; engagementRate: number | null })[];
  daily: (Numbers & { date: string; posts: number })[];
  topPosts: AnalyticsRow[];
  posts: AnalyticsRow[];
}

const RANGES = [
  { key: "7", label: "Last 7 days", days: 7 },
  { key: "30", label: "Last 30 days", days: 30 },
  { key: "90", label: "Last 90 days", days: 90 },
];

const METRICS = [
  { key: "views", label: "Views" },
  { key: "interactions", label: "Interactions" },
  { key: "posts", label: "Posts" },
] as const;

type SortKey = "publishedAt" | "views" | "likes" | "comments" | "shares" | "engagementRate";

export default function AnalyticsTab({ clients }: { clients: { id: string; name: string }[] }) {
  const [range, setRange] = useState("30");
  const [clientId, setClientId] = useState("");
  const [platform, setPlatform] = useState("");
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [metric, setMetric] = useState<(typeof METRICS)[number]["key"]>("views");
  const [showTable, setShowTable] = useState(false);
  const [sort, setSort] = useState<{ key: SortKey; dir: -1 | 1 }>({ key: "views", dir: -1 });
  const [openPost, setOpenPost] = useState<AnalyticsRow | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const days = RANGES.find((r) => r.key === range)?.days || 30;
    const params = new URLSearchParams({
      from: subDays(new Date(), days).toISOString(),
      to: new Date().toISOString(),
      tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
    if (clientId) params.set("clientId", clientId);
    if (platform) params.set("platform", platform);

    let cancelled = false;
    setLoading(true);
    fetch(`/api/content-posts/analytics?${params}`)
      .then((r) => readJson<{ data: AnalyticsData }>(r, "Couldn't load stats."))
      .then((r) => {
        if (cancelled) return;
        if (r.ok && r.data) {
          setData(r.data.data);
          setError(null);
        } else setError(r.error);
      })
      .catch(() => !cancelled && setError("Couldn't load stats."))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [range, clientId, platform, reload]);

  const rows = useMemo(() => {
    const list = [...(data?.posts || [])];
    list.sort((a, b) => {
      const av = sort.key === "publishedAt" ? new Date(a.publishedAt).getTime() : (a[sort.key] ?? -1);
      const bv = sort.key === "publishedAt" ? new Date(b.publishedAt).getTime() : (b[sort.key] ?? -1);
      return ((av as number) - (bv as number)) * sort.dir;
    });
    return list;
  }, [data, sort]);

  const selectClass =
    "bg-bb-elevated border border-bb-border rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-bb-orange/60 cursor-pointer";

  const empty = data && data.postsWithStats === 0;

  return (
    <div className="space-y-4">
      {/* Filters: one row, date range first */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex bg-bb-elevated rounded-lg p-0.5 border border-bb-border">
          {RANGES.map((r) => (
            <button
              key={r.key}
              type="button"
              aria-pressed={range === r.key}
              onClick={() => setRange(r.key)}
              className={cn(
                "px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer",
                range === r.key ? "bg-bb-surface text-white shadow-card" : "text-bb-muted hover:text-white"
              )}
            >
              {r.label}
            </button>
          ))}
        </div>
        <select aria-label="Client" value={clientId} onChange={(e) => setClientId(e.target.value)} className={selectClass}>
          <option value="">All clients</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select aria-label="Platform" value={platform} onChange={(e) => setPlatform(e.target.value)} className={selectClass}>
          <option value="">All platforms</option>
          {["INSTAGRAM", "TIKTOK", "YOUTUBE"].map((p) => (
            <option key={p} value={p}>
              {getPlatformLabel(p)}
            </option>
          ))}
        </select>
        <span className="ml-auto flex items-center gap-2 text-[11px] text-bb-dim">
          Stats refresh hourly
          {data?.lastUpdated && <> · updated {formatDistanceToNowStrict(new Date(data.lastUpdated), { addSuffix: true })}</>}
          <button
            type="button"
            onClick={() => setReload((n) => n + 1)}
            aria-label="Reload stats"
            className="p-1 rounded text-bb-dim hover:text-white cursor-pointer"
          >
            <RefreshCw size={12} />
          </button>
        </span>
      </div>

      {error && <p className="text-sm text-red-300">{error}</p>}

      {!data && loading ? (
        <div className="flex items-center justify-center py-20 text-bb-dim">
          <Loader2 className="animate-spin" size={20} />
        </div>
      ) : data ? (
        <div className={cn("space-y-4 transition-opacity", loading && "opacity-60")}>
          {/* KPI row: views is the hero */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Tile label="Views" value={compact(data.totals.views)} hero sub={`${data.postsWithStats} of ${data.postsPublished} posts have stats`} />
            <Tile label="Interactions" value={compact(data.totals.interactions)} sub="Likes, comments, shares, saves" />
            <Tile label="Engagement rate" value={pct(data.totals.engagementRate)} sub="Interactions per view" />
            <Tile label="Posts published" value={String(data.postsPublished)} sub={data.manualPosts ? `${data.manualPosts} posted by hand` : "In this range"} />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <MiniTile label="Likes" value={data.totals.likes} />
            <MiniTile label="Comments" value={data.totals.comments} />
            <MiniTile label="Shares" value={data.totals.shares} />
            <MiniTile label="Saves" value={data.totals.saves} />
          </div>

          {empty && (
            <div className="bg-bb-surface border border-bb-border rounded-xl p-6 text-center">
              <BarChart3 size={22} className="mx-auto text-bb-dim" />
              <p className="mt-2 text-sm text-white">No stats yet for this range.</p>
              <p className="mt-1 text-xs text-bb-dim max-w-md mx-auto">
                Stats show up about an hour after a post publishes through a connected Instagram, TikTok, or YouTube account.
                Posts made by hand (like RedNote) don&apos;t report stats.
              </p>
            </div>
          )}

          <div className="grid gap-4 lg:grid-cols-3">
            {/* Trend */}
            <section className="lg:col-span-2 bg-bb-surface border border-bb-border rounded-xl p-4">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <div>
                  <h3 className="text-sm font-semibold text-white">{METRICS.find((m) => m.key === metric)?.label} by publish day</h3>
                  <p className="text-[11px] text-bb-dim">Each post&apos;s latest totals, counted on the day it went out</p>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex bg-bb-elevated rounded-lg p-0.5 border border-bb-border">
                    {METRICS.map((m) => (
                      <button
                        key={m.key}
                        type="button"
                        aria-pressed={metric === m.key}
                        onClick={() => setMetric(m.key)}
                        className={cn(
                          "px-2 py-1 rounded-md text-[11px] font-medium transition-colors cursor-pointer",
                          metric === m.key ? "bg-bb-surface text-white" : "text-bb-muted hover:text-white"
                        )}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    aria-pressed={showTable}
                    onClick={() => setShowTable((s) => !s)}
                    className={cn(
                      "p-1.5 rounded-lg border transition-colors cursor-pointer",
                      showTable ? "text-white border-bb-muted" : "text-bb-dim border-bb-border hover:text-white"
                    )}
                    aria-label="Show as table"
                    title="Show as table"
                  >
                    <Table2 size={13} />
                  </button>
                </div>
              </div>
              {showTable ? (
                <div className="max-h-[240px] overflow-auto">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-bb-surface">
                      <tr className="text-bb-dim text-left">
                        <th className="py-1 font-medium">Day</th>
                        <th className="py-1 font-medium text-right">Posts</th>
                        <th className="py-1 font-medium text-right">Views</th>
                        <th className="py-1 font-medium text-right">Interactions</th>
                      </tr>
                    </thead>
                    <tbody className="tabular-nums">
                      {data.daily.map((d) => (
                        <tr key={d.date} className="border-t border-bb-border/50">
                          <td className="py-1 text-bb-muted">{format(parseISO(d.date), "EEE MMM d")}</td>
                          <td className="py-1 text-right text-white">{d.posts}</td>
                          <td className="py-1 text-right text-white">{d.views.toLocaleString()}</td>
                          <td className="py-1 text-right text-white">{d.interactions.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <TrendChart data={data.daily as unknown as Record<string, unknown>[]} dataKey={metric} metricLabel={METRICS.find((m) => m.key === metric)!.label} />
              )}
            </section>

            {/* Platform breakdown */}
            <section className="bg-bb-surface border border-bb-border rounded-xl p-4">
              <h3 className="text-sm font-semibold text-white">Views by platform</h3>
              <p className="text-[11px] text-bb-dim mb-3">With engagement rate</p>
              {data.byPlatform.length === 0 ? (
                <p className="text-xs text-bb-dim">Nothing published in this range.</p>
              ) : (
                <BarList
                  valueLabel="views"
                  rows={data.byPlatform.map((p) => ({
                    key: p.platform,
                    value: p.views,
                    detail: `${pct(p.engagementRate)} eng.`,
                    label: (
                      <>
                        <PlatformIcon platform={p.platform} size={12} />
                        {getPlatformLabel(p.platform)}
                        <span className="text-bb-dim">
                          ({p.posts} post{p.posts === 1 ? "" : "s"})
                        </span>
                      </>
                    ),
                  }))}
                />
              )}
            </section>
          </div>

          {/* Posts table */}
          <section className="bg-bb-surface border border-bb-border rounded-xl">
            <div className="px-4 py-3 border-b border-bb-border">
              <h3 className="text-sm font-semibold text-white">Post performance</h3>
              <p className="text-[11px] text-bb-dim">Click a post for its stats over time</p>
            </div>
            {rows.length === 0 ? (
              <p className="px-4 py-8 text-center text-xs text-bb-dim">No posts with stats in this range.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm">
                  <thead>
                    <tr className="text-left text-[11px] uppercase tracking-wide text-bb-dim">
                      <th className="px-4 py-2 font-medium">Post</th>
                      <SortTh label="Published" k="publishedAt" sort={sort} setSort={setSort} />
                      <SortTh label="Views" k="views" sort={sort} setSort={setSort} right />
                      <SortTh label="Likes" k="likes" sort={sort} setSort={setSort} right />
                      <SortTh label="Comments" k="comments" sort={sort} setSort={setSort} right />
                      <SortTh label="Shares" k="shares" sort={sort} setSort={setSort} right />
                      <SortTh label="Eng." k="engagementRate" sort={sort} setSort={setSort} right />
                    </tr>
                  </thead>
                  <tbody className="tabular-nums">
                    {rows.map((r) => (
                      <tr
                        key={r.id}
                        onClick={() => setOpenPost(r)}
                        className="border-t border-bb-border/60 hover:bg-bb-elevated/50 cursor-pointer transition-colors"
                      >
                        <td className="px-4 py-2">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span className="w-9 h-9 rounded-md overflow-hidden bg-bb-elevated border border-bb-border shrink-0 flex items-center justify-center">
                              {r.thumbUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={optimizedThumb(r.thumbUrl, 256)} alt="" className="w-full h-full object-cover" loading="lazy" />
                              ) : (
                                <Film size={13} className="text-bb-dim" />
                              )}
                            </span>
                            <span className="min-w-0">
                              <span className="block text-white truncate max-w-[16rem]">{r.title}</span>
                              <span className="flex items-center gap-1 text-[11px] text-bb-dim">
                                <PlatformIcon platform={r.platform} size={10} />
                                <span className="truncate max-w-[12rem]">
                                  {r.clientName}
                                  {r.account ? ` · ${r.account}` : ""}
                                </span>
                                {r.externalUrl && (
                                  <a
                                    href={r.externalUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={(e) => e.stopPropagation()}
                                    className="text-bb-muted hover:text-white"
                                    aria-label="Open on platform"
                                  >
                                    <ExternalLink size={10} />
                                  </a>
                                )}
                              </span>
                            </span>
                          </div>
                        </td>
                        <td className="px-3 py-2 text-xs text-bb-muted whitespace-nowrap">{format(new Date(r.publishedAt), "MMM d")}</td>
                        <td className="px-3 py-2 text-right text-white">{r.views.toLocaleString()}</td>
                        <td className="px-3 py-2 text-right text-bb-muted">{r.likes.toLocaleString()}</td>
                        <td className="px-3 py-2 text-right text-bb-muted">{r.comments.toLocaleString()}</td>
                        <td className="px-3 py-2 text-right text-bb-muted">{r.shares.toLocaleString()}</td>
                        <td className="px-3 py-2 text-right text-bb-muted">{pct(r.engagementRate)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      ) : null}

      <PostMetricsDrawer post={openPost} onClose={() => setOpenPost(null)} />
    </div>
  );
}

function Tile({ label, value, sub, hero = false }: { label: string; value: string; sub?: string; hero?: boolean }) {
  return (
    <div className="bg-bb-surface border border-bb-border rounded-xl p-4">
      <p className="text-xs text-bb-muted">{label}</p>
      <p className={cn("mt-1 font-semibold text-white tabular-nums", hero ? "text-3xl sm:text-4xl" : "text-2xl")}>{value}</p>
      {sub && <p className="mt-1 text-[11px] text-bb-dim">{sub}</p>}
    </div>
  );
}

function MiniTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-bb-surface border border-bb-border rounded-lg px-3 py-2 flex items-baseline justify-between gap-2">
      <span className="text-xs text-bb-muted">{label}</span>
      <span className="text-sm font-semibold text-white tabular-nums">{compact(value)}</span>
    </div>
  );
}

function SortTh({
  label,
  k,
  sort,
  setSort,
  right = false,
}: {
  label: string;
  k: SortKey;
  sort: { key: SortKey; dir: -1 | 1 };
  setSort: (s: { key: SortKey; dir: -1 | 1 }) => void;
  right?: boolean;
}) {
  const active = sort.key === k;
  return (
    <th className={cn("px-3 py-2 font-medium", right && "text-right")} aria-sort={active ? (sort.dir === 1 ? "ascending" : "descending") : "none"}>
      <button
        type="button"
        onClick={() => setSort({ key: k, dir: active ? ((sort.dir * -1) as -1 | 1) : -1 })}
        className={cn("uppercase tracking-wide cursor-pointer transition-colors", active ? "text-white" : "hover:text-bb-muted")}
      >
        {label}
        {active ? (sort.dir === -1 ? " ↓" : " ↑") : ""}
      </button>
    </th>
  );
}
