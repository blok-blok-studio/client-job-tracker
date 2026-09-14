"use client";

import { createContext, useState, useRef, useCallback, useContext, useEffect } from "react";
import { Film, ChevronLeft, ChevronRight, Heart, MessageCircle, Send, Bookmark, Share2, ThumbsUp, Repeat2, MoreHorizontal, Music } from "lucide-react";
import { aspectRatioValue, isPresetAspect, type MediaFormat } from "@/lib/social/formats";
import PlatformIcon, { getPlatformLabel } from "./PlatformIcon";

interface PreviewMediaMeta {
  kind?: string;
  width?: number | null;
  height?: number | null;
  thumbnailUrl?: string | null;
}

interface PostPreviewProps {
  platform: string;
  title: string;
  body: string;
  hashtags: string[];
  mediaUrls: string[];
  /** Resolved post type (reel, story, short...), for the frame shape */
  postType?: string | null;
  /** Format the post will publish with; black bars vs fill and preset shapes */
  format?: MediaFormat | null;
  /** Known kind/size/thumbnail per media URL */
  meta?: Record<string, PreviewMediaMeta>;
  /** Display name (Facebook page, LinkedIn, YouTube channel) */
  accountName?: string | null;
  /** Username without @ (Instagram, TikTok, X); falls back to accountName */
  accountHandle?: string | null;
  avatarUrl?: string | null;
}

interface MediaContextValue {
  meta: Record<string, PreviewMediaMeta>;
  /** "cover" only when the post is set to fill (crop); otherwise the whole picture shows */
  fit: "contain" | "cover";
  focus: Record<string, { x: number; y: number }>;
}

const MediaContext = createContext<MediaContextValue>({ meta: {}, fit: "contain", focus: {} });

function isVideo(url: string, meta?: PreviewMediaMeta) {
  if (meta?.kind) return meta.kind === "video";
  return /\.(mp4|mov|m4v|webm)(\?|#|$)/i.test(url);
}

function isPdf(url: string) {
  return /\.pdf(\?|#|$)/i.test(url);
}

const VERTICAL_TYPES: Record<string, string[]> = {
  INSTAGRAM: ["reel", "trial_reel", "story"],
  FACEBOOK: ["reel", "story"],
  YOUTUBE: ["short"],
};

/**
 * width / height of the frame the platform shows this post in: vertical for
 * reels, stories, Shorts and TikTok; the chosen shape; otherwise the first
 * file's own shape, kept inside what feeds display (4:5 to 1.91:1).
 */
function frameRatio(platform: string, postType: string | null | undefined, format: MediaFormat | null | undefined, first?: PreviewMediaMeta): number {
  if (platform === "TIKTOK" || (postType && VERTICAL_TYPES[platform]?.includes(postType))) return 9 / 16;
  if (platform === "YOUTUBE") return 16 / 9;
  if (format && isPresetAspect(format.aspect)) return aspectRatioValue(format.aspect) ?? 1;
  if (first?.width && first?.height) return Math.min(1.91, Math.max(0.8, first.width / first.height));
  return 1;
}

function Avatar({ src, name, className }: { src?: string | null; name?: string | null; className: string }) {
  const [failed, setFailed] = useState(false);
  if (src && !failed) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="" onError={() => setFailed(true)} className={`${className} object-cover`} />;
  }
  return (
    <div className={`${className} flex items-center justify-center text-[11px] font-semibold text-white/70`}>
      {(name || "?").replace(/^@/, "").charAt(0).toUpperCase()}
    </div>
  );
}

/** The actual photo or video, filling its frame the way it will post. */
function MediaFill({ url, iconSize = 32, fit: fitOverride }: { url: string; iconSize?: number; fit?: "contain" | "cover" }) {
  const { meta, fit, focus } = useContext(MediaContext);
  const m = meta[url];
  const objectFit = fitOverride ?? fit;
  const point = focus[url];
  const objectPosition = objectFit === "cover" && point ? `${point.x * 100}% ${point.y * 100}%` : "50% 50%";
  const className = "w-full h-full pointer-events-none select-none bg-black";

  if (isPdf(url)) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-b from-gray-800 to-gray-900 gap-2">
        <div className="w-16 h-20 bg-white/10 rounded-lg border border-white/20 flex items-center justify-center">
          <Film size={24} className="text-red-400" />
        </div>
        <span className="text-xs text-white/60 font-medium">PDF Document</span>
      </div>
    );
  }
  if (isVideo(url, m)) {
    return (
      <video
        src={url}
        poster={m?.thumbnailUrl || undefined}
        muted
        loop
        autoPlay
        playsInline
        preload="metadata"
        className={className}
        style={{ objectFit, objectPosition }}
      />
    );
  }
  if (!url) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-black/40">
        <Film size={iconSize} className="text-white/40" />
      </div>
    );
  }
  // HEIC originals only display in Safari, so use the JPEG preview when there is one
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={m?.thumbnailUrl || url} alt="" draggable={false} className={className} style={{ objectFit, objectPosition }} />;
}

// ─── Swipeable Carousel ─────────────────────────────────────────────────────

function SwipeCarousel({
  urls,
  ratio,
  showArrows = true,
  dotStyle = "default",
}: {
  urls: string[];
  ratio: number;
  showArrows?: boolean;
  dotStyle?: "default" | "instagram" | "linkedin";
}) {
  const [current, setCurrent] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const startX = useRef(0);
  const deltaX = useRef(0);
  const dragging = useRef(false);
  const [translate, setTranslate] = useState(0);

  const count = urls.length;

  const goTo = useCallback(
    (idx: number) => {
      const clamped = Math.max(0, Math.min(idx, count - 1));
      setCurrent(clamped);
      setTranslate(0);
    },
    [count]
  );

  const handlePointerDown = (e: React.PointerEvent) => {
    dragging.current = true;
    startX.current = e.clientX;
    deltaX.current = 0;
    containerRef.current?.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragging.current) return;
    deltaX.current = e.clientX - startX.current;
    setTranslate(deltaX.current);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!dragging.current) return;
    dragging.current = false;
    containerRef.current?.releasePointerCapture(e.pointerId);

    const threshold = 50;
    if (deltaX.current < -threshold) {
      goTo(current + 1);
    } else if (deltaX.current > threshold) {
      goTo(current - 1);
    } else {
      setTranslate(0);
    }
  };

  // Reset when urls change
  useEffect(() => {
    setCurrent(0);
    setTranslate(0);
  }, [urls.length]);

  if (count === 0) return null;

  const dotColors = {
    default: { active: "bg-white", inactive: "bg-white/30" },
    instagram: { active: "bg-blue-400", inactive: "bg-bb-dim/40" },
    linkedin: { active: "bg-blue-500", inactive: "bg-bb-dim/40" },
  };
  const dots = dotColors[dotStyle];

  return (
    <div className="relative select-none">
      <div
        ref={containerRef}
        className="overflow-hidden touch-pan-y bg-black"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        style={{ aspectRatio: String(ratio), cursor: dragging.current ? "grabbing" : "grab" }}
      >
        <div
          className="flex h-full"
          style={{
            width: `${count * 100}%`,
            transform: `translateX(calc(-${(current * 100) / count}% + ${translate}px))`,
            transition: dragging.current ? "none" : "transform 0.3s ease-out",
          }}
        >
          {urls.map((url, i) => (
            <div key={url + i} className="h-full" style={{ width: `${100 / count}%` }}>
              <MediaFill url={url} iconSize={36} />
            </div>
          ))}
        </div>
      </div>

      {/* Arrows */}
      {showArrows && count > 1 && (
        <>
          {current > 0 && (
            <button
              onClick={() => goTo(current - 1)}
              className="absolute left-1.5 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center text-white/80 hover:text-white hover:bg-black/70 transition-all"
            >
              <ChevronLeft size={14} />
            </button>
          )}
          {current < count - 1 && (
            <button
              onClick={() => goTo(current + 1)}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center text-white/80 hover:text-white hover:bg-black/70 transition-all"
            >
              <ChevronRight size={14} />
            </button>
          )}
        </>
      )}

      {/* Counter badge (top-right, Instagram-style) */}
      {count > 1 && (
        <div className="absolute top-2 right-2 bg-black/60 backdrop-blur-sm px-2 py-0.5 rounded-full text-[10px] text-white/80 font-medium">
          {current + 1}/{count}
        </div>
      )}

      {/* Dots */}
      {count > 1 && (
        <div className="flex justify-center gap-1 py-2">
          {urls.map((_, i) => (
            <button
              key={i}
              onClick={() => goTo(i)}
              className={`w-1.5 h-1.5 rounded-full transition-all ${
                i === current ? `${dots.active} scale-110` : dots.inactive
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Twitter/X Image Grid ────────────────────────────────────────────────────

function TwitterMediaGrid({ urls, ratio }: { urls: string[]; ratio: number }) {
  if (urls.length === 0) return null;

  if (urls.length === 1) {
    return (
      <div className="rounded-2xl overflow-hidden border border-[#2F3336] max-h-[420px]" style={{ aspectRatio: String(ratio) }}>
        <MediaFill url={urls[0]} />
      </div>
    );
  }

  if (urls.length === 2) {
    return (
      <div className="grid grid-cols-2 gap-0.5 rounded-2xl overflow-hidden border border-[#2F3336]">
        {urls.map((url) => (
          <div key={url} className="aspect-[4/5] overflow-hidden">
            <MediaFill url={url} iconSize={20} fit="cover" />
          </div>
        ))}
      </div>
    );
  }

  if (urls.length === 3) {
    return (
      <div className="grid grid-cols-2 gap-0.5 rounded-2xl overflow-hidden border border-[#2F3336] h-[200px]">
        <div className="row-span-2 overflow-hidden">
          <MediaFill url={urls[0]} iconSize={24} fit="cover" />
        </div>
        {urls.slice(1, 3).map((url) => (
          <div key={url} className="overflow-hidden">
            <MediaFill url={url} iconSize={20} fit="cover" />
          </div>
        ))}
      </div>
    );
  }

  // 4 images — 2x2 grid
  return (
    <div className="grid grid-cols-2 gap-0.5 rounded-2xl overflow-hidden border border-[#2F3336]">
      {urls.slice(0, 4).map((url) => (
        <div key={url} className="aspect-video overflow-hidden">
          <MediaFill url={url} iconSize={20} fit="cover" />
        </div>
      ))}
    </div>
  );
}

type InnerProps = PostPreviewProps & { ratio: number; name: string; handle: string };

// ─── INSTAGRAM ───────────────────────────────────────────────────────────────

function InstagramPreview({ body, hashtags, mediaUrls, ratio, handle, avatarUrl }: InnerProps) {
  const hashtagStr = hashtags.map((t) => `#${t}`).join(" ");
  return (
    <div className="bg-black rounded-xl overflow-hidden border border-[#262626]">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#F58529] via-[#DD2A7B] to-[#8134AF] p-[2px]">
            <Avatar src={avatarUrl} name={handle} className="w-full h-full rounded-full bg-black" />
          </div>
          <span className="text-xs font-semibold text-white">{handle}</span>
        </div>
        <MoreHorizontal size={16} className="text-white/70" />
      </div>

      {/* Media carousel */}
      {mediaUrls.length > 0 ? (
        <SwipeCarousel urls={mediaUrls} ratio={ratio} dotStyle="instagram" />
      ) : (
        <div className="w-full bg-[#1a1a1a] flex items-center justify-center text-[#555] text-sm" style={{ aspectRatio: String(ratio) }}>
          No media attached
        </div>
      )}

      {/* Action bar */}
      <div className="flex items-center justify-between px-3 py-2">
        <div className="flex items-center gap-4">
          <Heart size={20} className="text-white" />
          <MessageCircle size={20} className="text-white" />
          <Send size={20} className="text-white" />
        </div>
        <Bookmark size={20} className="text-white" />
      </div>

      {/* Likes */}
      <div className="px-3">
        <p className="text-xs font-semibold text-white">0 likes</p>
      </div>

      {/* Caption */}
      <div className="px-3 py-1.5 pb-3">
        {/* Same text Instagram receives: body, blank line, hashtags, breaks kept */}
        <p className="text-xs text-white leading-relaxed whitespace-pre-wrap break-words">
          <span className="font-semibold">{handle}</span>{" "}
          {body}
          {body && hashtagStr ? "\n\n" : ""}
          {hashtagStr && <span className="text-[#E0F1FF]">{hashtagStr}</span>}
        </p>
      </div>
    </div>
  );
}

// ─── TWITTER / X ─────────────────────────────────────────────────────────────

function TwitterPreview({ body, hashtags, mediaUrls, ratio, name, handle, avatarUrl }: InnerProps) {
  const hashtagStr = hashtags.map((t) => `#${t}`).join(" ");
  const fullText = [body, hashtagStr].filter(Boolean).join("\n\n").slice(0, 280);
  return (
    <div className="bg-black rounded-xl border border-[#2F3336] p-3">
      <div className="flex gap-2.5">
        <Avatar src={avatarUrl} name={name} className="w-10 h-10 rounded-full bg-[#1D1D1D] shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1 min-w-0">
            <span className="text-sm font-bold text-white truncate">{name}</span>
            <span className="text-xs text-[#71767B] truncate">@{handle} · now</span>
          </div>
          <p className="text-[13px] text-[#E7E9EA] mt-1 whitespace-pre-wrap break-words leading-5">{fullText}</p>
          {mediaUrls.length > 0 && (
            <div className="mt-2.5">
              <TwitterMediaGrid urls={mediaUrls} ratio={ratio} />
            </div>
          )}
          {/* Action bar */}
          <div className="flex justify-between mt-3 max-w-[300px] text-[#71767B]">
            <MessageCircle size={15} />
            <Repeat2 size={15} />
            <Heart size={15} />
            <Share2 size={15} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── LINKEDIN ────────────────────────────────────────────────────────────────

function LinkedInPreview({ body, hashtags, mediaUrls, ratio, name, avatarUrl }: InnerProps) {
  const hashtagStr = hashtags.map((t) => `#${t}`).join(" ");
  return (
    <div className="bg-[#1B1F23] rounded-xl border border-[#38434F] overflow-hidden">
      <div className="p-3">
        <div className="flex items-center gap-2">
          <Avatar src={avatarUrl} name={name} className="w-12 h-12 rounded-full bg-[#2C3338]" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white truncate">{name}</p>
            <p className="text-[10px] text-[#FFFFFF8C]">Just now · <span className="inline-block">🌐</span></p>
          </div>
        </div>
        <p className="text-[13px] text-[#FFFFFFE6] mt-3 whitespace-pre-wrap break-words leading-5">{body}</p>
        {hashtagStr && <p className="text-xs text-[#71B7FB] mt-1.5">{hashtagStr}</p>}
      </div>

      {mediaUrls.length > 0 && <SwipeCarousel urls={mediaUrls} ratio={ratio} dotStyle="linkedin" showArrows={mediaUrls.length > 1} />}

      {/* Engagement counts */}
      <div className="px-3 py-1.5 flex items-center gap-1">
        <div className="flex -space-x-1">
          <div className="w-4 h-4 rounded-full bg-blue-500 flex items-center justify-center">
            <ThumbsUp size={8} className="text-white" />
          </div>
          <div className="w-4 h-4 rounded-full bg-red-500 flex items-center justify-center">
            <Heart size={8} className="text-white" />
          </div>
        </div>
        <span className="text-[10px] text-[#FFFFFF8C] ml-1">0</span>
      </div>

      {/* Action bar */}
      <div className="flex justify-around py-1.5 border-t border-[#38434F] text-[#FFFFFFA6]">
        <div className="flex items-center gap-1.5 px-2 py-1.5 rounded hover:bg-white/5">
          <ThumbsUp size={16} />
          <span className="text-xs">Like</span>
        </div>
        <div className="flex items-center gap-1.5 px-2 py-1.5 rounded hover:bg-white/5">
          <MessageCircle size={16} />
          <span className="text-xs">Comment</span>
        </div>
        <div className="flex items-center gap-1.5 px-2 py-1.5 rounded hover:bg-white/5">
          <Repeat2 size={16} />
          <span className="text-xs">Repost</span>
        </div>
        <div className="flex items-center gap-1.5 px-2 py-1.5 rounded hover:bg-white/5">
          <Send size={16} />
          <span className="text-xs">Send</span>
        </div>
      </div>
    </div>
  );
}

// ─── FACEBOOK ────────────────────────────────────────────────────────────────

function FacebookPreview({ body, hashtags, mediaUrls, ratio, name, avatarUrl }: InnerProps) {
  const hashtagStr = hashtags.map((t) => `#${t}`).join(" ");
  return (
    <div className="bg-[#242526] rounded-xl border border-[#3E4042] overflow-hidden">
      <div className="p-3">
        <div className="flex items-center gap-2.5">
          <Avatar src={avatarUrl} name={name} className="w-10 h-10 rounded-full bg-[#3A3B3C]" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-[#E4E6EB] truncate">{name}</p>
            <p className="text-[11px] text-[#B0B3B8]">Just now · 🌎</p>
          </div>
        </div>
        {(body || hashtagStr) && (
          <p className="text-[14px] text-[#E4E6EB] mt-2.5 leading-5 whitespace-pre-wrap break-words">
            {body}
            {body && hashtagStr ? "\n\n" : ""}
            {hashtagStr && <span className="text-[#4599FF]">{hashtagStr}</span>}
          </p>
        )}
      </div>

      {mediaUrls.length > 0 && <SwipeCarousel urls={mediaUrls} ratio={ratio} dotStyle="default" showArrows={mediaUrls.length > 1} />}

      {/* Engagement */}
      <div className="px-3 py-1.5 flex items-center justify-between text-[11px] text-[#B0B3B8]">
        <div className="flex items-center gap-1">
          <div className="flex -space-x-1">
            <div className="w-[18px] h-[18px] rounded-full bg-[#2078F4] flex items-center justify-center">
              <ThumbsUp size={10} className="text-white" />
            </div>
            <div className="w-[18px] h-[18px] rounded-full bg-[#F33E58] flex items-center justify-center">
              <Heart size={10} className="text-white" />
            </div>
          </div>
          <span>0</span>
        </div>
        <span>0 comments · 0 shares</span>
      </div>

      {/* Action bar */}
      <div className="flex justify-around py-1 border-t border-[#3E4042] text-[#B0B3B8]">
        <div className="flex items-center gap-2 px-3 py-2 rounded-md hover:bg-white/5">
          <ThumbsUp size={18} />
          <span className="text-[13px] font-medium">Like</span>
        </div>
        <div className="flex items-center gap-2 px-3 py-2 rounded-md hover:bg-white/5">
          <MessageCircle size={18} />
          <span className="text-[13px] font-medium">Comment</span>
        </div>
        <div className="flex items-center gap-2 px-3 py-2 rounded-md hover:bg-white/5">
          <Share2 size={18} />
          <span className="text-[13px] font-medium">Share</span>
        </div>
      </div>
    </div>
  );
}

// ─── TIKTOK ──────────────────────────────────────────────────────────────────

function TikTokPreview({ body, hashtags, mediaUrls, handle }: InnerProps) {
  const hashtagStr = hashtags.map((t) => `#${t}`).join(" ");
  return (
    <div className="bg-black rounded-xl border border-[#2F2F2F] overflow-hidden">
      <div className="relative aspect-[9/16] bg-[#121212] flex items-center justify-center">
        {mediaUrls.length > 0 ? (
          <div className="absolute inset-0">
            <MediaFill url={mediaUrls[0]} iconSize={40} />
          </div>
        ) : (
          <span className="text-[#555] text-sm">No video attached</span>
        )}

        {/* Right action bar */}
        <div className="absolute right-2 bottom-20 flex flex-col items-center gap-4">
          <div className="flex flex-col items-center gap-1">
            <Heart size={24} className="text-white" />
            <span className="text-[10px] text-white">0</span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <MessageCircle size={24} className="text-white" />
            <span className="text-[10px] text-white">0</span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <Bookmark size={24} className="text-white" />
            <span className="text-[10px] text-white">0</span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <Share2 size={24} className="text-white" />
            <span className="text-[10px] text-white">0</span>
          </div>
        </div>

        {/* Bottom overlay */}
        <div className="absolute bottom-0 left-0 right-12 p-3 bg-gradient-to-t from-black/80 via-black/40 to-transparent">
          <p className="text-xs text-white font-semibold">@{handle}</p>
          {/* TikTok's caption is the body with the hashtags right after it (see tiktokCaption) */}
          <p className="text-[11px] text-white/90 mt-1 leading-4 whitespace-pre-wrap break-words max-h-[140px] overflow-y-auto">
            {body}
            {body && hashtagStr ? " " : ""}
            {hashtagStr}
          </p>
          {/* Sound bar */}
          <div className="flex items-center gap-1.5 mt-2">
            <Music size={10} className="text-white/70" />
            <div className="h-[2px] flex-1 bg-white/20 rounded-full overflow-hidden">
              <div className="h-full w-1/3 bg-white/60 rounded-full" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── YOUTUBE ─────────────────────────────────────────────────────────────────

function YouTubePreview({ title, body, hashtags, mediaUrls, ratio, name, avatarUrl }: InnerProps) {
  const short = ratio < 1;
  return (
    <div className="bg-[#0F0F0F] rounded-xl border border-[#272727] overflow-hidden">
      {/* Video */}
      <div className="relative bg-[#1a1a1a] flex items-center justify-center" style={{ aspectRatio: String(ratio) }}>
        {mediaUrls.length > 0 ? (
          <div className="absolute inset-0">
            <MediaFill url={mediaUrls[0]} />
          </div>
        ) : (
          <span className="text-[#555] text-sm">No video attached</span>
        )}
        {short && (
          <div className="absolute top-2 left-2 bg-black/70 px-1.5 py-0.5 rounded text-[10px] text-white font-medium">Short</div>
        )}
      </div>

      {/* Info */}
      <div className="p-3 flex gap-3">
        <Avatar src={avatarUrl} name={name} className="w-9 h-9 rounded-full bg-[#272727] shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-[14px] font-medium text-[#F1F1F1] leading-5 line-clamp-2">{title || "Untitled"}</p>
          <p className="text-xs text-[#AAAAAA] mt-1 truncate">{name} · 0 views · Just now</p>
          {body && <p className="text-xs text-[#AAAAAA] mt-1.5 line-clamp-3 whitespace-pre-wrap">{body}</p>}
          {hashtags.length > 0 && (
            <p className="text-xs text-[#3EA6FF] mt-1">{hashtags.map((t) => `#${t}`).join(" ")}</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── EXPORT ──────────────────────────────────────────────────────────────────

const previewMap: Record<string, React.ComponentType<InnerProps>> = {
  INSTAGRAM: InstagramPreview,
  TWITTER: TwitterPreview,
  LINKEDIN: LinkedInPreview,
  FACEBOOK: FacebookPreview,
  TIKTOK: TikTokPreview,
  YOUTUBE: YouTubePreview,
};

/** Vertical frames stay phone-sized; wide ones get a little more room. */
function maxWidthFor(ratio: number): string {
  return ratio < 1 ? "340px" : "480px";
}

export default function PostPreview(props: PostPreviewProps) {
  const PreviewComponent = previewMap[props.platform] || TwitterPreview;
  const meta = props.meta || {};
  const ratio = frameRatio(props.platform, props.postType, props.format, meta[props.mediaUrls[0]]);
  const crop = !!props.format && isPresetAspect(props.format.aspect) && props.format.fit === "crop";
  const name = props.accountName?.replace(/^@/, "") || "Your account";
  const handle = (props.accountHandle || props.accountName || "your_account").replace(/^@/, "");
  const focus = (crop && (props.format?.focus as Record<string, { x: number; y: number }> | undefined)) || {};

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <PlatformIcon platform={props.platform} size={14} />
        <span className="text-xs font-medium text-bb-muted">
          {getPlatformLabel(props.platform)} Preview
        </span>
      </div>
      <MediaContext.Provider value={{ meta, fit: crop ? "cover" : "contain", focus }}>
        <div className="mx-auto w-full" style={{ maxWidth: maxWidthFor(ratio) }}>
          <PreviewComponent {...props} ratio={ratio} name={name} handle={handle} />
        </div>
      </MediaContext.Provider>
    </div>
  );
}
