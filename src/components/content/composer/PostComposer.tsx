"use client";

/**
 * Multi-account post composer: one piece of content, adapted per account.
 *
 * Every selected account becomes its own post row, all sharing a groupId.
 * Shared caption/media/time live at the top level; each account tab can
 * override caption and media, pick its post type, format and platform
 * settings, and switch to manual posting. Platform specs validate every
 * account live, and Schedule stays disabled while any account has an error.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  CalendarCheck2,
  Check,
  CheckCircle2,
  Copy,
  Link2,
  Loader2,
  Save,
  Send,
  X,
} from "lucide-react";
import ConfirmDialog from "@/components/shared/ConfirmDialog";
import { readJson } from "@/lib/fetch-json";
import { safeUuid } from "@/lib/safe-uuid";
import type { SpecIssue } from "@/lib/social/specs";
import { cn } from "@/lib/utils";
import AccountPicker, { AccountIcon } from "./AccountPicker";
import AccountTab from "./AccountTab";
import IssueList from "./IssueList";
import MediaTray from "./MediaTray";
import SchedulePanel from "./SchedulePanel";
import SharedEditor from "./SharedEditor";
import { TikTokConsent, type CreatorInfoState } from "./panels/TikTokPanel";
import { kindFromMime, metaFromClientMedia, probeMedia } from "./media";
import { prewarmRenditions, savePosts, type SavedPost, type SaveIntent } from "./save";
import { browserTimezone, isValidTimezone } from "./timezone";
import {
  MANUAL_REDNOTE_KEY,
  isLocked,
  newDraft,
  platformName,
  type AccountDraft,
  type ClientOption,
  type ComposerAccount,
  type MediaMeta,
  type SharedContent,
  type TeamMember,
} from "./types";
import { issuesForDraft, resolvedPostType, type TikTokCreatorInfo } from "./validation";
import type { MediaFormat } from "@/lib/social/formats";

export interface PostComposerProps {
  open: boolean;
  onClose: () => void;
  onSaved?: (posts: SavedPost[]) => void;
  defaultClientId?: string;
  /** ISO timestamp to prefill */
  defaultScheduledAt?: string;
  /** Edit this post and the rest of its group */
  postId?: string;
  /** Start a new group copied from this post (and its group) */
  duplicateFromPostId?: string;
}

interface LoadedPost {
  id: string;
  clientId: string;
  credentialId: string | null;
  platform: string;
  status: string;
  title: string | null;
  body: string | null;
  hashtags: string[];
  mediaUrls: string[];
  scheduledAt: string | null;
  taggedUsers: string[];
  collaborators: string[];
  altText: string | null;
  coverImageUrl: string | null;
  thumbnailUrl: string | null;
  firstComment: string | null;
  platformSettings: Record<string, unknown> | null;
  groupId: string | null;
  publishMode: "AUTO" | "ASSISTED";
  assignedToId: string | null;
  externalUrl: string | null;
  publishError: string | null;
  publishPhase: string | null;
  credential?: { id: string; label: string | null; platform: string; meta: Record<string, unknown> | null } | null;
}

const EMPTY_SHARED: SharedContent = { title: "", body: "", hashtags: [], mediaUrls: [], altTexts: {} };

const MANUAL_REDNOTE: ComposerAccount = {
  key: MANUAL_REDNOTE_KEY,
  credentialId: null,
  platform: "REDNOTE",
  label: "RedNote",
  health: "ok",
  manualOnly: true,
};

const sameList = (a: string[], b: string[]) => a.length === b.length && a.every((v, i) => v === b[i]);

function keyForPost(post: LoadedPost): string {
  if (post.credentialId) return post.credentialId;
  if (post.platform === "REDNOTE") return MANUAL_REDNOTE_KEY;
  return `post:${post.id}`;
}

function draftFromPost(post: LoadedPost, shared: SharedContent): AccountDraft {
  const { postType, postTypeAuto, altTexts: _alt, ...settings } = post.platformSettings || {};
  void _alt;
  const title = post.title || "";
  const body = post.body || "";
  return {
    key: keyForPost(post),
    credentialId: post.credentialId,
    platform: post.platform,
    postId: post.id,
    status: post.status,
    externalUrl: post.externalUrl,
    publishError: post.publishError,
    publishPhase: post.publishPhase,
    overrideCaption: !(title === shared.title && body === shared.body && sameList(post.hashtags, shared.hashtags)),
    title,
    body,
    hashtags: post.hashtags || [],
    overrideMedia: !sameList(post.mediaUrls, shared.mediaUrls),
    mediaUrls: post.mediaUrls || [],
    postType: postTypeAuto === true ? null : ((postType as string | undefined) ?? null),
    settings,
    firstComment: post.firstComment || "",
    collaborators: post.collaborators || [],
    taggedUsers: post.taggedUsers || [],
    coverImageUrl: post.coverImageUrl || "",
    thumbnailUrl: post.thumbnailUrl || "",
    publishMode: post.platform === "REDNOTE" ? "ASSISTED" : post.publishMode || "AUTO",
    assignedToId: post.assignedToId,
  };
}

export default function PostComposer({ open, onClose, onSaved, defaultClientId, defaultScheduledAt, postId, duplicateFromPostId }: PostComposerProps) {
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [clientId, setClientId] = useState("");
  const [connections, setConnections] = useState<ComposerAccount[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [drafts, setDrafts] = useState<Record<string, AccountDraft>>({});
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [shared, setShared] = useState<SharedContent>(EMPTY_SHARED);
  const [meta, setMeta] = useState<Record<string, MediaMeta>>({});
  const [scheduledAtIso, setScheduledAtIso] = useState("");
  const [creatorInfo, setCreatorInfo] = useState<Record<string, CreatorInfoState>>({});
  const [loadingPost, setLoadingPost] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState<SaveIntent | "approval" | null>(null);
  const [saveErrors, setSaveErrors] = useState<{ label: string; message: string }[]>([]);
  const [showIssues, setShowIssues] = useState(false);
  const [approvalOpen, setApprovalOpen] = useState(false);
  const [approvalMessage, setApprovalMessage] = useState("");
  const [approvalLink, setApprovalLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmRemoval, setConfirmRemoval] = useState<{ intent: SaveIntent | "approval"; ids: string[] } | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [dirty, setDirty] = useState(false);

  const groupIdRef = useRef<string>("");
  /** draft key → post id that existed when the composer opened */
  const originalPostsRef = useRef<Record<string, string>>({});
  const probedRef = useRef<Set<string>>(new Set());

  const editing = !!postId;
  const client = clients.find((c) => c.id === clientId);
  const timeZone = isValidTimezone(client?.timezone) ? client!.timezone! : browserTimezone();

  // ─── Loading ──────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!open) return;
    fetch("/api/clients")
      .then((r) => r.json())
      .then((d) => d?.success && setClients(d.data))
      .catch(() => {});
    fetch("/api/users/assignable")
      .then((r) => r.json())
      .then((d) => d?.success && setTeam(d.data))
      .catch(() => {});
  }, [open]);

  // Reset and (when editing/duplicating) load the post group each time it opens
  useEffect(() => {
    if (!open) return;
    setSelected([]);
    setDrafts({});
    setActiveKey(null);
    setShared(EMPTY_SHARED);
    setSaveErrors([]);
    setApprovalLink(null);
    setApprovalOpen(false);
    setApprovalMessage("");
    setShowIssues(false);
    setLoadError(null);
    setDirty(false);
    originalPostsRef.current = {};
    groupIdRef.current = safeUuid();

    const sourceId = postId || duplicateFromPostId;
    if (!sourceId) {
      setClientId(defaultClientId || "");
      setScheduledAtIso(defaultScheduledAt || "");
      return;
    }

    let cancelled = false;
    setLoadingPost(true);
    (async () => {
      try {
        const res = await fetch(`/api/content-posts/${sourceId}`);
        const json = await readJson<{ data: LoadedPost }>(res, "Couldn't load that post.");
        if (!json.ok || !json.data?.data) throw new Error(json.error || "Couldn't load that post.");
        const primary = json.data.data;
        let group: LoadedPost[] = [primary];
        if (primary.groupId) {
          const gr = await fetch(`/api/content-posts?groupId=${encodeURIComponent(primary.groupId)}`);
          const gj = await readJson<{ data: LoadedPost[] }>(gr);
          if (gj.ok && gj.data?.data?.length) {
            group = [primary, ...gj.data.data.filter((p) => p.id !== primary.id)];
          }
        }
        if (cancelled) return;

        // Shared content comes from the post that was opened; media is the union in order
        const mediaUnion: string[] = [];
        const altTexts: Record<string, string> = {};
        for (const p of group) {
          for (const u of p.mediaUrls || []) if (!mediaUnion.includes(u)) mediaUnion.push(u);
          Object.assign(altTexts, (p.platformSettings?.altTexts as Record<string, string>) || {});
        }
        const nextShared: SharedContent = {
          title: primary.title || "",
          body: primary.body || "",
          hashtags: primary.hashtags || [],
          mediaUrls: mediaUnion,
          altTexts,
        };

        const duplicate = !postId;
        const nextDrafts: Record<string, AccountDraft> = {};
        const order: string[] = [];
        for (const p of group) {
          const d = draftFromPost(p, nextShared);
          if (nextDrafts[d.key]) continue;
          if (duplicate) {
            delete d.postId;
            d.status = undefined;
            d.externalUrl = null;
            d.publishError = null;
            d.publishPhase = null;
          } else {
            originalPostsRef.current[d.key] = p.id;
          }
          nextDrafts[d.key] = d;
          order.push(d.key);
        }

        // Accounts on the loaded posts that aren't live connections any more
        const extra: ComposerAccount[] = group
          .filter((p) => !p.credentialId && p.platform !== "REDNOTE")
          .map((p) => ({ key: `post:${p.id}`, credentialId: null, platform: p.platform, label: platformName(p.platform), health: "unknown" as const }));

        setClientId(primary.clientId);
        setShared(nextShared);
        setDrafts(nextDrafts);
        setSelected(order);
        setActiveKey(order[0] || null);
        setScheduledAtIso(duplicate ? "" : primary.scheduledAt || "");
        if (!duplicate && primary.groupId) groupIdRef.current = primary.groupId;
        if (extra.length) setConnections((c) => [...c.filter((a) => !a.key.startsWith("post:")), ...extra]);
      } catch (err) {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : "Couldn't load that post.");
      } finally {
        if (!cancelled) setLoadingPost(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, postId, duplicateFromPostId, defaultClientId, defaultScheduledAt]);

  const loadConnections = useCallback(async (cid: string) => {
    if (!cid) {
      setConnections([]);
      return;
    }
    setLoadingAccounts(true);
    try {
      const res = await fetch(`/api/social/connections?clientId=${encodeURIComponent(cid)}`);
      const json = await readJson<{ data: (Omit<ComposerAccount, "key" | "credentialId"> & { id: string })[] }>(res);
      const rows = json.ok ? json.data?.data || [] : [];
      setConnections((prev) => [
        ...rows.map((r) => ({ ...r, key: r.id, credentialId: r.id })),
        ...prev.filter((a) => a.key.startsWith("post:")),
      ]);
    } finally {
      setLoadingAccounts(false);
    }
  }, []);

  useEffect(() => {
    if (!open || !clientId) return;
    loadConnections(clientId);
    fetch(`/api/client-media?clientId=${encodeURIComponent(clientId)}`)
      .then((r) => r.json())
      .then((d) => {
        if (!d?.success) return;
        const next: Record<string, MediaMeta> = {};
        for (const row of d.data as Parameters<typeof metaFromClientMedia>[0][]) next[row.url] = metaFromClientMedia(row);
        setMeta((m) => {
          // Keep dimensions already probed in this session
          const merged = { ...next };
          for (const [url, existing] of Object.entries(m)) merged[url] = { ...merged[url], ...existing, ...(merged[url]?.thumbnailUrl ? { thumbnailUrl: merged[url].thumbnailUrl } : {}) };
          return merged;
        });
      })
      .catch(() => {});
  }, [open, clientId, loadConnections]);

  // Library rows often lack dimensions; read them from the files in the browser
  useEffect(() => {
    for (const url of shared.mediaUrls) {
      const m = meta[url];
      if (probedRef.current.has(url)) continue;
      if (m?.width && m?.height && (m.kind !== "video" || m.duration)) continue;
      const kind = m?.kind || kindFromMime(null, url);
      if (kind !== "image" && kind !== "video") continue;
      probedRef.current.add(url);
      probeMedia(url, kind).then((dims) => {
        if (!dims.width && !dims.duration) return;
        setMeta((prev) => ({ ...prev, [url]: { ...(prev[url] || { url, kind }), ...dims, url } }));
      });
    }
  }, [shared.mediaUrls, meta]);

  const accounts = useMemo(() => {
    const list = [...connections];
    if (!list.some((a) => a.key === MANUAL_REDNOTE_KEY)) list.push(MANUAL_REDNOTE);
    return list;
  }, [connections]);
  const accountByKey = useMemo(() => Object.fromEntries(accounts.map((a) => [a.key, a])), [accounts]);

  // TikTok creator info: TikTok requires fresh account settings before posting
  const tiktokCredentialIds = useMemo(
    () => [...new Set(selected.map((k) => drafts[k]).filter((d) => d && d.platform === "TIKTOK" && d.credentialId && d.publishMode === "AUTO").map((d) => d.credentialId!))],
    [selected, drafts]
  );
  useEffect(() => {
    for (const id of tiktokCredentialIds) {
      if (creatorInfo[id]) continue;
      setCreatorInfo((c) => ({ ...c, [id]: { loading: true, data: null, error: null } }));
      fetch(`/api/social/tiktok/creator-info?credentialId=${encodeURIComponent(id)}`)
        .then((r) => readJson<{ data: TikTokCreatorInfo }>(r, "TikTok didn't respond."))
        .then((json) =>
          setCreatorInfo((c) => ({
            ...c,
            [id]: { loading: false, data: json.ok ? json.data?.data ?? null : null, error: json.ok ? null : json.error },
          }))
        )
        .catch(() => setCreatorInfo((c) => ({ ...c, [id]: { loading: false, data: null, error: "TikTok didn't respond." } })));
    }
  }, [tiktokCredentialIds, creatorInfo]);

  // ─── Mutations ────────────────────────────────────────────────────────────

  const touch = () => setDirty(true);

  const toggleAccount = (key: string) => {
    touch();
    if (selected.includes(key)) {
      const next = selected.filter((k) => k !== key);
      setSelected(next);
      if (activeKey === key) setActiveKey(next[0] || null);
      return;
    }
    const account = accountByKey[key];
    if (!account) return;
    setDrafts((d) => (d[key] ? d : { ...d, [key]: newDraft(account) }));
    setSelected((s) => [...s, key]);
    setActiveKey(key);
  };

  const updateDraft = (key: string, patch: Partial<AccountDraft>) => {
    touch();
    setDrafts((d) => ({ ...d, [key]: { ...d[key], ...patch } }));
  };

  const updateSettings = (key: string, patch: Record<string, unknown>) => {
    touch();
    setDrafts((d) => {
      const settings = { ...d[key].settings, ...patch };
      for (const k of Object.keys(patch)) if (patch[k] === undefined) delete settings[k];
      return { ...d, [key]: { ...d[key], settings } };
    });
  };

  const applyFormatToAll = (format: MediaFormat) => {
    touch();
    setDrafts((d) => {
      const next = { ...d };
      for (const key of selected) {
        if (isLocked(next[key])) continue;
        next[key] = { ...next[key], settings: { ...next[key].settings, mediaFormat: format, mediaFormatManual: true } };
      }
      return next;
    });
  };

  const updateShared = (patch: Partial<SharedContent>) => {
    touch();
    setShared((s) => ({ ...s, ...patch }));
  };

  // ─── Validation ───────────────────────────────────────────────────────────

  const selectedDrafts = selected.map((k) => drafts[k]).filter(Boolean);

  const postTypes = useMemo(() => {
    const out: Record<string, string | null> = {};
    for (const d of selectedDrafts) out[d.key] = resolvedPostType(d, shared, meta);
    return out;
  }, [selectedDrafts, shared, meta]);

  const issuesByKey = useMemo(() => {
    const out: Record<string, SpecIssue[]> = {};
    for (const d of selectedDrafts) {
      const info = d.credentialId ? creatorInfo[d.credentialId] : undefined;
      out[d.key] = issuesForDraft({
        draft: d,
        account: accountByKey[d.key],
        shared,
        meta,
        scheduledAtIso,
        tiktok: info?.data,
        tiktokError: info?.error,
      });
    }
    return out;
  }, [selectedDrafts, accountByKey, shared, meta, scheduledAtIso, creatorInfo]);

  const globalIssues: SpecIssue[] = [];
  if (!clientId) globalIssues.push({ level: "error", message: "Pick a client." });
  if (selected.length === 0) globalIssues.push({ level: "error", message: "Pick at least one account to post to." });
  const scheduleIssues: SpecIssue[] = [];
  if (!scheduledAtIso) scheduleIssues.push({ level: "error", message: "Pick a date and time to schedule." });
  else if (new Date(scheduledAtIso).getTime() < Date.now() - 60_000) scheduleIssues.push({ level: "error", message: "The scheduled time has already passed." });

  const accountErrorCount = Object.values(issuesByKey).reduce((n, list) => n + list.filter((i) => i.level === "error").length, 0);
  const warningCount = Object.values(issuesByKey).reduce((n, list) => n + list.filter((i) => i.level === "warning").length, 0);
  const scheduleBlocked = globalIssues.length + scheduleIssues.length + accountErrorCount > 0;
  const editableCount = selectedDrafts.filter((d) => !isLocked(d)).length;
  const hasTikTokAuto = selectedDrafts.some((d) => d.platform === "TIKTOK" && d.publishMode === "AUTO" && !isLocked(d));
  const tiktokBranded = selectedDrafts.some((d) => d.platform === "TIKTOK" && d.publishMode === "AUTO" && !!d.settings.brandedContent);
  const allLocked = selectedDrafts.length > 0 && editableCount === 0;

  // ─── Save ─────────────────────────────────────────────────────────────────

  const labelFor = (d: AccountDraft) => {
    const a = accountByKey[d.key];
    return `${platformName(d.platform)}${a && !a.manualOnly ? ` ${a.label}` : ""}`;
  };

  const runSave = async (intent: SaveIntent | "approval") => {
    const saveIntent: SaveIntent = intent === "approval" ? (scheduledAtIso && !scheduleBlocked ? "schedule" : "draft") : intent;
    setSaving(intent);
    setSaveErrors([]);
    try {
      const removedIds = Object.entries(originalPostsRef.current)
        .filter(([key]) => !selected.includes(key))
        .map(([, id]) => id);

      const result = await savePosts({
        drafts: selectedDrafts,
        removedPostIds: removedIds,
        shared,
        meta,
        clientId,
        groupId: groupIdRef.current,
        scheduledAtIso,
        intent: saveIntent,
        holdForApproval: intent === "approval",
        labelFor,
      });

      // Remember created rows so a retry after a partial failure doesn't duplicate them
      if (Object.keys(result.createdIds).length) {
        setDrafts((d) => {
          const next = { ...d };
          for (const [key, id] of Object.entries(result.createdIds)) {
            next[key] = { ...next[key], postId: id };
            originalPostsRef.current[key] = id;
          }
          return next;
        });
      }
      for (const [key, id] of Object.entries(originalPostsRef.current)) {
        if (!selected.includes(key) && removedIds.includes(id) && !result.errors.some((e) => e.key === id)) {
          delete originalPostsRef.current[key];
        }
      }
      setDrafts((d) => {
        const next = { ...d };
        for (const post of result.posts) {
          const key = Object.keys(next).find((k) => next[k].postId === post.id || result.createdIds[k] === post.id);
          if (key) next[key] = { ...next[key], status: post.status };
        }
        return next;
      });

      if (result.posts.length) prewarmRenditions(clientId, selectedDrafts, shared, meta);

      if (result.errors.length) {
        setSaveErrors(result.errors.map((e) => ({ label: e.label, message: e.message })));
        if (result.posts.length) onSaved?.(result.posts);
        return;
      }

      if (intent === "approval") {
        // Only rows saved just now; published ones have nothing left to approve
        const allIds = result.posts.map((p) => p.id);
        const res = await fetch("/api/content-approvals", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            clientId,
            postIds: allIds,
            title: shared.title || shared.body.split("\n")[0]?.slice(0, 80) || undefined,
            message: approvalMessage.trim() || undefined,
          }),
        });
        const json = await readJson<{ data: { id: string; token: string; url: string } }>(res, "Posts saved, but the approval link couldn't be created.");
        onSaved?.(result.posts);
        setDirty(false);
        if (!json.ok || !json.data?.data) {
          setSaveErrors([{ label: "Approval link", message: json.error || "Couldn't create the link." }]);
          return;
        }
        setApprovalLink(json.data.data.url);
        setApprovalOpen(false);
        return;
      }

      onSaved?.(result.posts);
      setDirty(false);
      onClose();
    } finally {
      setSaving(null);
    }
  };

  const requestSave = (intent: SaveIntent | "approval") => {
    const removed = Object.entries(originalPostsRef.current).filter(([key]) => !selected.includes(key));
    if (removed.length) {
      setConfirmRemoval({ intent, ids: removed.map(([, id]) => id) });
      return;
    }
    runSave(intent);
  };

  const requestClose = () => {
    if (saving) return;
    if (dirty && !approvalLink) setConfirmDiscard(true);
    else onClose();
  };

  // Esc closes; lock page scroll while open
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !confirmRemoval && !confirmDiscard) requestClose();
    };
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  });

  if (!open) return null;

  const active = activeKey && drafts[activeKey] && selected.includes(activeKey) ? drafts[activeKey] : selectedDrafts[0];
  // Best-time hints come from the first account that isn't posted by hand
  const firstSpecPlatform = selectedDrafts.find((d) => d.platform !== "REDNOTE")?.platform;

  return (
    <div className="fixed inset-0 z-50 flex sm:p-4 bg-black/70 backdrop-blur-sm motion-safe:animate-fade-in-up" role="presentation">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={editing ? "Edit post" : "Create post"}
        className="relative flex flex-col w-full max-w-[1400px] mx-auto bg-bb-black sm:rounded-2xl sm:border border-bb-border shadow-modal overflow-hidden"
      >
        {/* Header */}
        <header className="flex items-center gap-3 px-4 py-3 border-b border-bb-border bg-bb-surface">
          <h2 className="font-display text-base sm:text-lg font-semibold text-white shrink-0">
            {editing ? "Edit post" : duplicateFromPostId ? "Duplicate post" : "Create post"}
          </h2>
          <div className="flex-1 min-w-0 max-w-xs">
            <select
              value={clientId}
              disabled={editing || loadingPost || !!saving}
              onChange={(e) => {
                touch();
                setClientId(e.target.value);
                setSelected([]);
                setDrafts({});
                setActiveKey(null);
                setShared((s) => ({ ...s, mediaUrls: [] }));
              }}
              aria-label="Client"
              className="w-full bg-bb-elevated border border-bb-border rounded-lg px-3 py-1.5 text-sm text-white disabled:opacity-70 cursor-pointer disabled:cursor-default"
            >
              <option value="">Choose client</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex-1" />
          {selected.length > 0 && (
            <div className="hidden md:flex items-center -space-x-1.5">
              {selectedDrafts.slice(0, 6).map((d) => (
                <span key={d.key} className="rounded-full bg-bb-surface border border-bb-border p-1">
                  <AccountIcon platform={d.platform} size={12} />
                </span>
              ))}
            </div>
          )}
          <button
            type="button"
            onClick={requestClose}
            aria-label="Close"
            className="p-1.5 rounded-md text-bb-muted hover:text-white hover:bg-bb-elevated cursor-pointer transition-colors"
          >
            <X size={18} />
          </button>
        </header>

        {loadingPost ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 size={24} className="animate-spin text-bb-dim" />
          </div>
        ) : loadError ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6 text-center">
            <AlertCircle size={24} className="text-red-400" />
            <p className="text-sm text-bb-muted">{loadError}</p>
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg bg-bb-elevated border border-bb-border text-sm text-white cursor-pointer">
              Close
            </button>
          </div>
        ) : (
          <div className="flex-1 min-h-0 overflow-y-auto lg:overflow-hidden lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(400px,480px)]">
            {/* Left: shared content */}
            <div className="lg:overflow-y-auto p-3 sm:p-4 space-y-3">
              <AccountPicker
                clientId={clientId}
                accounts={accounts}
                selected={selected}
                locked={selectedDrafts.filter(isLocked).map((d) => d.key)}
                loading={loadingAccounts}
                onToggle={toggleAccount}
                onRefresh={() => loadConnections(clientId)}
              />
              <SharedEditor shared={shared} platforms={selectedDrafts.map((d) => d.platform)} disabled={allLocked} onChange={updateShared} />
              <MediaTray
                clientId={clientId}
                mediaUrls={shared.mediaUrls}
                meta={meta}
                altTexts={shared.altTexts}
                disabled={allLocked}
                onChange={(mediaUrls) => updateShared({ mediaUrls })}
                onAltTextChange={(url, text) => updateShared({ altTexts: { ...shared.altTexts, [url]: text } })}
                onMetaAdd={(items) => setMeta((m) => ({ ...m, ...Object.fromEntries(items.map((i) => [i.url, i])) }))}
              />
              <SchedulePanel
                clientId={clientId}
                timeZone={timeZone}
                timeZoneIsClient={isValidTimezone(client?.timezone)}
                scheduledAtIso={scheduledAtIso}
                platform={firstSpecPlatform}
                disabled={allLocked}
                onChange={(iso) => {
                  touch();
                  setScheduledAtIso(iso);
                }}
              />
            </div>

            {/* Right: per-account customization */}
            <aside className="lg:overflow-y-auto border-t lg:border-t-0 lg:border-l border-bb-border bg-bb-surface/40">
              {selectedDrafts.length === 0 ? (
                <div className="p-6 text-center">
                  <p className="text-sm text-bb-muted">Pick accounts on the left.</p>
                  <p className="text-xs text-bb-dim mt-1">Each one gets its own tab here for post type, format, settings and a preview.</p>
                </div>
              ) : (
                <>
                  <div className="sticky top-0 z-10 bg-bb-surface/95 backdrop-blur border-b border-bb-border">
                    <div className="flex gap-1 overflow-x-auto px-3 py-2 scrollbar-hide" role="tablist">
                      {selectedDrafts.map((d) => {
                        const list = issuesByKey[d.key] || [];
                        const errors = list.filter((i) => i.level === "error").length;
                        const warns = list.length - errors;
                        const a = accountByKey[d.key];
                        const isActive = active?.key === d.key;
                        return (
                          <button
                            key={d.key}
                            type="button"
                            role="tab"
                            aria-selected={isActive}
                            onClick={() => setActiveKey(d.key)}
                            className={cn(
                              "flex items-center gap-1.5 shrink-0 rounded-lg px-2.5 py-1.5 text-xs border cursor-pointer transition-colors",
                              isActive ? "bg-bb-elevated border-bb-orange/60 text-white" : "border-transparent text-bb-muted hover:text-white hover:bg-bb-elevated"
                            )}
                          >
                            <AccountIcon platform={d.platform} size={12} />
                            <span className="max-w-[110px] truncate">{a?.manualOnly ? "RedNote" : a?.label || platformName(d.platform)}</span>
                            {isLocked(d) ? (
                              <CheckCircle2 size={11} className="text-emerald-400" />
                            ) : errors ? (
                              <span className="min-w-[16px] h-4 px-1 rounded-full bg-red-500/20 text-red-300 text-[10px] leading-4 text-center">{errors}</span>
                            ) : warns ? (
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                            ) : (
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  {active && accountByKey[active.key] && (
                    <div className="p-3 sm:p-4">
                      <AccountTab
                        key={active.key}
                        account={accountByKey[active.key]}
                        draft={active}
                        shared={shared}
                        meta={meta}
                        team={team}
                        issues={issuesByKey[active.key] || []}
                        postType={postTypes[active.key] ?? null}
                        creator={active.credentialId ? creatorInfo[active.credentialId] : undefined}
                        disabled={!!saving}
                        onDraft={(patch) => updateDraft(active.key, patch)}
                        onSettings={(patch) => updateSettings(active.key, patch)}
                        onApplyFormatToAll={(f) => applyFormatToAll(f as MediaFormat)}
                      />
                    </div>
                  )}
                </>
              )}
            </aside>
          </div>
        )}

        {/* Footer */}
        {!loadingPost && !loadError && (
          <footer className="border-t border-bb-border bg-bb-surface px-3 sm:px-4 py-2.5 space-y-2">
            {showIssues && (
              <div className="max-h-48 overflow-y-auto space-y-2">
                <IssueList issues={[...globalIssues, ...scheduleIssues]} />
                {selectedDrafts.map((d) =>
                  (issuesByKey[d.key] || []).length ? (
                    <div key={d.key}>
                      <button type="button" onClick={() => setActiveKey(d.key)} className="flex items-center gap-1.5 text-xs text-bb-muted hover:text-white mb-1 cursor-pointer">
                        <AccountIcon platform={d.platform} size={11} /> {labelFor(d)}
                      </button>
                      <IssueList issues={issuesByKey[d.key]} />
                    </div>
                  ) : null
                )}
              </div>
            )}

            {saveErrors.length > 0 && (
              <div className="rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2 text-xs text-red-200 space-y-0.5">
                {saveErrors.map((e, i) => (
                  <p key={i}>
                    <span className="font-medium">{e.label}:</span> {e.message}
                  </p>
                ))}
              </div>
            )}

            {approvalLink && (
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-2">
                <p className="flex items-center gap-1.5 text-xs text-emerald-200 shrink-0">
                  <CheckCircle2 size={13} /> Saved. Send this link to the client:
                </p>
                <code className="flex-1 min-w-0 truncate text-xs text-white bg-bb-elevated rounded px-2 py-1">{approvalLink}</code>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={async () => {
                      await navigator.clipboard.writeText(approvalLink).catch(() => {});
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    }}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-bb-elevated border border-bb-border text-xs text-white cursor-pointer"
                  >
                    {copied ? <Check size={12} /> : <Copy size={12} />} {copied ? "Copied" : "Copy"}
                  </button>
                  <button type="button" onClick={onClose} className="px-3 py-1.5 rounded-lg bg-bb-orange hover:bg-bb-orange-light text-xs text-white cursor-pointer transition-colors">
                    Done
                  </button>
                </div>
              </div>
            )}

            {approvalOpen && !approvalLink && (
              <div className="rounded-lg border border-bb-border bg-bb-elevated p-2.5 space-y-2">
                <p className="text-xs text-bb-muted">
                  The client gets a link to approve or request changes on each post. Posts waiting on approval won&apos;t publish.
                </p>
                <textarea
                  value={approvalMessage}
                  onChange={(e) => setApprovalMessage(e.target.value)}
                  rows={2}
                  placeholder="Optional note for the client"
                  className="w-full bg-bb-surface border border-bb-border rounded-lg px-3 py-2 text-sm text-white placeholder:text-bb-dim resize-none"
                />
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={() => setApprovalOpen(false)} className="px-3 py-1.5 text-xs text-bb-muted hover:text-white cursor-pointer">
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={!!saving || globalIssues.length > 0 || editableCount === 0}
                    onClick={() => requestSave("approval")}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-bb-orange hover:bg-bb-orange-light text-xs text-white cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    {saving === "approval" ? <Loader2 size={12} className="animate-spin" /> : <Link2 size={12} />} Save and create link
                  </button>
                </div>
              </div>
            )}

            {hasTikTokAuto && <TikTokConsent branded={tiktokBranded} />}

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setShowIssues((v) => !v)}
                className={cn(
                  "inline-flex items-center gap-1.5 text-xs rounded-lg px-2 py-1.5 cursor-pointer transition-colors",
                  accountErrorCount + globalIssues.length > 0 ? "text-red-300 hover:bg-red-500/10" : warningCount ? "text-amber-200 hover:bg-amber-500/10" : "text-emerald-300 hover:bg-emerald-500/10"
                )}
                aria-expanded={showIssues}
              >
                {accountErrorCount + globalIssues.length > 0 ? (
                  <>
                    <AlertCircle size={13} /> {accountErrorCount + globalIssues.length} to fix
                  </>
                ) : warningCount ? (
                  <>
                    <AlertTriangle size={13} /> {warningCount} warning{warningCount === 1 ? "" : "s"}
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={13} /> Ready
                  </>
                )}
              </button>
              <div className="flex-1" />
              <button
                type="button"
                onClick={requestClose}
                disabled={!!saving}
                className="hidden sm:inline-flex px-3 py-2 rounded-lg text-sm text-bb-muted hover:text-white cursor-pointer transition-colors disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => requestSave("draft")}
                disabled={!!saving || globalIssues.length > 0 || editableCount === 0}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-bb-elevated border border-bb-border text-sm text-bb-muted hover:text-white cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {saving === "draft" ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save draft
              </button>
              <button
                type="button"
                onClick={() => {
                  setApprovalLink(null);
                  setApprovalOpen((v) => !v);
                }}
                disabled={!!saving || globalIssues.length > 0 || editableCount === 0}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-bb-elevated border border-bb-border text-sm text-bb-muted hover:text-white cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <Send size={14} /> <span className="hidden sm:inline">Send for approval</span>
                <span className="sm:hidden">Approval</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  if (scheduleBlocked) {
                    setShowIssues(true);
                    return;
                  }
                  requestSave("schedule");
                }}
                disabled={!!saving || editableCount === 0}
                aria-disabled={scheduleBlocked}
                title={scheduleBlocked ? "Fix the issues first" : undefined}
                className={cn(
                  "inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-white cursor-pointer transition-colors disabled:cursor-not-allowed disabled:opacity-40",
                  scheduleBlocked ? "bg-bb-orange/40" : "bg-bb-orange hover:bg-bb-orange-light"
                )}
              >
                {saving === "schedule" ? <Loader2 size={14} className="animate-spin" /> : <CalendarCheck2 size={14} />}
                {selectedDrafts.some((d) => d.status === "FAILED") ? "Reschedule" : "Schedule"}
              </button>
            </div>
          </footer>
        )}
      </div>

      <ConfirmDialog
        open={!!confirmRemoval}
        onClose={() => setConfirmRemoval(null)}
        onConfirm={() => {
          const intent = confirmRemoval?.intent;
          setConfirmRemoval(null);
          if (intent) runSave(intent);
        }}
        title="Remove posts?"
        message={`${confirmRemoval?.ids.length ?? 0} account${confirmRemoval?.ids.length === 1 ? " was" : "s were"} deselected. Their posts will be deleted when you save.`}
        confirmLabel="Remove and save"
      />
      <ConfirmDialog
        open={confirmDiscard}
        onClose={() => setConfirmDiscard(false)}
        onConfirm={() => {
          setConfirmDiscard(false);
          onClose();
        }}
        title="Discard changes?"
        message="Your changes to this post haven't been saved."
        confirmLabel="Discard"
        confirmVariant="warning"
      />
    </div>
  );
}
