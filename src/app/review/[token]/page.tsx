"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams } from "next/navigation";
import Image from "next/image";
import { Check, Loader2, FileText, Download, Pencil, ThumbsUp, ChevronLeft, ChevronRight, Play, Folder } from "lucide-react";

interface ReviewFile {
  id: string;
  url: string;
  filename: string;
  fileSize: number;
  mimeType: string;
  folder?: string | null;
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
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

// Instagram-style swipeable carousel: videos/reels play inline, images swipe
// through with arrows (desktop) or native touch scroll-snap (mobile).
function MediaCarousel({ items }: { items: ReviewFile[] }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);

  const handleScroll = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    const i = Math.round(el.scrollLeft / el.clientWidth);
    setIndex((prev) => (prev === i ? prev : i));
  }, []);

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
            {items.map((_, i) => (
              <button
                key={i}
                onClick={() => scrollTo(i)}
                aria-label={`Go to item ${i + 1}`}
                className={`w-1.5 h-1.5 rounded-full transition-colors ${
                  i === index ? "bg-white" : "bg-white/40"
                }`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function FileRow({ file }: { file: ReviewFile }) {
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2.5 bg-bb-black border border-bb-border rounded-lg">
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
  const [done, setDone] = useState<"approved" | "revision" | null>(null);

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

  async function respond(action: "approve" | "request_revision") {
    if (action === "request_revision" && !notes.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/review/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          notes: action === "request_revision" ? notes.trim() : undefined,
          name: name.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setDone(action === "approve" ? "approved" : "revision");
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
  const showFolderHeadings = groups.length > 1 || groups.some((g) => g.folder !== null);

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
              Hi {firstName} — take a look at the finished work below, then let us know what you think.
            </p>
          )}
        </div>

        {/* Media — front and center, one section per folder as uploaded */}
        {hasMedia && (
          <div className="mb-6 space-y-6">
            {groups.filter((g) => g.media.length > 0).map((g) => (
              <div key={g.folder ?? "__root__"}>
                {showFolderHeadings && (
                  <div className="flex items-center gap-2 mb-2">
                    <Folder size={14} className="text-bb-orange" />
                    <h2 className="text-sm font-medium text-white">
                      {g.folder ?? "More files"}
                    </h2>
                    <span className="text-xs text-bb-dim">
                      {g.media.length} item{g.media.length !== 1 ? "s" : ""}
                    </span>
                  </div>
                )}
                <MediaCarousel items={g.media} />
                {g.media.length > 1 && (
                  <p className="text-center text-xs text-bb-dim mt-2 sm:hidden">
                    Swipe to see all {g.media.length} items
                  </p>
                )}
              </div>
            ))}
          </div>
        )}

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
            {done === "revision" && (review.revisionNotes || notes) && (
              <div className="bg-bb-black border border-bb-border rounded-lg p-4 text-left max-w-md mx-auto">
                <p className="text-xs font-medium text-bb-dim uppercase tracking-wide mb-1.5">Your notes</p>
                <p className="text-sm text-bb-muted whitespace-pre-wrap">{review.revisionNotes || notes}</p>
              </div>
            )}
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

        {/* Documents (non-media attachments) */}
        {review.files.some((f) => !isMediaFile(f)) && (
          <div className="space-y-2 mb-6">
            <p className="text-xs font-medium text-bb-dim uppercase tracking-wide">
              Documents ({review.files.filter((f) => !isMediaFile(f)).length})
            </p>
            {review.files.filter((f) => !isMediaFile(f)).map((file) => (
              <FileRow key={file.id} file={file} />
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
                <FileRow key={file.id} file={file} />
              ))}
            </div>
          </details>
        )}

        {/* Actions */}
        {!done && (
          <div className="bg-bb-surface border border-bb-orange/30 rounded-xl p-6 space-y-4">
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
      </div>
    </div>
  );
}
