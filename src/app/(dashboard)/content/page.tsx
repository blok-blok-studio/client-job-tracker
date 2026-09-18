"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { addDays, endOfMonth, startOfMonth, subDays } from "date-fns";
import { BarChart3, CalendarDays, List, Loader2, MessageCircle, Music, PlugZap, Plus, Upload } from "lucide-react";
import TopBar from "@/components/layout/TopBar";
import ConfirmDialog from "@/components/shared/ConfirmDialog";
import { useToast } from "@/components/shared/Toast";
import BulkImportModal from "@/components/content/BulkImportModal";
import BestTimes from "@/components/content/BestTimes";
import { getPlatformLabel } from "@/components/content/PlatformIcon";
import PostComposer from "@/components/content/composer/PostComposer";
import CalendarTab, { type CalendarMode } from "@/components/content/planner/CalendarTab";
import ListTab from "@/components/content/planner/ListTab";
import ConnectionsTab from "@/components/content/planner/ConnectionsTab";
import AttentionStrip from "@/components/content/planner/AttentionStrip";
import PlannerFilters, { EMPTY_FILTERS, type PlannerFilterState } from "@/components/content/planner/PlannerFilters";
import AnalyticsTab from "@/components/content/analytics/AnalyticsTab";
import AudioTab from "@/components/content/audio/AudioTab";
import CommentsTab from "@/components/content/comments/CommentsTab";
import { deletePost, rescheduleGroup, retryPost } from "@/components/content/planner/planner-actions";
import {
  displayStatus,
  groupPosts,
  isReschedulable,
  wasInterrupted,
  type PlannerPost,
  type PostGroup,
} from "@/components/content/planner/planner-utils";
import { readJson } from "@/lib/fetch-json";
import { cn } from "@/lib/utils";

type Tab = "calendar" | "list" | "audio" | "comments" | "analytics" | "connections";

const TABS: { key: Tab; label: string; icon: typeof CalendarDays }[] = [
  { key: "calendar", label: "Calendar", icon: CalendarDays },
  { key: "list", label: "List", icon: List },
  { key: "audio", label: "Audio", icon: Music },
  { key: "comments", label: "Comments", icon: MessageCircle },
  { key: "analytics", label: "Analytics", icon: BarChart3 },
  { key: "connections", label: "Connections", icon: PlugZap },
];

export default function ContentPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="w-6 h-6 text-bb-dim animate-spin" />
        </div>
      }
    >
      <ContentPlanner />
    </Suspense>
  );
}

function ContentPlanner() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { toast } = useToast();

  // The OAuth callback appends "?oauth_success=…" to a returnTo that already
  // has "?tab=connections", so the tab value can carry a second query string.
  const [tabRaw, tabExtra] = (searchParams.get("tab") || "").split("?");
  const tab: Tab = TABS.some((t) => t.key === tabRaw) ? (tabRaw as Tab) : "calendar";
  const oauthParams = new URLSearchParams(tabExtra || "");
  const oauthSuccess = searchParams.get("oauth_success") || oauthParams.get("oauth_success");
  const oauthError = searchParams.get("oauth_error") || oauthParams.get("oauth_error");
  const calendarMode: CalendarMode = searchParams.get("view") === "week" ? "week" : "month";
  const deepLinkPostId = searchParams.get("post");

  const setParams = useCallback(
    (updates: Record<string, string | null>) => {
      const next = new URLSearchParams(searchParams.toString());
      for (const [k, v] of Object.entries(updates)) {
        if (v === null) next.delete(k);
        else next.set(k, v);
      }
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams]
  );

  const [posts, setPosts] = useState<PlannerPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [anchor, setAnchor] = useState(() => new Date());
  const [filters, setFilters] = useState<PlannerFilterState>(EMPTY_FILTERS);
  const [clients, setClients] = useState<{ id: string; name: string }[]>([]);
  const [users, setUsers] = useState<{ id: string; name: string }[]>([]);
  const [meId, setMeId] = useState<string | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [retryConfirm, setRetryConfirm] = useState<PlannerPost | null>(null);

  const [composer, setComposer] = useState<{ open: boolean; postId?: string; defaultScheduledAt?: string }>({ open: false });

  // A poll landing mid-drag would replace the array dnd-kit is measuring
  const draggingRef = useRef(false);

  // Window: the visible month plus a wide band around today, so the list and
  // attention strip see recent failures and upcoming posts wherever the calendar is.
  const range = useMemo(() => {
    const now = new Date();
    const from = new Date(Math.min(subDays(startOfMonth(anchor), 7).getTime(), subDays(now, 60).getTime()));
    const to = new Date(Math.max(addDays(endOfMonth(anchor), 7).getTime(), addDays(now, 180).getTime()));
    return { from: from.toISOString(), to: to.toISOString() };
  }, [anchor]);

  const fetchPosts = useCallback(async () => {
    const params = new URLSearchParams({ from: range.from, to: range.to, includeUnscheduled: "1" });
    try {
      const res = await fetch(`/api/content-posts?${params}`);
      const result = await readJson<{ data: PlannerPost[] }>(res, "Couldn't load posts.");
      if (draggingRef.current) return;
      if (result.ok && result.data) setPosts(result.data.data);
      else toast(result.error || "Couldn't load posts.", "error");
    } catch {
      // Transient network error; the next poll retries
    } finally {
      setLoading(false);
    }
  }, [range, toast]);

  useEffect(() => {
    fetchPosts();
  }, [fetchPosts]);

  // Statuses change server-side (per-minute publish cron); refresh while open
  useEffect(() => {
    const id = setInterval(() => {
      if (!draggingRef.current && document.visibilityState === "visible") fetchPosts();
    }, 30_000);
    return () => clearInterval(id);
  }, [fetchPosts]);

  useEffect(() => {
    fetch("/api/clients")
      .then((r) => readJson<{ data: { id: string; name: string }[] }>(r))
      .then((r) => r.ok && r.data && setClients(r.data.data.map((c) => ({ id: c.id, name: c.name })).sort((a, b) => a.name.localeCompare(b.name))))
      .catch(() => {});
    fetch("/api/users/assignable")
      .then((r) => readJson<{ data: { id: string; name: string }[] }>(r))
      .then((r) => r.ok && r.data && setUsers(r.data.data))
      .catch(() => {});
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => d?.user?.id && setMeId(d.user.id))
      .catch(() => {});
  }, []);

  // Result of a Connect / Reconnect round trip
  useEffect(() => {
    if (!oauthSuccess && !oauthError) return;
    toast(oauthSuccess || `Connection failed: ${oauthError}`, oauthSuccess ? "success" : "error");
    setParams({ tab: tab === "calendar" ? null : tab, oauth_success: null, oauth_error: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [oauthSuccess, oauthError]);

  // Deep link from notifications: /content?post=<id>
  useEffect(() => {
    if (deepLinkPostId) setComposer({ open: true, postId: deepLinkPostId });
  }, [deepLinkPostId]);

  const filtered = useMemo(() => {
    return posts.filter((p) => {
      if (filters.clientId && p.clientId !== filters.clientId) return false;
      if (filters.platforms.length && !filters.platforms.includes(p.platform)) return false;
      if (filters.statuses.length && !filters.statuses.includes(displayStatus(p))) return false;
      if (filters.mine && (!meId || p.assignedToId !== meId)) return false;
      if (!filters.mine && filters.assigneeId && p.assignedToId !== filters.assigneeId) return false;
      return true;
    });
  }, [posts, filters, meId]);

  const groups = useMemo(() => groupPosts(filtered), [filtered]);

  const openPost = useCallback((post: PlannerPost) => setComposer({ open: true, postId: post.id }), []);

  const openNew = useCallback((when?: Date) => {
    setComposer({ open: true, defaultScheduledAt: when?.toISOString() });
  }, []);

  const closeComposer = () => {
    setComposer({ open: false });
    if (deepLinkPostId) setParams({ post: null });
  };

  const handleReschedule = useCallback(
    async (group: PostGroup, when: Date) => {
      const hasScheduled = group.posts.some((p) => p.status === "SCHEDULED");
      if (hasScheduled && when.getTime() < Date.now() - 60_000) {
        toast("Scheduled posts need a time in the future.", "error");
        return;
      }
      const movableIds = new Set(group.posts.filter(isReschedulable).map((p) => p.id));
      if (movableIds.size === 0) return;

      const before = posts;
      setPosts((prev) => prev.map((p) => (movableIds.has(p.id) ? { ...p, scheduledAt: when.toISOString() } : p)));
      try {
        const updated = await rescheduleGroup(group, when);
        const byId = new Map(updated.map((u) => [u.id, u]));
        setPosts((prev) =>
          prev.map((p) => {
            const u = byId.get(p.id);
            return u ? { ...p, scheduledAt: u.scheduledAt, status: u.status, updatedAt: u.updatedAt } : p;
          })
        );
        const skipped = group.posts.length - movableIds.size;
        toast(skipped ? `Moved. ${skipped} post${skipped === 1 ? " was" : "s were"} already out and stayed put.` : "Moved.", "success");
      } catch (err) {
        setPosts(before);
        toast(err instanceof Error ? err.message : "Couldn't move the post.", "error");
      }
    },
    [posts, toast]
  );

  const doRetry = useCallback(
    async (post: PlannerPost) => {
      try {
        const updated = await retryPost(post);
        setPosts((prev) =>
          prev.map((p) =>
            p.id === post.id
              ? { ...p, status: updated.status, scheduledAt: updated.scheduledAt, publishError: null, publishPhase: null, publishState: null }
              : p
          )
        );
        toast("Queued again. It goes out within a couple of minutes.", "success");
      } catch (err) {
        toast(err instanceof Error ? err.message : "Couldn't retry.", "error");
      }
    },
    [toast]
  );

  const handleRetry = useCallback(
    (post: PlannerPost) => {
      if (wasInterrupted(post)) setRetryConfirm(post);
      else doRetry(post);
    },
    [doRetry]
  );

  const handleBulkReschedule = async (selected: PostGroup[], when: Date) => {
    if (Number.isNaN(when.getTime())) return;
    for (const g of selected) await handleReschedule(g, when);
  };

  const handleBulkDelete = async (selected: PostGroup[]) => {
    const ids = selected.flatMap((g) => g.posts.filter((p) => p.status !== "PUBLISHING" && p.status !== "PUBLISHED").map((p) => p.id));
    const results = await Promise.allSettled(ids.map(deletePost));
    const failed = results.filter((r) => r.status === "rejected").length;
    toast(failed ? `Deleted ${ids.length - failed}, ${failed} couldn't be deleted.` : `Deleted ${ids.length} post${ids.length === 1 ? "" : "s"}.`, failed ? "error" : "success");
    fetchPosts();
  };

  const showPlannerChrome = tab === "calendar" || tab === "list";
  const platformForBestTimes = filters.platforms.length === 1 ? filters.platforms[0] : null;

  return (
    <>
      <TopBar title="Content" subtitle="Plan, publish, and measure social posts" />

      <div className="p-4 lg:p-6 space-y-4">
        {/* Tabs + actions */}
        <div className="flex flex-col-reverse sm:flex-row sm:items-center justify-between gap-3">
          <nav className="flex gap-1 overflow-x-auto scrollbar-hide -mb-1 pb-1" aria-label="Content sections">
            {TABS.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                type="button"
                onClick={() => setParams({ tab: key === "calendar" ? null : key })}
                aria-current={tab === key ? "page" : undefined}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors cursor-pointer",
                  tab === key ? "bg-bb-orange text-white" : "text-bb-muted hover:text-white hover:bg-bb-elevated"
                )}
              >
                <Icon size={15} /> {label}
              </button>
            ))}
          </nav>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setBulkOpen(true)}
              className="flex items-center justify-center gap-2 px-3 py-2 bg-bb-elevated border border-bb-border text-bb-muted rounded-lg text-sm font-medium hover:text-white transition-colors flex-1 sm:flex-initial cursor-pointer"
            >
              <Upload size={14} /> CSV import
            </button>
            <button
              type="button"
              onClick={() => openNew()}
              className="flex items-center justify-center gap-2 px-4 py-2 bg-bb-orange text-white rounded-lg text-sm font-medium hover:bg-bb-orange-light transition-colors flex-1 sm:flex-initial cursor-pointer"
            >
              <Plus size={16} /> New post
            </button>
          </div>
        </div>

        {showPlannerChrome && (
          <>
            <PlannerFilters value={filters} onChange={setFilters} clients={clients} users={users} />
            {!loading && <AttentionStrip groups={groups} onOpen={openPost} onRetry={handleRetry} />}
          </>
        )}

        {loading && showPlannerChrome ? (
          <div className="flex items-center justify-center py-24 text-bb-dim">
            <Loader2 className="animate-spin" size={20} />
          </div>
        ) : tab === "calendar" ? (
          <CalendarTab
            groups={groups}
            anchor={anchor}
            onAnchorChange={setAnchor}
            mode={calendarMode}
            onModeChange={(m) => setParams({ view: m === "month" ? null : m })}
            onOpen={openPost}
            onCreate={openNew}
            onRetry={handleRetry}
            onReschedule={handleReschedule}
            onDragStateChange={(d) => {
              draggingRef.current = d;
            }}
          />
        ) : tab === "list" ? (
          <ListTab
            groups={groups}
            onOpen={openPost}
            onRetry={handleRetry}
            onBulkReschedule={handleBulkReschedule}
            onBulkDelete={handleBulkDelete}
          />
        ) : tab === "audio" ? (
          <AudioTab clients={clients} />
        ) : tab === "comments" ? (
          <CommentsTab clients={clients} />
        ) : tab === "analytics" ? (
          <AnalyticsTab clients={clients} />
        ) : (
          <ConnectionsTab clients={clients} />
        )}

        {tab === "calendar" && !loading && platformForBestTimes && <BestTimes platform={platformForBestTimes} />}
      </div>

      <PostComposer
        open={composer.open}
        onClose={closeComposer}
        onSaved={() => {
          fetchPosts();
        }}
        postId={composer.postId}
        defaultScheduledAt={composer.defaultScheduledAt}
        defaultClientId={filters.clientId || undefined}
      />

      <BulkImportModal open={bulkOpen} onClose={() => setBulkOpen(false)} onComplete={fetchPosts} />

      <ConfirmDialog
        open={!!retryConfirm}
        onClose={() => setRetryConfirm(null)}
        onConfirm={() => retryConfirm && doRetry(retryConfirm)}
        title="Check the account first"
        message={`This ${retryConfirm ? getPlatformLabel(retryConfirm.platform) : ""} post was cut off before the platform confirmed it, so it may already be live. Look at the account first. Retry only if it isn't there, or it will post twice.`}
        confirmLabel="It's not there, retry"
        confirmVariant="warning"
      />
    </>
  );
}
