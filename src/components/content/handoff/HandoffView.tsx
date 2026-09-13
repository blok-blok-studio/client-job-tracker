"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Download,
  ExternalLink,
  Film,
  Image as ImageIcon,
  Loader2,
  Share2,
  Smartphone,
  AlertTriangle,
  User,
} from "lucide-react";
import PlatformIcon, { getPlatformLabel } from "@/components/content/PlatformIcon";
import { optimizedThumb } from "@/lib/media-thumb";
import { formatInZone, safeTimeZone, tomorrowAtInZone } from "./zoned-time";

export interface HandoffMedia {
  url: string;
  mediaId: string | null;
  kind: "image" | "video";
  filename: string;
  mimeType: string;
  fileSize: number | null;
  thumbnailUrl: string | null;
  playbackUrl: string | null;
}

export interface HandoffPost {
  id: string;
  platform: string;
  status: string;
  publishMode: string;
  postType: string | null;
  title: string | null;
  body: string | null;
  hashtags: string[];
  firstComment: string | null;
  taggedUsers: string[];
  collaborators: string[];
  location: string | null;
  scheduledAt: string | null;
  publishedAt: string | null;
  externalUrl: string | null;
  approvalStatus: string | null;
  approvalNote: string | null;
  assigneeName: string | null;
  client: { id: string; name: string; timezone: string | null };
  media: HandoffMedia[];
  /** A format was chosen but the formatted copies aren't ready; media shown is the original */
  formatPending?: boolean;
}

// App deep links, with a web fallback if the app isn't installed
const APP_LINKS: Record<string, { scheme: string; web: string }> = {
  REDNOTE: { scheme: "xhsdiscover://home", web: "https://www.xiaohongshu.com/explore" },
  INSTAGRAM: { scheme: "instagram://camera", web: "https://www.instagram.com/" },
  TIKTOK: { scheme: "snssdk1233://", web: "https://www.tiktok.com/upload" },
  YOUTUBE: { scheme: "youtube://", web: "https://studio.youtube.com/" },
  FACEBOOK: { scheme: "fb://", web: "https://www.facebook.com/" },
  LINKEDIN: { scheme: "linkedin://", web: "https://www.linkedin.com/feed/" },
  TWITTER: { scheme: "twitter://post", web: "https://x.com/compose/post" },
  THREADS: { scheme: "barcelona://", web: "https://www.threads.net/" },
};

const TIPS: Record<string, string[]> = {
  REDNOTE: [
    "Tap + in RedNote, pick the saved photos or video in order.",
    "Paste the title into the title field (20 characters max) and the text into the body.",
    "Add the hashtags at the end of the body. RedNote turns them into topic links.",
    "Vertical 3:4 images fill the feed best. Check the crop before posting.",
  ],
  INSTAGRAM: [
    "Save the media first, then start the post from the Instagram app.",
    "Add music, stickers or mentions in the app. That's usually why this one is manual.",
    "Paste the first comment right after it goes live.",
  ],
  TIKTOK: [
    "Save the video, then upload it from the TikTok app.",
    "Pick a trending sound in the app if the plan calls for one.",
    "Paste the caption, then double check privacy and interaction settings before posting.",
  ],
  YOUTUBE: [
    "Upload from the YouTube app or YouTube Studio.",
    "Paste the title and description separately, and set the audience (made for kids or not).",
  ],
};

const TITLE_LIMITS: Record<string, number> = { REDNOTE: 20, YOUTUBE: 100 };
const BODY_LIMITS: Record<string, number> = { REDNOTE: 1000, INSTAGRAM: 2200, TIKTOK: 2200, YOUTUBE: 5000 };

function chars(text: string): number {
  return Array.from(text).length;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Older iOS / non-secure contexts
    const el = document.createElement("textarea");
    el.value = text;
    el.setAttribute("readonly", "");
    el.style.position = "fixed";
    el.style.opacity = "0";
    document.body.appendChild(el);
    el.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(el);
    return ok;
  }
}

function CopyButton({ label, text, onCopied }: { label: string; text: string; onCopied?: () => void }) {
  const [copied, setCopied] = useState(false);
  if (!text) return null;
  return (
    <button
      type="button"
      onClick={async () => {
        if (await copyToClipboard(text)) {
          setCopied(true);
          onCopied?.();
          setTimeout(() => setCopied(false), 2000);
        }
      }}
      className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-medium transition-colors ${
        copied
          ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-400"
          : "bg-bb-elevated border-bb-border text-bb-muted hover:text-white"
      }`}
    >
      {copied ? <Check size={13} /> : <Copy size={13} />}
      {copied ? "Copied" : label}
    </button>
  );
}

function Counter({ used, max }: { used: number; max?: number }) {
  if (!max) return null;
  const over = used > max;
  return (
    <span className={`text-[11px] font-mono ${over ? "text-red-400" : "text-bb-dim"}`}>
      {used}/{max}
    </span>
  );
}

type PrepState = { status: "idle" | "preparing" | "ready" | "error"; file?: File };

/** Fetch the original into a File so the share sheet can offer Save Image / Save Video. */
async function toFile(item: HandoffMedia): Promise<File> {
  const res = await fetch(item.url);
  if (!res.ok) throw new Error(`Download failed (${res.status})`);
  const blob = await res.blob();
  return new File([blob], item.filename, { type: blob.type || item.mimeType });
}

function canShareFiles(files: File[]): boolean {
  return typeof navigator !== "undefined" && !!navigator.canShare && navigator.canShare({ files });
}

function downloadFile(file: File) {
  const href = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = href;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 10_000);
}

const CHECKLIST = [
  { key: "media", label: "Media saved to phone" },
  { key: "caption", label: "Caption copied and pasted" },
  { key: "posted", label: "Posted in the app" },
] as const;

export default function HandoffView({ post }: { post: HandoffPost }) {
  const router = useRouter();
  const tz = safeTimeZone(post.client.timezone);
  const platformLabel = getPlatformLabel(post.platform);
  const app = APP_LINKS[post.platform];

  const [prep, setPrep] = useState<Record<number, PrepState>>({});
  const [checks, setChecks] = useState<Record<string, boolean>>({});
  const [postUrl, setPostUrl] = useState("");
  const [busy, setBusy] = useState<null | "posted" | "snooze">(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState(post.status);
  const [qr, setQr] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    QRCode.toDataURL(window.location.href, { margin: 1, width: 180, color: { dark: "#0A0A0A", light: "#FFFFFF" } })
      .then(setQr)
      .catch(() => {});
  }, []);

  const hashtagText = post.hashtags.map((t) => (t.startsWith("#") ? t : `#${t}`)).join(" ");
  const fullCaption = [post.body || "", hashtagText].filter(Boolean).join("\n\n");
  const titleLimit = TITLE_LIMITS[post.platform];
  const bodyLimit = BODY_LIMITS[post.platform];
  const titleChars = chars(post.title || "");
  const captionChars = chars(fullCaption);

  const due = post.scheduledAt ? new Date(post.scheduledAt).getTime() <= Date.now() : true;
  const done = status === "PUBLISHED";
  const heldByClient = post.approvalStatus === "PENDING" || post.approvalStatus === "CHANGES_REQUESTED";
  const canMarkPosted =
    !done && (status === "ACTION_NEEDED" || ((status === "SCHEDULED" || status === "DRAFT") && post.publishMode === "ASSISTED"));

  const allReady = post.media.length > 0 && post.media.every((_, i) => prep[i]?.status === "ready");
  const anyPreparing = Object.values(prep).some((p) => p.status === "preparing");

  const tick = (key: string) => setChecks((c) => ({ ...c, [key]: true }));

  async function prepare(indices: number[]) {
    setError(null);
    setPrep((p) => {
      const next = { ...p };
      for (const i of indices) if (next[i]?.status !== "ready") next[i] = { status: "preparing" };
      return next;
    });
    await Promise.all(
      indices.map(async (i) => {
        if (prep[i]?.status === "ready") return;
        try {
          const file = await toFile(post.media[i]);
          setPrep((p) => ({ ...p, [i]: { status: "ready", file } }));
        } catch {
          setPrep((p) => ({ ...p, [i]: { status: "error" } }));
        }
      })
    );
  }

  // Called straight from a tap so iOS keeps the user gesture for the share sheet
  async function saveFiles(files: File[]) {
    setError(null);
    if (canShareFiles(files)) {
      try {
        await navigator.share({ files });
        tick("media");
      } catch (err) {
        if ((err as Error).name !== "AbortError") setError("Couldn't open the share sheet. Try saving one file at a time.");
      }
      return;
    }
    for (const f of files) downloadFile(f);
    tick("media");
  }

  function downloadAllAsZip() {
    const ids = post.media.map((m) => m.mediaId).filter((x): x is string => !!x);
    const form = document.createElement("form");
    form.method = "POST";
    form.action = "/api/client-media/download-zip";
    for (const [name, value] of [
      ["ids", JSON.stringify(ids)],
      ["name", `${post.client.name} ${platformLabel}`],
    ]) {
      const input = document.createElement("input");
      input.type = "hidden";
      input.name = name;
      input.value = value;
      form.appendChild(input);
    }
    document.body.appendChild(form);
    form.submit();
    form.remove();
    tick("media");
  }

  function openApp() {
    if (!app) return;
    const started = Date.now();
    window.location.href = app.scheme;
    setTimeout(() => {
      // Still here after the scheme attempt: the app isn't installed (or we're on desktop)
      if (document.visibilityState === "visible" && Date.now() - started < 3000) {
        window.open(app.web, "_blank", "noopener,noreferrer");
      }
    }, 1500);
  }

  async function markPosted() {
    setBusy("posted");
    setError(null);
    try {
      const res = await fetch(`/api/content-posts/${post.id}/mark-posted`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ externalUrl: postUrl.trim() || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) throw new Error(data.error || "Couldn't mark it as posted.");
      setStatus("PUBLISHED");
      tick("posted");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function snooze(until: Date) {
    setBusy("snooze");
    setError(null);
    try {
      const res = await fetch(`/api/content-posts/${post.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "SCHEDULED", scheduledAt: until.toISOString() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) throw new Error(data.error || "Couldn't snooze this post.");
      setStatus("SCHEDULED");
      setNotice(`Snoozed. You'll get a reminder ${formatInZone(until, tz)}.`);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const statusChip = useMemo(() => {
    switch (status) {
      case "PUBLISHED":
        return { label: "Posted", cls: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30" };
      case "ACTION_NEEDED":
        return { label: "Ready to post", cls: "bg-bb-orange/15 text-bb-orange border-bb-orange/30" };
      case "SCHEDULED":
        return { label: "Scheduled", cls: "bg-bb-elevated text-bb-muted border-bb-border" };
      case "DRAFT":
        return { label: "Draft", cls: "bg-bb-elevated text-bb-muted border-bb-border" };
      default:
        return { label: status.replace(/_/g, " ").toLowerCase(), cls: "bg-bb-elevated text-bb-muted border-bb-border" };
    }
  }, [status]);

  return (
    <div className="max-w-2xl mx-auto pb-24 space-y-4">
      <Link href="/content" className="inline-flex items-center gap-1.5 text-xs text-bb-dim hover:text-white transition-colors">
        <ArrowLeft size={13} /> Content calendar
      </Link>

      {/* Header */}
      <div className="bg-bb-surface border border-bb-border rounded-xl p-4">
        <div className="flex items-start gap-3">
          <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${post.platform === "REDNOTE" ? "bg-rose-500/15" : "bg-bb-elevated"}`}>
            <PlatformIcon platform={post.platform} size={22} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-lg font-display font-semibold text-white">Post on {platformLabel}</h1>
              <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${statusChip.cls}`}>{statusChip.label}</span>
            </div>
            <p className="text-sm text-bb-muted truncate">
              <Link href={`/clients/${post.client.id}`} className="hover:text-white">{post.client.name}</Link>
              {post.title ? ` · ${post.title}` : ""}
            </p>
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-bb-dim">
              {post.scheduledAt && (
                <span className="flex items-center gap-1">
                  <Clock size={12} /> {formatInZone(post.scheduledAt, tz)}
                  {!tz && " (your time)"}
                </span>
              )}
              <span className="flex items-center gap-1">
                <User size={12} /> {post.assigneeName || "Unassigned"}
              </span>
            </div>
          </div>
        </div>
      </div>

      {done && (
        <div className="bg-emerald-500/5 border border-emerald-500/30 rounded-xl p-4 flex items-start gap-3">
          <CheckCircle2 size={18} className="text-emerald-400 shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="text-white font-medium">Marked as posted</p>
            {post.externalUrl || postUrl ? (
              <a href={post.externalUrl || postUrl} target="_blank" rel="noopener noreferrer" className="text-bb-orange hover:text-bb-orange-light inline-flex items-center gap-1 text-xs mt-1">
                View the post <ExternalLink size={11} />
              </a>
            ) : (
              <p className="text-bb-dim text-xs mt-1">Nothing else to do here.</p>
            )}
          </div>
        </div>
      )}

      {heldByClient && !done && (
        <div className="bg-red-500/5 border border-red-500/30 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle size={18} className="text-red-400 shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="text-white font-medium">
              {post.approvalStatus === "PENDING" ? "Waiting on client approval. Don't post yet." : "The client asked for changes. Don't post this version."}
            </p>
            {post.approvalNote && <p className="text-bb-muted text-xs mt-1 whitespace-pre-wrap">&ldquo;{post.approvalNote}&rdquo;</p>}
          </div>
        </div>
      )}

      {!done && !due && post.scheduledAt && (
        <p className="text-xs text-bb-dim px-1">Not due yet. You can post early and mark it as posted below.</p>
      )}

      {notice && <p className="text-xs text-emerald-400 px-1">{notice}</p>}

      {/* Desktop: hand the page to a phone */}
      {qr && (
        <div className="hidden md:flex items-center gap-4 bg-bb-surface border border-bb-border rounded-xl p-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qr} alt="QR code for this page" width={120} height={120} className="rounded-lg" />
          <div className="text-sm">
            <p className="text-white font-medium flex items-center gap-1.5"><Smartphone size={14} /> Open this on your phone</p>
            <p className="text-bb-dim text-xs mt-1">Scan with the camera. Saving media and opening the app work best from the phone you post with.</p>
          </div>
        </div>
      )}

      {/* Step 1: media */}
      {post.media.length > 0 && (
        <section className="bg-bb-surface border border-bb-border rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-medium text-white">1. Save the media</h2>
            <span className="text-xs text-bb-dim">{post.media.length} file{post.media.length === 1 ? "" : "s"}, in posting order</span>
          </div>
          {post.formatPending && (
            <p className="flex items-start gap-2 text-xs text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
              <AlertTriangle size={14} className="shrink-0 mt-0.5" />
              The formatted versions are still being made, so these are the original files. Refresh in a minute to get the right shape.
            </p>
          )}

          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
            {post.media.map((m, i) => {
              const state = prep[i]?.status || "idle";
              const thumb = m.kind === "image" ? optimizedThumb(m.thumbnailUrl || m.url, 384) : m.thumbnailUrl ? optimizedThumb(m.thumbnailUrl, 384) : null;
              return (
                <div key={m.url} className="space-y-1.5">
                  <div className="relative aspect-[3/4] rounded-lg overflow-hidden bg-bb-black border border-bb-border">
                    {thumb ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={thumb} alt={m.filename} className="w-full h-full object-cover" loading="lazy" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-bb-dim">
                        {m.kind === "video" ? <Film size={22} /> : <ImageIcon size={22} />}
                      </div>
                    )}
                    <span className="absolute top-1 left-1 text-[10px] font-mono bg-black/70 text-white rounded px-1">{i + 1}</span>
                    {m.kind === "video" && (
                      <span className="absolute bottom-1 right-1 bg-black/70 rounded p-0.5"><Film size={11} className="text-white" /></span>
                    )}
                  </div>
                  <button
                    type="button"
                    disabled={state === "preparing"}
                    onClick={() => (state === "ready" && prep[i].file ? saveFiles([prep[i].file!]) : prepare([i]))}
                    className={`w-full flex items-center justify-center gap-1 py-1.5 rounded-md text-[11px] font-medium border transition-colors disabled:opacity-60 ${
                      state === "ready"
                        ? "bg-bb-orange border-bb-orange text-white hover:bg-bb-orange-light"
                        : state === "error"
                          ? "bg-red-500/10 border-red-500/30 text-red-400"
                          : "bg-bb-elevated border-bb-border text-bb-muted hover:text-white"
                    }`}
                  >
                    {state === "preparing" ? <Loader2 size={11} className="animate-spin" /> : state === "ready" ? <Share2 size={11} /> : <Download size={11} />}
                    {state === "preparing" ? "Loading" : state === "ready" ? "Save" : state === "error" ? "Retry" : "Get"}
                  </button>
                </div>
              );
            })}
          </div>

          <div className="flex flex-wrap gap-2">
            {allReady ? (
              <button
                type="button"
                onClick={() => saveFiles(post.media.map((_, i) => prep[i].file!))}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg bg-bb-orange hover:bg-bb-orange-light text-white text-sm font-medium transition-colors"
              >
                <Share2 size={15} /> Save all {post.media.length} to phone
              </button>
            ) : (
              <button
                type="button"
                disabled={anyPreparing}
                onClick={() => prepare(post.media.map((_, i) => i))}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg bg-bb-elevated border border-bb-border text-white text-sm font-medium hover:border-bb-orange transition-colors disabled:opacity-60"
              >
                {anyPreparing ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
                {anyPreparing ? "Getting files ready" : "Get all files ready"}
              </button>
            )}
            {post.media.length > 1 && post.media.every((m) => m.mediaId) && (
              <button
                type="button"
                onClick={downloadAllAsZip}
                className="hidden md:flex items-center gap-1.5 px-3 py-2.5 rounded-lg bg-bb-elevated border border-bb-border text-bb-muted hover:text-white text-xs transition-colors"
              >
                <Download size={13} /> Zip
              </button>
            )}
          </div>
          <p className="text-[11px] text-bb-dim">
            Tap Get, then Save. On iPhone choose Save Image or Save Video in the share sheet.
            {post.media.some((m) => m.fileSize && m.fileSize > 200 * 1024 * 1024) && " Large videos take a moment to load."}
            {post.media.some((m) => m.fileSize) &&
              ` Total ${formatBytes(post.media.reduce((sum, m) => sum + (m.fileSize || 0), 0))}.`}
          </p>
        </section>
      )}

      {/* Step 2: text */}
      <section className="bg-bb-surface border border-bb-border rounded-xl p-4 space-y-3">
        <h2 className="text-sm font-medium text-white">2. Copy the text</h2>

        {post.title && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs text-bb-dim uppercase tracking-wide">Title</span>
              <Counter used={titleChars} max={titleLimit} />
            </div>
            <p className="text-sm text-white bg-bb-black border border-bb-border rounded-lg px-3 py-2">{post.title}</p>
            {titleLimit && titleChars > titleLimit && (
              <p className="text-[11px] text-red-400">Over the {titleLimit} character limit. Shorten it in the app.</p>
            )}
            <CopyButton label="Copy title" text={post.title} />
          </div>
        )}

        {fullCaption && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs text-bb-dim uppercase tracking-wide">{post.platform === "YOUTUBE" ? "Description" : "Caption"}</span>
              <Counter used={captionChars} max={bodyLimit} />
            </div>
            <p className="text-sm text-bb-muted bg-bb-black border border-bb-border rounded-lg px-3 py-2 whitespace-pre-wrap max-h-60 overflow-y-auto">
              {fullCaption}
            </p>
            {bodyLimit && captionChars > bodyLimit && (
              <p className="text-[11px] text-red-400">Over the {bodyLimit} character limit. Trim it before posting.</p>
            )}
            <div className="flex flex-wrap gap-2">
              <CopyButton label="Copy full caption" text={fullCaption} onCopied={() => tick("caption")} />
              {post.body && hashtagText && <CopyButton label="Text only" text={post.body} />}
              {hashtagText && <CopyButton label="Hashtags" text={hashtagText} />}
            </div>
          </div>
        )}

        {post.firstComment && (
          <div className="space-y-1.5">
            <span className="text-xs text-bb-dim uppercase tracking-wide">First comment</span>
            <p className="text-sm text-bb-muted bg-bb-black border border-bb-border rounded-lg px-3 py-2 whitespace-pre-wrap">{post.firstComment}</p>
            <CopyButton label="Copy first comment" text={post.firstComment} />
          </div>
        )}

        {(post.taggedUsers.length > 0 || post.collaborators.length > 0 || post.location) && (
          <div className="flex flex-wrap gap-2">
            {post.taggedUsers.length > 0 && <CopyButton label={`Tags (${post.taggedUsers.length})`} text={post.taggedUsers.join(" ")} />}
            {post.collaborators.length > 0 && <CopyButton label={`Collaborators (${post.collaborators.length})`} text={post.collaborators.join(" ")} />}
            {post.location && <CopyButton label="Location" text={post.location} />}
          </div>
        )}

        {!post.title && !fullCaption && !post.firstComment && <p className="text-xs text-bb-dim">No text on this post.</p>}
      </section>

      {/* Step 3: post */}
      <section className="bg-bb-surface border border-bb-border rounded-xl p-4 space-y-3">
        <h2 className="text-sm font-medium text-white">3. Post it</h2>
        {app && (
          <button
            type="button"
            onClick={openApp}
            className={`w-full flex items-center justify-center gap-2 py-3 rounded-lg text-white text-sm font-semibold transition-colors ${
              post.platform === "REDNOTE" ? "bg-rose-600 hover:bg-rose-500" : "bg-bb-elevated border border-bb-border hover:border-bb-orange"
            }`}
          >
            <PlatformIcon platform={post.platform} size={16} className={post.platform === "REDNOTE" ? "text-white" : undefined} />
            Open {platformLabel}
          </button>
        )}
        {TIPS[post.platform] && (
          <ul className="space-y-1.5">
            {TIPS[post.platform].map((tip) => (
              <li key={tip} className="text-xs text-bb-muted flex gap-2">
                <span className="text-bb-orange">•</span>
                {tip}
              </li>
            ))}
          </ul>
        )}

        <div className="border-t border-bb-border pt-3 space-y-2">
          {CHECKLIST.map((item) => (
            <label key={item.key} className="flex items-center gap-2.5 text-sm text-bb-muted cursor-pointer select-none">
              <input
                type="checkbox"
                checked={!!checks[item.key] || (item.key === "posted" && done)}
                onChange={(e) => setChecks((c) => ({ ...c, [item.key]: e.target.checked }))}
                className="w-4 h-4 accent-[#FF6B00]"
              />
              <span className={checks[item.key] ? "line-through text-bb-dim" : ""}>{item.label}</span>
            </label>
          ))}
        </div>
      </section>

      {/* Step 4: record it */}
      {canMarkPosted && (
        <section className="bg-bb-surface border border-bb-orange/30 rounded-xl p-4 space-y-3">
          <h2 className="text-sm font-medium text-white">4. Mark it as posted</h2>
          <input
            type="url"
            inputMode="url"
            value={postUrl}
            onChange={(e) => setPostUrl(e.target.value)}
            placeholder="Paste the post link (optional)"
            className="w-full px-3 py-2.5 bg-bb-black border border-bb-border rounded-lg text-sm text-white placeholder:text-bb-dim focus:outline-none focus:border-bb-orange"
          />
          <button
            type="button"
            onClick={markPosted}
            disabled={busy !== null || heldByClient}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-lg bg-bb-orange hover:bg-bb-orange-light text-white text-sm font-semibold transition-colors disabled:opacity-50"
          >
            {busy === "posted" ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
            Mark as posted
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => snooze(new Date(Date.now() + 60 * 60 * 1000))}
              disabled={busy !== null}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-bb-elevated border border-bb-border text-bb-muted hover:text-white text-xs transition-colors disabled:opacity-50"
            >
              <Clock size={13} /> Remind me in 1 hour
            </button>
            <button
              type="button"
              onClick={() => snooze(tomorrowAtInZone(9, tz))}
              disabled={busy !== null}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-bb-elevated border border-bb-border text-bb-muted hover:text-white text-xs transition-colors disabled:opacity-50"
            >
              <Clock size={13} /> Tomorrow 9am
            </button>
          </div>
          {!tz && <p className="text-[11px] text-bb-dim">This client has no timezone set, so 9am is your local time.</p>}
        </section>
      )}

      {error && <p className="text-sm text-red-400 px-1">{error}</p>}
    </div>
  );
}
