"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { format, formatDistanceToNowStrict } from "date-fns";
import { CheckCircle2, Clock, Link2, Loader2, PlugZap, RefreshCw, Unplug, Youtube } from "lucide-react";
import { cn } from "@/lib/utils";
import { readJson } from "@/lib/fetch-json";
import PlatformIcon, { getPlatformLabel } from "@/components/content/PlatformIcon";

interface Connection {
  id: string;
  clientId: string;
  clientName: string;
  platform: string;
  label: string | null;
  username: string | null;
  avatarUrl: string | null;
  provider: string | null;
  expiresAt: string | null;
  health: "ok" | "expiring" | "expired" | "needs_reconnect" | "unknown";
  reconnectProvider: string | null;
}

interface Quota {
  used: number;
  limit: number;
  resetsAt: string;
  uploadsLeft: number;
}

const PROVIDERS: { key: string; label: string; platform: string; hint: string }[] = [
  { key: "meta", label: "Instagram via Facebook", platform: "INSTAGRAM", hint: "Instagram linked to a Facebook Page, plus Facebook Pages" },
  { key: "instagram", label: "Instagram (direct)", platform: "INSTAGRAM", hint: "Business or Creator account, no Page needed" },
  { key: "tiktok", label: "TikTok", platform: "TIKTOK", hint: "Videos and photo posts" },
  { key: "google", label: "YouTube", platform: "YOUTUBE", hint: "Shorts and long videos" },
  { key: "linkedin", label: "LinkedIn", platform: "LINKEDIN", hint: "Profile posts" },
  { key: "twitter", label: "X", platform: "TWITTER", hint: "Posts with media" },
  { key: "threads", label: "Threads", platform: "THREADS", hint: "Text, images, video" },
];

const HEALTH: Record<Connection["health"], { label: string; className: string; icon: typeof CheckCircle2 }> = {
  ok: { label: "Connected", className: "text-emerald-300 bg-emerald-500/10 border-emerald-500/25", icon: CheckCircle2 },
  expiring: { label: "Expiring soon", className: "text-yellow-300 bg-yellow-500/10 border-yellow-500/25", icon: Clock },
  expired: { label: "Expired", className: "text-red-300 bg-red-500/10 border-red-500/25", icon: Unplug },
  needs_reconnect: { label: "Needs reconnect", className: "text-red-300 bg-red-500/10 border-red-500/25", icon: Unplug },
  unknown: { label: "Saved login", className: "text-bb-muted bg-bb-elevated border-bb-border", icon: Link2 },
};

function authorizeUrl(provider: string, clientId: string) {
  // The OAuth callback redirects to returnTo as an absolute URL
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const returnTo = encodeURIComponent(`${origin}/content?tab=connections`);
  return `/api/oauth/${provider}/authorize?clientId=${encodeURIComponent(clientId)}&returnTo=${returnTo}`;
}

/** Guess a provider from the platform for rows that don't report one. */
function fallbackProvider(platform: string): string | null {
  const p = platform.toUpperCase();
  if (p.includes("INSTAGRAM") || p.includes("FACEBOOK")) return "meta";
  if (p.includes("TIKTOK")) return "tiktok";
  if (p.includes("YOUTUBE") || p.includes("GOOGLE")) return "google";
  if (p.includes("LINKEDIN")) return "linkedin";
  if (p.includes("THREADS")) return "threads";
  if (p.includes("TWITTER") || p === "X") return "twitter";
  return null;
}

function platformKey(platform: string) {
  const p = platform.toUpperCase();
  if (p.includes("INSTAGRAM")) return "INSTAGRAM";
  if (p.includes("FACEBOOK")) return "FACEBOOK";
  if (p.includes("TIKTOK")) return "TIKTOK";
  if (p.includes("YOUTUBE")) return "YOUTUBE";
  if (p.includes("LINKEDIN")) return "LINKEDIN";
  if (p.includes("THREADS")) return "THREADS";
  if (p.includes("TWITTER") || p === "X") return "TWITTER";
  return p;
}

export default function ConnectionsTab({ clients }: { clients: { id: string; name: string }[] }) {
  const [connections, setConnections] = useState<Connection[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [quota, setQuota] = useState<Quota | null>(null);
  const [connectClient, setConnectClient] = useState("");

  const load = useCallback(async () => {
    setError(null);
    const res = await fetch("/api/social/connections").catch(() => null);
    if (!res) {
      setError("Couldn't load connections.");
      setConnections([]);
      return;
    }
    const result = await readJson<{ data: Connection[] }>(res, "Couldn't load connections.");
    if (!result.ok || !result.data) {
      setError(result.error);
      setConnections([]);
      return;
    }
    setConnections(result.data.data);
  }, []);

  useEffect(() => {
    load();
    fetch("/api/social/youtube/quota")
      .then((r) => readJson<{ data: Quota }>(r))
      .then((r) => {
        if (r.ok && r.data) setQuota(r.data.data);
      })
      .catch(() => {});
  }, [load]);

  const byClient = useMemo(() => {
    const map = new Map<string, { name: string; rows: Connection[] }>();
    for (const c of connections || []) {
      const entry = map.get(c.clientId) || { name: c.clientName, rows: [] };
      entry.rows.push(c);
      map.set(c.clientId, entry);
    }
    return [...map.entries()].sort((a, b) => a[1].name.localeCompare(b[1].name));
  }, [connections]);

  const problems = (connections || []).filter((c) => c.health === "expired" || c.health === "needs_reconnect").length;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-[1fr_minmax(0,22rem)]">
        {/* Connect */}
        <section className="bg-bb-surface border border-bb-border rounded-xl p-4">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <PlugZap size={15} className="text-bb-orange" /> Connect an account
          </h3>
          <p className="text-xs text-bb-dim mt-1">Pick the client, then the platform. You sign in on the platform and come back here.</p>
          <select
            aria-label="Client to connect"
            value={connectClient}
            onChange={(e) => setConnectClient(e.target.value)}
            className="mt-3 w-full sm:w-72 bg-bb-elevated border border-bb-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-bb-orange/60 cursor-pointer"
          >
            <option value="">Choose a client</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
            {PROVIDERS.map((p) => {
              const disabled = !connectClient;
              return (
                <a
                  key={p.key}
                  href={disabled ? undefined : authorizeUrl(p.key, connectClient)}
                  aria-disabled={disabled}
                  onClick={(e) => disabled && e.preventDefault()}
                  className={cn(
                    "flex items-start gap-2.5 rounded-lg border px-3 py-2 transition-colors",
                    disabled
                      ? "border-bb-border bg-bb-elevated/40 opacity-50 cursor-not-allowed"
                      : "border-bb-border bg-bb-elevated hover:border-bb-orange/40 cursor-pointer"
                  )}
                >
                  <PlatformIcon platform={p.platform} size={16} className="mt-0.5" />
                  <span className="min-w-0">
                    <span className="block text-sm text-white">{p.label}</span>
                    <span className="block text-[11px] text-bb-dim leading-snug">{p.hint}</span>
                  </span>
                </a>
              );
            })}
          </div>
          <p className="mt-3 text-[11px] text-bb-dim">RedNote has no connection. RedNote posts are always posted by hand from the phone handoff page.</p>
        </section>

        {/* YouTube quota */}
        <section className="bg-bb-surface border border-bb-border rounded-xl p-4">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <Youtube size={15} className="text-red-500" /> YouTube uploads today
          </h3>
          {quota ? (
            <>
              <p className="mt-3 font-display text-3xl text-white tabular-nums">
                {quota.uploadsLeft}
                <span className="text-sm text-bb-muted font-body"> upload{quota.uploadsLeft === 1 ? "" : "s"} left</span>
              </p>
              <div
                className="mt-3 h-2 rounded-full bg-bb-elevated overflow-hidden"
                role="meter"
                aria-valuemin={0}
                aria-valuemax={quota.limit}
                aria-valuenow={quota.used}
                aria-label="YouTube API quota used"
              >
                <div
                  className={cn(
                    "h-full rounded-full transition-[width] duration-500",
                    quota.used / quota.limit > 0.85 ? "bg-red-500" : quota.used / quota.limit > 0.6 ? "bg-yellow-400" : "bg-emerald-400"
                  )}
                  style={{ width: `${Math.min(100, (quota.used / Math.max(1, quota.limit)) * 100)}%` }}
                />
              </div>
              <p className="mt-2 text-[11px] text-bb-dim">
                {quota.used.toLocaleString()} of {quota.limit.toLocaleString()} quota units used, shared by every client. Resets{" "}
                {formatDistanceToNowStrict(new Date(quota.resetsAt), { addSuffix: true })} (midnight Pacific).
              </p>
            </>
          ) : (
            <p className="mt-3 text-xs text-bb-dim">Quota info isn&apos;t available yet.</p>
          )}
        </section>
      </div>

      {/* Existing connections */}
      <section className="bg-bb-surface border border-bb-border rounded-xl">
        <div className="flex items-center justify-between px-4 py-3 border-b border-bb-border">
          <h3 className="text-sm font-semibold text-white">
            Connected accounts
            {problems > 0 && <span className="ml-2 text-xs font-normal text-red-300">{problems} need a reconnect</span>}
          </h3>
          <button
            type="button"
            onClick={() => {
              setConnections(null);
              load();
            }}
            className="p-1.5 rounded-lg text-bb-dim hover:text-white hover:bg-bb-elevated transition-colors cursor-pointer"
            aria-label="Refresh"
          >
            <RefreshCw size={14} />
          </button>
        </div>
        {connections === null ? (
          <div className="flex items-center justify-center py-10 text-bb-dim">
            <Loader2 size={18} className="animate-spin" />
          </div>
        ) : error ? (
          <p className="px-4 py-6 text-sm text-red-300">{error}</p>
        ) : byClient.length === 0 ? (
          <p className="px-4 py-8 text-sm text-bb-dim text-center">No accounts connected yet.</p>
        ) : (
          <div className="divide-y divide-bb-border">
            {byClient.map(([clientId, { name, rows }]) => (
              <div key={clientId} className="px-4 py-3">
                <p className="text-xs font-semibold text-bb-muted mb-2">{name}</p>
                <ul className="grid gap-2 lg:grid-cols-2">
                  {rows.map((c) => {
                    const h = HEALTH[c.health] || HEALTH.unknown;
                    const Icon = h.icon;
                    const provider = c.reconnectProvider || c.provider || fallbackProvider(c.platform);
                    const broken = c.health === "expired" || c.health === "needs_reconnect" || c.health === "expiring";
                    return (
                      <li key={c.id} className="flex items-center gap-3 rounded-lg bg-bb-elevated/50 border border-bb-border px-3 py-2">
                        <span className="relative w-8 h-8 rounded-full bg-bb-elevated flex items-center justify-center shrink-0">
                          {c.avatarUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={c.avatarUrl} alt="" className="w-full h-full rounded-full object-cover" />
                          ) : (
                            <PlatformIcon platform={platformKey(c.platform)} size={15} />
                          )}
                          {c.avatarUrl && (
                            <span className="absolute -bottom-0.5 -right-0.5 bg-bb-surface rounded-full p-0.5">
                              <PlatformIcon platform={platformKey(c.platform)} size={9} />
                            </span>
                          )}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm text-white truncate">
                            {c.label || c.username || getPlatformLabel(platformKey(c.platform))}
                          </span>
                          <span className="block text-[11px] text-bb-dim truncate">
                            {getPlatformLabel(platformKey(c.platform))}
                            {c.provider === "instagram" && " · direct login"}
                            {c.expiresAt && ` · token ${new Date(c.expiresAt) < new Date() ? "expired" : "renews by"} ${format(new Date(c.expiresAt), "MMM d")}`}
                          </span>
                        </span>
                        <span className={cn("inline-flex items-center gap-1 px-1.5 sm:px-2 py-0.5 rounded-md border text-[11px] whitespace-nowrap", h.className)} title={h.label}>
                          <Icon size={11} /> <span className="hidden sm:inline">{h.label}</span>
                        </span>
                        {provider && (
                          <a
                            href={authorizeUrl(provider, c.clientId)}
                            className={cn(
                              "shrink-0 px-2.5 py-1 rounded-md text-xs transition-colors",
                              broken
                                ? "bg-bb-orange text-white hover:bg-bb-orange-light"
                                : "text-bb-muted border border-bb-border hover:text-white hover:border-bb-muted"
                            )}
                          >
                            Reconnect
                          </a>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
