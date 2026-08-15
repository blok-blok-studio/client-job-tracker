"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams } from "next/navigation";
import Image from "next/image";
import {
  Check, Loader2, FileText, Download, Pencil, ThumbsUp, ChevronLeft, ChevronRight,
  Play, Folder, MessageCircle, Send, CheckCheck,
} from "lucide-react";
import AddToHomeScreen from "@/components/shared/AddToHomeScreen";

interface ReviewFile {
  id: string;
  url: string;
  filename: string;
  fileSize: number;
  mimeType: string;
  folder?: string | null;
  decision?: "APPROVED" | "CHANGES_REQUESTED" | null;
}

interface ReviewComment {
  id: string;
  fileId: string | null;
  author: string;
  fromTeam: boolean;
  body: string;
  createdAt: string;
}

interface FileGroup {
  folder: string | null;
  media: ReviewFile[];
  docs: ReviewFile[];
}

function isMediaFile(f: ReviewFile): boolean {
  return f.mimeType.startsWith("image/") || f.mimeType.startsWith("video/");
}

/**
 * When every file lives under one shared root (a "master folder" was uploaded),
 * drop that root from headings so sections read "Carousel 1", not "Master/Carousel 1".
 */
function stripCommonRoot(files: ReviewFile[]): ReviewFile[] {
  let current = files;
  for (;;) {
    const folders = current.map((f) => f.folder).filter((x): x is string => !!x);
    if (folders.length !== current.length) return current; // some files at root — keep as-is
    const distinct = new Set(folders);
    if (distinct.size < 2) return current; // single section — its full name is the label
    const roots = new Set(folders.map((f) => f.split("/")[0]));
    if (roots.size !== 1) return current;
    current = current.map((f) => {
      const rest = f.folder!.split("/").slice(1).join("/");
      return { ...f, folder: rest || null };
    });
  }
}

/** Group files by their upload folder, preserving the order they were sent in. */
function groupByFolder(files: ReviewFile[]): FileGroup[] {
  const order: Array<string | null> = [];
  const map = new Map<string | null, { media: ReviewFile[]; docs: ReviewFile[] }>();
  for (const f of files) {
    const key = f.folder ?? null;
    if (!map.has(key)) {
      map.set(key, { media: [], docs: [] });
      order.push(key);
    }
    map.get(key)![isMediaFile(f) ? "media" : "docs"].push(f);
  }
  return order.map((folder) => ({ folder, ...map.get(folder)! }));
}

interface ReviewData {
  clientName: string;
  company: string | null;
  title: string;
  message: string | null;
  content: string | null;
  status: string;
  revisionNotes: string | null;
  respondedBy: string | null;
  respondedAt: string | null;
  createdAt: string;
  files: ReviewFile[];
  comments: ReviewComment[];
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function DecisionBadge({ decision }: { decision: ReviewFile["decision"] }) {
  if (!decision) return null;
  return decision === "APPROVED" ? (
    <span className="flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-green-500/15 text-green-400 border border-green-500/30">
      <Check size={11} /> Approved
    </span>
  ) : (
    <span className="flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-bb-orange/15 text-bb-orange border border-bb-orange/30">
      <Pencil size={11} /> Changes requested
    </span>
  );
}

// Instagram-style swipeable carousel: videos/reels play inline, images swipe
// through with arrows (desktop) or native touch scroll-snap (mobile).
function MediaCarousel({
  items,
  onIndexChange,
}: {
  items: ReviewFile[];
  onIndexChange?: (i: number) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);

  const handleScroll = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    const i = Math.round(el.scrollLeft / el.clientWidth);
    setIndex((prev) => {
      if (prev === i) return prev;
      onIndexChange?.(i);
      return i;
    });
  }, [onIndexChange]);

  // Pause any video that swipes off-screen
  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    el.querySelectorAll("video").forEach((v) => {
      const slide = v.closest("[data-slide]") as HTMLElement | null;
      if (slide && Number(slide.dataset.slide) !== index && !v.paused) v.pause();
    });
  }, [index]);

  function scrollTo(i: number) {
    const el = trackRef.current;
    if (!el) return;
    const clamped = Math.max(0, Math.min(items.length - 1, i));
    el.scrollTo({ left: clamped * el.clientWidth, behavior: "smooth" });
  }

  return (
    <div className="relative bg-bb-surface border border-bb-border rounded-xl overflow-hidden">
      <div
        ref={trackRef}
        onScroll={handleScroll}
        className="flex overflow-x-auto snap-x snap-mandatory scrollbar-hide"
      >
        {items.map((file, i) => (
          <div
            key={file.id}
            data-slide={i}
            className="w-full shrink-0 snap-center bg-black flex items-center justify-center"
          >
            {file.mimeType.startsWith("video/") ? (
              <video
                src={file.url}
                controls
                playsInline
                preload="metadata"
                className="w-full max-h-[70vh] object-contain"
              />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={file.url}
                alt={file.filename}
                className="w-full max-h-[70vh] object-contain"
                draggable={false}
              />
            )}
          </div>
        ))}
      </div>

      {/* Decision badge for the visible slide */}
      {items[index]?.decision && (
        <div className="absolute top-3 left-3 pointer-events-none">
          <DecisionBadge decision={items[index].decision} />
        </div>
      )}

      {items.length > 1 && (
        <>
          {/* Arrows (hidden on touch-first small screens; swipe handles it) */}
          {index > 0 && (
            <button
              onClick={() => scrollTo(index - 1)}
              className="hidden sm:flex absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 items-center justify-center rounded-full bg-black/60 hover:bg-black/80 text-white transition-colors"
              aria-label="Previous"
            >
              <ChevronLeft size={20} />
            </button>
          )}
          {index < items.length - 1 && (
            <button
              onClick={() => scrollTo(index + 1)}
              className="hidden sm:flex absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 items-center justify-center rounded-full bg-black/60 hover:bg-black/80 text-white transition-colors"
              aria-label="Next"
            >
              <ChevronRight size={20} />
            </button>
          )}

          {/* Counter */}
          <div className="absolute top-3 right-3 px-2 py-0.5 rounded-full bg-black/60 text-white text-xs font-medium pointer-events-none">
            {index + 1} / {items.length}
          </div>

          {/* Dots */}
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
            {items.map((f, i) => (
              <button
                key={i}
                onClick={() => scrollTo(i)}
                aria-label={`Go to item ${i + 1}`}
                className={`w-1.5 h-1.5 rounded-full transition-colors ${
                  i === index
                    ? "bg-white"
                    : f.decision === "APPROVED"
                      ? "bg-green-400/70"
                      : f.decision === "CHANGES_REQUESTED"
                        ? "bg-bb-orange/70"
                        : "bg-white/40"
                }`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function CommentThread({
  comments,
  onReply,
  busy,
}: {
  comments: ReviewComment[];
  onReply: (body: string) => Promise<void>;
  busy: boolean;
}) {
  const [reply, setReply] = useState("");
  const [open, setOpen] = useState(false);

  async function send() {
    if (!reply.trim()) return;
    await onReply(reply.trim());
    setReply("");
    setOpen(false);
  }

  return (
    <div className="space-y-2">
      {comments.map((c) => (
        <div
          key={c.id}
          className={`rounded-lg p-2.5 text-sm ${
            c.fromTeam
              ? "bg-bb-orange/5 border border-bb-orange/20"
              : "bg-bb-black border border-bb-border"
          }`}
        >
          <p className={`text-[11px] font-medium mb-1 ${c.fromTeam ? "text-bb-orange" : "text-bb-dim"}`}>
            {c.fromTeam ? `${c.author} · Blok Blok Studio` : c.author}
            <span className="text-bb-dim font-normal"> · {new Date(c.createdAt).toLocaleDateString()}</span>
          </p>
          <p className="text-bb-muted whitespace-pre-wrap">{c.body}</p>
        </div>
      ))}

      {open ? (
        <div className="flex gap-2">
          <input
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
            placeholder="Write a reply…"
            autoFocus
            className="flex-1 px-3 py-2 bg-bb-black border border-bb-border rounded-lg text-white placeholder:text-bb-dim focus:outline-none focus:border-bb-orange text-sm"
          />
          <button
            onClick={send}
            disabled={busy || !reply.trim()}
            className="px-3 py-2 bg-bb-orange hover:bg-bb-orange-light text-white rounded-lg disabled:opacity-50"
            aria-label="Send reply"
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
          </button>
        </div>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="flex items-center gap-1.5 text-xs text-bb-dim hover:text-bb-orange transition-colors"
        >
          <MessageCircle size={12} /> Reply
        </button>
      )}
    </div>
  );
}

/** Approve / request-changes controls + thread for one item (slide or document). */
function ItemReview({
  file,
  canDecide,
  comments,
  onDecide,
  onComment,
  busy,
}: {
  file: ReviewFile;
  canDecide: boolean;
  comments: ReviewComment[];
  onDecide: (fileIds: string[], decision: "approve" | "request_changes", note?: string) => Promise<void>;
  onComment: (body: string, fileId: string) => Promise<void>;
  busy: boolean;
}) {
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState("");

  // A fresh slide swipes in — collapse any half-written note from the last one
  useEffect(() => {
    setNoteOpen(false);
    setNote("");
  }, [file.id]);

  async function requestChanges() {
    await onDecide([file.id], "request_changes", note.trim() || undefined);
    setNoteOpen(false);
    setNote("");
  }

  const itemComments = comments.filter((c) => c.fileId === file.id);

  return (
    <div className="bg-bb-surface border border-bb-border rounded-xl p-3 space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-bb-dim truncate">{file.filename}</span>
        <DecisionBadge decision={file.decision} />
      </div>

      {canDecide && (
        <>
          {!noteOpen ? (
            <div className="flex gap-2">
              <button
                onClick={() => onDecide([file.id], "approve")}
                disabled={busy}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 ${
                  file.decision === "APPROVED"
                    ? "bg-green-600 text-white"
                    : "bg-bb-black border border-bb-border hover:border-green-500 text-bb-muted hover:text-green-400"
                }`}
              >
                <ThumbsUp size={14} /> {file.decision === "APPROVED" ? "Approved" : "Approve"}
              </button>
              <button
                onClick={() => setNoteOpen(true)}
                disabled={busy}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 ${
                  file.decision === "CHANGES_REQUESTED"
                    ? "bg-bb-orange text-white"
                    : "bg-bb-black border border-bb-border hover:border-bb-orange text-bb-muted hover:text-bb-orange"
                }`}
              >
                <Pencil size={13} /> {file.decision === "CHANGES_REQUESTED" ? "Changes requested" : "Request changes"}
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                autoFocus
                placeholder="What should change on this one? (optional but helpful)"
                className="w-full px-3 py-2 bg-bb-black border border-bb-border rounded-lg text-white placeholder:text-bb-dim focus:outline-none focus:border-bb-orange text-sm"
              />
              <div className="flex gap-2">
                <button
                  onClick={requestChanges}
                  disabled={busy}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-bb-orange hover:bg-bb-orange-light text-white rounded-lg text-sm font-medium disabled:opacity-50"
                >
                  {busy ? <Loader2 size={14} className="animate-spin" /> : <Pencil size={13} />}
                  Mark for changes
                </button>
                <button
                  onClick={() => { setNoteOpen(false); setNote(""); }}
                  disabled={busy}
                  className="px-4 py-2 bg-bb-black border border-bb-border text-bb-muted rounded-lg text-sm"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {(itemComments.length > 0 || !canDecide) && (
        <CommentThread
          comments={itemComments}
          onReply={(body) => onComment(body, file.id)}
          busy={busy}
        />
      )}
    </div>
  );
}

export default function DeliverableReviewPage() {
  const { token } = useParams<{ token: string }>();
  const [loading, setLoading] = useState(true);
  const [review, setReview] = useState<ReviewData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [mode, setMode] = useState<"idle" | "revision">("idle");
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [itemBusy, setItemBusy] = useState(false);
  const [done, setDone] = useState<"approved" | "revision" | null>(null);
  // Which slide is visible per carousel section, so the controls follow the swipe
  const [slideIndex, setSlideIndex] = useState<Record<string, number>>({});

  useEffect(() => {
    async function fetchReview() {
      try {
        const res = await fetch(`/api/review/${token}`);
        const data = await res.json();
        if (data.success) {
          setReview(data.data);
          if (data.data.status === "APPROVED") setDone("approved");
          if (data.data.status === "REVISION_REQUESTED") setDone("revision");
        } else {
          setError(data.error || "Invalid review link");
        }
      } catch {
        setError("Unable to load this review");
      } finally {
        setLoading(false);
      }
    }
    fetchReview();
  }, [token]);

  const canDecide = !done;

  async function decideItems(
    fileIds: string[],
    decision: "approve" | "request_changes",
    note?: string
  ) {
    setItemBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/review/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "review_item",
          fileIds,
          decision,
          note,
          name: name.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (data.success) {
        const ids = new Set<string>(data.data.fileIds);
        setReview((prev) =>
          prev
            ? {
                ...prev,
                files: prev.files.map((f) =>
                  ids.has(f.id) ? { ...f, decision: data.data.decision } : f
                ),
                comments: data.data.comment ? [...prev.comments, data.data.comment] : prev.comments,
              }
            : prev
        );
      } else {
        setError(data.error || "Failed to save — please try again.");
      }
    } catch {
      setError("Failed to save — please try again.");
    } finally {
      setItemBusy(false);
    }
  }

  async function postComment(body: string, fileId?: string) {
    setItemBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/review/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "comment",
          fileId,
          body,
          name: name.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setReview((prev) =>
          prev ? { ...prev, comments: [...prev.comments, data.data.comment] } : prev
        );
      } else {
        setError(data.error || "Failed to send — please try again.");
      }
    } catch {
      setError("Failed to send — please try again.");
    } finally {
      setItemBusy(false);
    }
  }

  async function respond(action: "approve" | "request_revision" | "submit") {
    if (action === "request_revision" && !notes.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/review/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          notes: notes.trim() || undefined,
          name: name.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setDone(data.data.status === "APPROVED" ? "approved" : "revision");
        setReview((prev) => (prev ? { ...prev, status: data.data.status } : prev));
        window.scrollTo({ top: 0, behavior: "smooth" });
      } else {
        setError(data.error || "Failed to submit. Please try again.");
      }
    } catch {
      setError("Failed to submit. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const inputClass =
    "w-full px-3 py-2.5 bg-bb-black border border-bb-border rounded-lg text-white placeholder:text-bb-dim focus:outline-none focus:ring-2 focus:ring-bb-orange/50 focus:border-bb-orange text-sm transition-colors";

  if (loading) {
    return (
      <div className="min-h-screen bg-bb-black flex items-center justify-center">
        <Loader2 className="animate-spin text-bb-orange" size={32} />
      </div>
    );
  }

  if (error && !review) {
    return (
      <div className="min-h-screen bg-bb-black flex items-center justify-center px-4">
        <div className="text-center space-y-4 max-w-md">
          <Image
            src="/bb_logo_wordmark_subhead_WHT_PNG.png"
            alt="Blok Blok Studio"
            width={180}
            height={60}
            className="mx-auto mb-6"
          />
          <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center mx-auto">
            <span className="text-red-400 text-2xl">!</span>
          </div>
          <h1 className="text-xl font-display font-semibold text-white">Review Unavailable</h1>
          <p className="text-bb-muted text-sm">{error}</p>
          <p className="text-bb-dim text-xs">
            If you think this is a mistake, please contact us at{" "}
            <a href="mailto:chase@blokblokstudio.com" className="text-bb-orange hover:underline">
              chase@blokblokstudio.com
            </a>
          </p>
        </div>
      </div>
    );
  }

  if (!review) return null;

  const firstName = review.clientName.split(" ")[0];
  const groups = groupByFolder(stripCommonRoot(review.files));
  const hasMedia = review.files.some(isMediaFile);
  const hasFiles = review.files.length > 0;
  const showFolderHeadings = groups.length > 1 || groups.some((g) => g.folder !== null);

  const decidedCount = review.files.filter((f) => f.decision).length;
  const allDecided = hasFiles && decidedCount === review.files.length;
  const changesCount = review.files.filter((f) => f.decision === "CHANGES_REQUESTED").length;
  const generalComments = review.comments.filter((c) => !c.fileId);
  const docs = review.files.filter((f) => !isMediaFile(f));

  return (
    <div className="min-h-screen bg-bb-black">
      <div className="max-w-3xl mx-auto px-4 py-8 sm:py-12">
        {/* Header */}
        <div className="text-center mb-8">
          <Image
            src="/bb_logo_wordmark_subhead_WHT_PNG.png"
            alt="Blok Blok Studio"
            width={200}
            height={67}
            className="mx-auto mb-8"
          />
          <h1 className="text-2xl font-display font-semibold text-white">{review.title}</h1>
          {!done && (
            <p className="text-bb-muted mt-2 text-sm sm:text-base">
              {hasFiles
                ? `Hi ${firstName} — go through each item below and mark it Approve or Request changes, then submit your review at the bottom.`
                : `Hi ${firstName} — take a look at the finished work below, then let us know what you think.`}
            </p>
          )}
        </div>

        {/* Response confirmation */}
        {done && (
          <div
            className={`border rounded-xl p-6 mb-8 text-center space-y-3 ${
              done === "approved"
                ? "bg-green-500/5 border-green-500/30"
                : "bg-bb-orange/5 border-bb-orange/30"
            }`}
          >
            <div
              className={`w-14 h-14 rounded-full flex items-center justify-center mx-auto ${
                done === "approved" ? "bg-green-500/10" : "bg-bb-orange/10"
              }`}
            >
              {done === "approved" ? (
                <Check className="text-green-400" size={28} />
              ) : (
                <Pencil className="text-bb-orange" size={24} />
              )}
            </div>
            <h2 className="text-xl font-display font-semibold text-white">
              {done === "approved" ? "Approved — thank you!" : "Revision requested"}
            </h2>
            <p className="text-bb-muted text-sm max-w-md mx-auto">
              {done === "approved"
                ? "We've been notified of your approval. Thanks for reviewing!"
                : "We've received your notes and will get started on the changes. You'll get an updated link when it's ready."}
            </p>
            {done === "revision" && review.revisionNotes && (
              <div className="bg-bb-black border border-bb-border rounded-lg p-4 text-left max-w-md mx-auto">
                <p className="text-xs font-medium text-bb-dim uppercase tracking-wide mb-1.5">Your notes</p>
                <p className="text-sm text-bb-muted whitespace-pre-wrap">{review.revisionNotes}</p>
              </div>
            )}
            <p className="text-bb-dim text-xs">
              You can still reply on any item below — we&apos;ll see it right away.
            </p>
          </div>
        )}

        {/* Progress while reviewing */}
        {!done && hasFiles && (
          <div className="sticky top-3 z-10 mb-6">
            <div className="bg-bb-surface/95 backdrop-blur border border-bb-border rounded-full px-4 py-2 flex items-center justify-between gap-3 shadow-lg">
              <span className="text-xs text-bb-muted">
                {decidedCount} of {review.files.length} item{review.files.length !== 1 ? "s" : ""} marked
                {changesCount > 0 && (
                  <span className="text-bb-orange"> · {changesCount} for changes</span>
                )}
              </span>
              <div className="flex-1 max-w-[140px] h-1.5 bg-bb-black rounded-full overflow-hidden">
                <div
                  className="h-full bg-bb-orange rounded-full transition-all"
                  style={{ width: `${hasFiles ? (decidedCount / review.files.length) * 100 : 0}%` }}
                />
              </div>
            </div>
          </div>
        )}

        {/* Media — front and center, one section per folder as uploaded */}
        {hasMedia && (
          <div className="mb-6 space-y-8">
            {groups.filter((g) => g.media.length > 0).map((g) => {
              const key = g.folder ?? "__root__";
              const idx = Math.min(slideIndex[key] ?? 0, g.media.length - 1);
              const current = g.media[idx];
              const allApproved = g.media.every((f) => f.decision === "APPROVED");
              return (
                <div key={key} className="space-y-2">
                  {showFolderHeadings && (
                    <div className="flex items-center gap-2 mb-2">
                      <Folder size={14} className="text-bb-orange" />
                      <h2 className="text-sm font-medium text-white">
                        {g.folder ?? "More files"}
                      </h2>
                      <span className="text-xs text-bb-dim">
                        {g.media.length} item{g.media.length !== 1 ? "s" : ""}
                      </span>
                      {canDecide && g.media.length > 1 && (
                        <button
                          onClick={() => decideItems(g.media.map((f) => f.id), "approve")}
                          disabled={itemBusy || allApproved}
                          className="ml-auto flex items-center gap-1 text-xs text-bb-dim hover:text-green-400 disabled:opacity-40 transition-colors"
                        >
                          <CheckCheck size={13} />
                          {allApproved ? "All approved" : "Approve all"}
                        </button>
                      )}
                    </div>
                  )}
                  <MediaCarousel
                    items={g.media}
                    onIndexChange={(i) => setSlideIndex((prev) => ({ ...prev, [key]: i }))}
                  />
                  {g.media.length > 1 && (
                    <p className="text-center text-xs text-bb-dim sm:hidden">
                      Swipe to see all {g.media.length} items
                    </p>
                  )}
                  {current && (
                    <ItemReview
                      file={current}
                      canDecide={canDecide}
                      comments={review.comments}
                      onDecide={decideItems}
                      onComment={(body, fileId) => postComment(body, fileId)}
                      busy={itemBusy}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Message from the team */}
        {review.message && (
          <div className="bg-bb-surface border border-bb-border rounded-xl p-6 mb-6">
            <p className="text-xs font-medium text-bb-dim uppercase tracking-wide mb-2">
              A note from Blok Blok Studio
            </p>
            <p className="text-sm text-bb-muted leading-relaxed whitespace-pre-wrap">{review.message}</p>
          </div>
        )}

        {/* Finalized content */}
        {review.content && (
          <div className="bg-bb-surface border border-bb-border rounded-xl p-6 sm:p-8 mb-6">
            <p className="text-xs font-medium text-bb-dim uppercase tracking-wide mb-3">Finalized content</p>
            <div className="text-sm text-bb-muted leading-relaxed whitespace-pre-wrap">{review.content}</div>
          </div>
        )}

        {/* Documents (non-media attachments) — each markable like the media */}
        {docs.length > 0 && (
          <div className="space-y-2 mb-6">
            <div className="flex items-center gap-2">
              <p className="text-xs font-medium text-bb-dim uppercase tracking-wide">
                Documents ({docs.length})
              </p>
              {canDecide && docs.length > 1 && (
                <button
                  onClick={() => decideItems(docs.map((f) => f.id), "approve")}
                  disabled={itemBusy || docs.every((f) => f.decision === "APPROVED")}
                  className="ml-auto flex items-center gap-1 text-xs text-bb-dim hover:text-green-400 disabled:opacity-40 transition-colors"
                >
                  <CheckCheck size={13} /> Approve all
                </button>
              )}
            </div>
            {docs.map((file) => (
              <div key={file.id} className="space-y-2">
                <div className="flex items-center justify-between gap-3 px-3 py-2.5 bg-bb-black border border-bb-border rounded-t-lg rounded-b-none border-b-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <FileText size={14} className="text-bb-orange shrink-0" />
                    <span className="text-sm text-white truncate">
                      {file.folder && <span className="text-bb-dim">{file.folder}/</span>}
                      {file.filename}
                    </span>
                    <span className="text-xs text-bb-dim shrink-0">{formatBytes(file.fileSize)}</span>
                  </div>
                  <a
                    href={file.url}
                    download={file.filename}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-xs text-bb-orange hover:text-bb-orange-light shrink-0 transition-colors"
                  >
                    <Download size={13} /> Download
                  </a>
                </div>
                <div className="-mt-2">
                  <ItemReview
                    file={file}
                    canDecide={canDecide}
                    comments={review.comments}
                    onDecide={decideItems}
                    onComment={(body, fileId) => postComment(body, fileId)}
                    busy={itemBusy}
                  />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Downloads for the media shown above */}
        {hasMedia && (
          <details className="mb-8 group">
            <summary className="text-xs font-medium text-bb-dim uppercase tracking-wide cursor-pointer hover:text-bb-muted transition-colors list-none flex items-center gap-1.5">
              <Download size={12} /> Download files ({review.files.filter(isMediaFile).length})
            </summary>
            <div className="space-y-2 mt-2">
              {review.files.filter(isMediaFile).map((file) => (
                <div key={file.id} className="flex items-center justify-between gap-3 px-3 py-2.5 bg-bb-black border border-bb-border rounded-lg">
                  <div className="flex items-center gap-2 min-w-0">
                    {file.mimeType.startsWith("video/") ? (
                      <Play size={14} className="text-bb-orange shrink-0" />
                    ) : (
                      <FileText size={14} className="text-bb-orange shrink-0" />
                    )}
                    <span className="text-sm text-white truncate">
                      {file.folder && <span className="text-bb-dim">{file.folder}/</span>}
                      {file.filename}
                    </span>
                    <span className="text-xs text-bb-dim shrink-0">{formatBytes(file.fileSize)}</span>
                    <DecisionBadge decision={file.decision} />
                  </div>
                  <a
                    href={file.url}
                    download={file.filename}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-xs text-bb-orange hover:text-bb-orange-light shrink-0 transition-colors"
                  >
                    <Download size={13} /> Download
                  </a>
                </div>
              ))}
            </div>
          </details>
        )}

        {/* Submit review (per-item flow) */}
        {!done && hasFiles && (
          <div className="bg-bb-surface border border-bb-orange/30 rounded-xl p-6 space-y-4 mb-8">
            <h2 className="text-lg font-display font-semibold text-white">Finish your review</h2>
            <p className="text-sm text-bb-muted">
              {allDecided
                ? changesCount > 0
                  ? `You've marked ${changesCount} item${changesCount !== 1 ? "s" : ""} for changes — submit to send us your notes.`
                  : "Everything's approved — submit to let us know!"
                : `Mark the remaining ${review.files.length - decidedCount} item${review.files.length - decidedCount !== 1 ? "s" : ""} above, then submit.`}
            </p>

            <div>
              <label className="block text-sm text-bb-muted mb-1.5 font-medium">
                Your name <span className="text-bb-dim font-normal">(optional)</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={inputClass}
                placeholder={`e.g. ${firstName}`}
              />
            </div>

            <div>
              <label className="block text-sm text-bb-muted mb-1.5 font-medium">
                Anything else? <span className="text-bb-dim font-normal">(optional)</span>
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                className={inputClass}
                placeholder="Overall thoughts, extra context, next steps…"
              />
            </div>

            {error && <p className="text-red-400 text-sm">{error}</p>}

            <button
              onClick={() => respond("submit")}
              disabled={submitting || !allDecided}
              className={`w-full flex items-center justify-center gap-2 py-3 font-semibold rounded-xl transition-colors disabled:opacity-50 text-sm sm:text-base ${
                changesCount > 0
                  ? "bg-bb-orange hover:bg-bb-orange-light text-white"
                  : "bg-green-600 hover:bg-green-500 text-white"
              }`}
            >
              {submitting ? (
                <Loader2 className="animate-spin" size={18} />
              ) : changesCount > 0 ? (
                <Pencil size={16} />
              ) : (
                <ThumbsUp size={18} />
              )}
              {changesCount > 0 ? "Submit review & request changes" : "Submit review — approve all"}
            </button>
          </div>
        )}

        {/* Legacy one-shot actions for content-only deliverables */}
        {!done && !hasFiles && (
          <div className="bg-bb-surface border border-bb-orange/30 rounded-xl p-6 space-y-4 mb-8">
            <h2 className="text-lg font-display font-semibold text-white">Your review</h2>

            <div>
              <label className="block text-sm text-bb-muted mb-1.5 font-medium">
                Your name <span className="text-bb-dim font-normal">(optional)</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={inputClass}
                placeholder={`e.g. ${firstName}`}
              />
            </div>

            {mode === "revision" && (
              <div>
                <label className="block text-sm text-bb-muted mb-1.5 font-medium">
                  What needs to change? *
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={5}
                  className={inputClass}
                  placeholder="Tell us exactly what you'd like adjusted — the more detail, the faster we can turn it around."
                  autoFocus
                />
              </div>
            )}

            {error && <p className="text-red-400 text-sm">{error}</p>}

            {mode === "idle" ? (
              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  onClick={() => respond("approve")}
                  disabled={submitting}
                  className="flex-1 flex items-center justify-center gap-2 py-3 bg-green-600 hover:bg-green-500 text-white font-semibold rounded-xl transition-colors disabled:opacity-50 text-sm sm:text-base"
                >
                  {submitting ? <Loader2 className="animate-spin" size={18} /> : <ThumbsUp size={18} />}
                  Approve
                </button>
                <button
                  onClick={() => setMode("revision")}
                  disabled={submitting}
                  className="flex-1 flex items-center justify-center gap-2 py-3 bg-bb-black border border-bb-border hover:border-bb-orange text-white font-semibold rounded-xl transition-colors disabled:opacity-50 text-sm sm:text-base"
                >
                  <Pencil size={16} />
                  Request changes
                </button>
              </div>
            ) : (
              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  onClick={() => respond("request_revision")}
                  disabled={submitting || !notes.trim()}
                  className="flex-1 flex items-center justify-center gap-2 py-3 bg-bb-orange hover:bg-bb-orange-light text-white font-semibold rounded-xl transition-colors disabled:opacity-50 text-sm sm:text-base"
                >
                  {submitting ? <Loader2 className="animate-spin" size={18} /> : <Pencil size={16} />}
                  Send revision request
                </button>
                <button
                  onClick={() => setMode("idle")}
                  disabled={submitting}
                  className="px-6 py-3 bg-bb-black border border-bb-border hover:border-bb-dim text-bb-muted font-medium rounded-xl transition-colors text-sm"
                >
                  Back
                </button>
              </div>
            )}
          </div>
        )}

        {/* General conversation — questions and replies about the whole deliverable */}
        <div className="bg-bb-surface border border-bb-border rounded-xl p-5 space-y-3">
          <div className="flex items-center gap-2">
            <MessageCircle size={14} className="text-bb-orange" />
            <h2 className="text-sm font-medium text-white">Questions or comments?</h2>
          </div>
          {error && done && <p className="text-red-400 text-sm">{error}</p>}
          <CommentThread
            comments={generalComments}
            onReply={(body) => postComment(body)}
            busy={itemBusy}
          />
        </div>

        <AddToHomeScreen storageKey="review" what="your project reviews" />
      </div>
    </div>
  );
}
