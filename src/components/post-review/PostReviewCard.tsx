"use client";

import { useRef, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Clock, Pencil, ThumbsUp } from "lucide-react";
import PlatformIcon, { getPlatformLabel } from "@/components/content/PlatformIcon";
import { optimizedThumb } from "@/lib/media-thumb";
import { formatInZone } from "@/components/content/handoff/zoned-time";

export interface ReviewMedia {
  url: string;
  kind: "image" | "video";
  thumbnailUrl: string | null;
  playbackUrl: string | null;
  width: number | null;
  height: number | null;
  /** Set while the formatted copy is still being made: show the original in the final frame */
  frame?: { ratio: number; fit: "pad" | "crop"; focusX: number; focusY: number } | null;
}

export interface ReviewPost {
  id: string;
  platform: string;
  postType: string | null;
  title: string | null;
  body: string | null;
  hashtags: string[];
  firstComment: string | null;
  scheduledAt: string | null;
  published: boolean;
  decision: "PENDING" | "APPROVED" | "CHANGES_REQUESTED" | null;
  note: string | null;
  media: ReviewMedia[];
}

export type Draft = { decision: "APPROVED" | "CHANGES_REQUESTED"; note: string };

const POST_TYPE_LABELS: Record<string, string> = {
  reel: "Reel",
  story: "Story",
  carousel: "Carousel",
  feed: "Post",
  trial_reel: "Reel",
  short: "Short",
  video: "Video",
  photo: "Photo post",
  image_note: "Image note",
  video_note: "Video note",
};

function MediaStrip({ media }: { media: ReviewMedia[] }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  if (media.length === 0) return null;

  const go = (i: number) => {
    const el = trackRef.current;
    if (!el) return;
    el.scrollTo({ left: i * el.clientWidth, behavior: "smooth" });
  };

  return (
    <div className="relative bg-bb-black">
      <div
        ref={trackRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          setIndex(Math.round(el.scrollLeft / el.clientWidth));
        }}
        className="flex overflow-x-auto snap-x snap-mandatory scrollbar-none"
        style={{ scrollbarWidth: "none" }}
      >
        {media.map((m, i) => {
          // Same framing the renderer uses: bars = contain on black, fill = cover at the focus point
          const framed: React.CSSProperties | undefined = m.frame
            ? {
                objectFit: m.frame.fit === "crop" ? "cover" : "contain",
                objectPosition: `${m.frame.focusX * 100}% ${m.frame.focusY * 100}%`,
              }
            : undefined;
          return (
            <div key={m.url + i} className="w-full shrink-0 snap-center flex items-center justify-center max-h-[70vh] aspect-[4/5]">
              <div
                className="relative flex items-center justify-center bg-black overflow-hidden"
                style={m.frame ? { aspectRatio: String(m.frame.ratio), maxWidth: "100%", maxHeight: "100%", height: "100%" } : { width: "100%", height: "100%" }}
              >
                {m.kind === "video" ? (
                  <video
                    src={m.playbackUrl || m.url}
                    poster={m.thumbnailUrl || undefined}
                    controls
                    playsInline
                    preload="metadata"
                    className="w-full h-full object-contain"
                    style={framed}
                  />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={optimizedThumb(m.thumbnailUrl || m.url, 1080)}
                    alt={`Image ${i + 1} of ${media.length}`}
                    className="w-full h-full object-contain"
                    style={framed}
                    loading={i === 0 ? "eager" : "lazy"}
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>
      {media.length > 1 && (
        <>
          <button
            type="button"
            aria-label="Previous"
            onClick={() => go(Math.max(0, index - 1))}
            className="hidden sm:flex absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/60 items-center justify-center text-white disabled:opacity-30"
            disabled={index === 0}
          >
            <ChevronLeft size={16} />
          </button>
          <button
            type="button"
            aria-label="Next"
            onClick={() => go(Math.min(media.length - 1, index + 1))}
            className="hidden sm:flex absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/60 items-center justify-center text-white disabled:opacity-30"
            disabled={index === media.length - 1}
          >
            <ChevronRight size={16} />
          </button>
          <div className="absolute bottom-2 left-0 right-0 flex justify-center gap-1">
            {media.map((_, i) => (
              <span key={i} className={`h-1.5 rounded-full transition-all ${i === index ? "w-4 bg-white" : "w-1.5 bg-white/40"}`} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default function PostReviewCard({
  post,
  timeZone,
  draft,
  onChange,
  locked,
}: {
  post: ReviewPost;
  timeZone: string | undefined;
  draft: Draft | undefined;
  onChange: (draft: Draft | undefined) => void;
  /** Decision already submitted (or post already live) */
  locked: boolean;
}) {
  const platform = getPlatformLabel(post.platform);
  const typeLabel = post.postType ? POST_TYPE_LABELS[post.postType] : null;
  const hashtags = post.hashtags.map((t) => (t.startsWith("#") ? t : `#${t}`)).join(" ");
  const current = locked ? post.decision : draft?.decision;

  return (
    <article
      className={`bg-bb-surface border rounded-xl overflow-hidden ${
        current === "APPROVED" ? "border-emerald-500/40" : current === "CHANGES_REQUESTED" ? "border-bb-orange/50" : "border-bb-border"
      }`}
    >
      <header className="flex items-center justify-between gap-3 px-4 py-3 border-b border-bb-border">
        <div className="flex items-center gap-2 min-w-0">
          <PlatformIcon platform={post.platform} size={16} />
          <span className="text-sm font-medium text-white">
            {platform}
            {typeLabel ? ` ${typeLabel}` : ""}
          </span>
        </div>
        {post.scheduledAt && (
          <span className="flex items-center gap-1 text-xs text-bb-dim shrink-0">
            <Clock size={12} />
            {formatInZone(post.scheduledAt, timeZone)}
          </span>
        )}
      </header>

      <MediaStrip media={post.media} />

      <div className="p-4 space-y-3">
        {post.title && <h3 className="text-base font-display font-semibold text-white">{post.title}</h3>}
        {(post.body || hashtags) && (
          <p className="text-sm text-bb-muted whitespace-pre-wrap leading-relaxed">
            {post.body}
            {post.body && hashtags ? "\n\n" : ""}
            {hashtags && <span className="text-bb-orange/90">{hashtags}</span>}
          </p>
        )}
        {post.firstComment && (
          <div className="text-xs text-bb-dim border-l-2 border-bb-border pl-3">
            <span className="uppercase tracking-wide">First comment</span>
            <p className="text-bb-muted mt-0.5 whitespace-pre-wrap">{post.firstComment}</p>
          </div>
        )}

        {locked ? (
          <div className="pt-1">
            {post.published ? (
              <p className="text-xs text-bb-dim">This post is already live.</p>
            ) : post.decision === "APPROVED" ? (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                <Check size={12} /> Approved
              </span>
            ) : post.decision === "CHANGES_REQUESTED" ? (
              <div className="space-y-1.5">
                <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-bb-orange/15 text-bb-orange border border-bb-orange/30">
                  <Pencil size={11} /> Changes requested
                </span>
                {post.note && <p className="text-xs text-bb-muted whitespace-pre-wrap">&ldquo;{post.note}&rdquo;</p>}
              </div>
            ) : null}
          </div>
        ) : (
          <div className="space-y-2 pt-1">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => onChange(current === "APPROVED" ? undefined : { decision: "APPROVED", note: "" })}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-sm font-medium border transition-colors ${
                  current === "APPROVED"
                    ? "bg-emerald-600 border-emerald-600 text-white"
                    : "bg-bb-black border-bb-border text-bb-muted hover:text-white hover:border-emerald-500/60"
                }`}
              >
                <ThumbsUp size={15} /> Approve
              </button>
              <button
                type="button"
                onClick={() =>
                  onChange(current === "CHANGES_REQUESTED" ? undefined : { decision: "CHANGES_REQUESTED", note: draft?.note || "" })
                }
                className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-sm font-medium border transition-colors ${
                  current === "CHANGES_REQUESTED"
                    ? "bg-bb-orange border-bb-orange text-white"
                    : "bg-bb-black border-bb-border text-bb-muted hover:text-white hover:border-bb-orange/60"
                }`}
              >
                <Pencil size={14} /> Request changes
              </button>
            </div>
            {current === "CHANGES_REQUESTED" && (
              <textarea
                value={draft?.note || ""}
                onChange={(e) => onChange({ decision: "CHANGES_REQUESTED", note: e.target.value })}
                rows={3}
                autoFocus
                placeholder="What should we change?"
                className="w-full px-3 py-2.5 bg-bb-black border border-bb-border rounded-lg text-sm text-white placeholder:text-bb-dim focus:outline-none focus:border-bb-orange"
              />
            )}
          </div>
        )}
      </div>
    </article>
  );
}
