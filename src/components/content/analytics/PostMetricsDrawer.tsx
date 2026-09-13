"use client";

import { useEffect, useState } from "react";
import { format } from "date-fns";
import { ExternalLink, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { readJson } from "@/lib/fetch-json";
import PlatformIcon, { getPlatformLabel } from "@/components/content/PlatformIcon";
import { compact, TrendChart } from "./charts";
import type { AnalyticsRow } from "./AnalyticsTab";

interface Snapshot {
  fetchedAt: string;
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saves: number | null;
  reach: number | null;
}

const METRICS = ["views", "likes", "comments", "shares", "saves"] as const;

export default function PostMetricsDrawer({ post, onClose }: { post: AnalyticsRow | null; onClose: () => void }) {
  const [snapshots, setSnapshots] = useState<Snapshot[] | null>(null);
  const [metric, setMetric] = useState<(typeof METRICS)[number]>("views");

  useEffect(() => {
    if (!post) return;
    setSnapshots(null);
    let cancelled = false;
    fetch(`/api/content-posts/${post.id}/metrics`)
      .then((r) => readJson<{ data: { snapshots: Snapshot[] } }>(r))
      .then((r) => !cancelled && setSnapshots(r.ok && r.data ? r.data.data.snapshots : []))
      .catch(() => !cancelled && setSnapshots([]));
    return () => {
      cancelled = true;
    };
  }, [post]);

  useEffect(() => {
    if (!post) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [post, onClose]);

  if (!post) return null;

  const series = (snapshots || []).map((s) => ({ date: s.fetchedAt, [metric]: s[metric] ?? 0 }));

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Post stats">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="absolute right-0 inset-y-0 w-full max-w-lg bg-bb-surface border-l border-bb-border overflow-y-auto animate-fade-in-up">
        <div className="flex items-start justify-between gap-3 p-4 border-b border-bb-border">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-xs text-bb-dim">
              <PlatformIcon platform={post.platform} size={12} /> {getPlatformLabel(post.platform)} · {post.clientName}
              {post.account ? ` · ${post.account}` : ""}
            </p>
            <h3 className="mt-1 text-base font-semibold text-white leading-snug">{post.title}</h3>
            <p className="mt-0.5 text-xs text-bb-dim">Published {format(new Date(post.publishedAt), "EEE MMM d, h:mm a")}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="p-1.5 rounded-lg bg-bb-elevated text-bb-muted hover:text-white cursor-pointer">
            <X size={15} />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div className="grid grid-cols-3 gap-2">
            {(["views", "likes", "comments", "shares", "saves"] as const).map((k) => (
              <div key={k} className="bg-bb-elevated/60 border border-bb-border rounded-lg px-3 py-2">
                <p className="text-[11px] text-bb-muted capitalize">{k}</p>
                <p className="text-lg font-semibold text-white tabular-nums">{compact(post[k])}</p>
              </div>
            ))}
            <div className="bg-bb-elevated/60 border border-bb-border rounded-lg px-3 py-2">
              <p className="text-[11px] text-bb-muted">Reach</p>
              <p className="text-lg font-semibold text-white tabular-nums">{compact(post.reach)}</p>
            </div>
          </div>

          <section>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <h4 className="text-sm font-semibold text-white capitalize">{metric} over time</h4>
              <div className="flex bg-bb-elevated rounded-lg p-0.5 border border-bb-border">
                {METRICS.map((m) => (
                  <button
                    key={m}
                    type="button"
                    aria-pressed={metric === m}
                    onClick={() => setMetric(m)}
                    className={cn(
                      "px-2 py-1 rounded-md text-[11px] font-medium capitalize transition-colors cursor-pointer",
                      metric === m ? "bg-bb-surface text-white" : "text-bb-muted hover:text-white"
                    )}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>
            {snapshots === null ? (
              <div className="flex items-center justify-center h-[200px] text-bb-dim">
                <Loader2 size={18} className="animate-spin" />
              </div>
            ) : snapshots.length < 2 ? (
              <p className="h-[120px] flex items-center justify-center text-xs text-bb-dim text-center px-6">
                The history builds as stats refresh: hourly for the first two days, then every few hours.
              </p>
            ) : (
              <TrendChart
                data={series}
                dataKey={metric}
                metricLabel={metric[0].toUpperCase() + metric.slice(1)}
                dateFormat="MMM d"
                tooltipDateFormat="MMM d, h:mm a"
                height={200}
              />
            )}
          </section>

          {post.externalUrl && (
            <a
              href={post.externalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm text-white bg-bb-elevated border border-bb-border hover:border-bb-muted transition-colors"
            >
              Open on {getPlatformLabel(post.platform)} <ExternalLink size={13} />
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
