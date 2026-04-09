"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Film, ChevronLeft, ChevronRight, Heart, MessageCircle, Send, Bookmark, Share2, ThumbsUp, Repeat2, MoreHorizontal, Music } from "lucide-react";
import PlatformIcon, { getPlatformLabel } from "./PlatformIcon";

interface PostPreviewProps {
  platform: string;
  title: string;
  body: string;
  hashtags: string[];
  mediaUrls: string[];
}

function isVideo(url: string) {
  return /\.(mp4|mov|webm)$/i.test(url);
}

function isPdf(url: string) {
  return /\.pdf$/i.test(url);
}

function MediaItem({ url, iconSize = 32 }: { url: string; iconSize?: number }) {
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
  if (isVideo(url)) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-black/40">
        <Film size={iconSize} className="text-white/40" />
      </div>
    );
  }
  return <img src={url} alt="" className="w-full h-full object-cover" />;
}

// ─── Swipeable Carousel ─────────────────────────────────────────────────────

function SwipeCarousel({
  urls,
  aspectClass = "aspect-square",
  showArrows = true,
  dotStyle = "default",
}: {
  urls: string[];
  aspectClass?: string;
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
        className={`${aspectClass} overflow-hidden touch-pan-y`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        style={{ cursor: dragging.current ? "grabbing" : "grab" }}
      >
        <div
          className="flex h-full transition-transform duration-300 ease-out"
          style={{
            width: `${count * 100}%`,
            transform: `translateX(calc(-${(current * 100) / count}% + ${translate}px))`,
            transition: dragging.current ? "none" : "transform 0.3s ease-out",
          }}
        >
          {urls.map((url, i) => (
            <div key={url + i} className="h-full" style={{ width: `${100 / count}%` }}>
              {isPdf(url) ? (
                <MediaItem url={url} iconSize={36} />
              ) : isVideo(url) ? (
                <div className="w-full h-full flex items-center justify-center bg-black/60">
                  <Film size={36} className="text-white/50" />
                </div>
              ) : (
                <img
                  src={url}
                  alt=""
                  className="w-full h-full object-cover pointer-events-none"
                  draggable={false}
                />
              )}
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

function TwitterMediaGrid({ urls }: { urls: string[] }) {
  if (urls.length === 0) return null;

  if (urls.length === 1) {
    return (
      <div className="rounded-2xl overflow-hidden border border-[#2F3336]">
        <div className="max-h-[280px]">
          <MediaItem url={urls[0]} />
        </div>
      </div>
    );
  }

  if (urls.length === 2) {
    return (
      <div className="grid grid-cols-2 gap-0.5 rounded-2xl overflow-hidden border border-[#2F3336]">
        {urls.map((url) => (
          <div key={url} className="aspect-[4/5] overflow-hidden">
            <MediaItem url={url} iconSize={20} />
          </div>
        ))}
      </div>
    );
  }

  if (urls.length === 3) {
    return (
      <div className="grid grid-cols-2 gap-0.5 rounded-2xl overflow-hidden border border-[#2F3336] h-[200px]">
        <div className="row-span-2 overflow-hidden">
          <MediaItem url={urls[0]} iconSize={24} />
        </div>
        {urls.slice(1, 3).map((url) => (
          <div key={url} className="overflow-hidden">
            <MediaItem url={url} iconSize={20} />
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
          <MediaItem url={url} iconSize={20} />
        </div>
      ))}
    </div>
  );
}

// ─── INSTAGRAM ───────────────────────────────────────────────────────────────

function InstagramPreview({ body, hashtags, mediaUrls }: PostPreviewProps) {
  const hashtagStr = hashtags.map((t) => `#${t}`).join(" ");
  return (
    <div className="bg-black rounded-xl overflow-hidden border border-[#262626]">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#F58529] via-[#DD2A7B] to-[#8134AF] p-[2px]">
            <div className="w-full h-full rounded-full bg-black" />
          </div>
          <span className="text-xs font-semibold text-white">your_account</span>
        </div>
        <MoreHorizontal size={16} className="text-white/70" />
      </div>

      {/* Media carousel */}
      {mediaUrls.length > 0 ? (
        <SwipeCarousel
          urls={mediaUrls}
          aspectClass="aspect-square"
          dotStyle="instagram"
        />
      ) : (
        <div className="w-full aspect-square bg-[#1a1a1a] flex items-center justify-center text-[#555] text-sm">
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
        <p className="text-xs text-white leading-relaxed">
          <span className="font-semibold">your_account</span>{" "}
          {body && <span>{body.slice(0, 125)}{body.length > 125 ? "..." : ""}</span>}
        </p>
        {hashtagStr && (
          <p className="text-xs text-[#E0F1FF] mt-0.5">{hashtagStr}</p>
        )}
      </div>
    </div>
  );
}

// ─── TWITTER / X ─────────────────────────────────────────────────────────────

function TwitterPreview({ body, hashtags, mediaUrls }: PostPreviewProps) {
  const hashtagStr = hashtags.map((t) => `#${t}`).join(" ");
  const fullText = [body, hashtagStr].filter(Boolean).join("\n\n").slice(0, 280);
  return (
    <div className="bg-black rounded-xl border border-[#2F3336] p-3">
      <div className="flex gap-2.5">
        <div className="w-10 h-10 rounded-full bg-[#1D1D1D] shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1">
            <span className="text-sm font-bold text-white">Your Name</span>
            <svg viewBox="0 0 22 22" className="w-3.5 h-3.5 text-blue-400 fill-current"><path d="M20.396 11c-.018-.646-.215-1.275-.57-1.816-.354-.54-.852-.972-1.438-1.246.223-.607.27-1.264.14-1.897-.131-.634-.437-1.218-.882-1.687-.47-.445-1.053-.75-1.687-.882-.633-.13-1.29-.083-1.897.14-.273-.587-.704-1.086-1.245-1.44S11.647 1.62 11 1.604c-.646.017-1.273.213-1.813.568s-.969.855-1.24 1.44c-.608-.223-1.267-.272-1.902-.14-.635.13-1.22.436-1.69.882-.445.47-.749 1.055-.878 1.69-.13.633-.08 1.29.144 1.896-.587.274-1.087.705-1.443 1.245-.356.54-.555 1.17-.574 1.817.02.647.218 1.276.574 1.817.356.54.856.972 1.443 1.245-.224.606-.274 1.263-.144 1.896.13.636.433 1.221.878 1.69.47.446 1.055.752 1.69.883.635.13 1.294.083 1.902-.143.271.586.702 1.084 1.24 1.438.54.354 1.167.551 1.813.568.647-.016 1.276-.213 1.817-.567s.972-.854 1.245-1.44c.604.225 1.261.272 1.893.143.636-.13 1.22-.436 1.69-.882.445-.47.75-1.055.88-1.69.131-.636.084-1.294-.139-1.9.588-.275 1.087-.706 1.443-1.246.355-.54.553-1.17.57-1.817zM9.662 14.85l-3.429-3.428 1.293-1.302 2.072 2.072 4.4-4.794 1.347 1.246z" /></svg>
            <span className="text-xs text-[#71767B]">@yourhandle · now</span>
          </div>
          <p className="text-[13px] text-[#E7E9EA] mt-1 whitespace-pre-wrap break-words leading-5">{fullText}</p>
          {mediaUrls.length > 0 && (
            <div className="mt-2.5">
              <TwitterMediaGrid urls={mediaUrls} />
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

function LinkedInPreview({ body, hashtags, mediaUrls }: PostPreviewProps) {
  const hashtagStr = hashtags.map((t) => `#${t}`).join(" ");
  return (
    <div className="bg-[#1B1F23] rounded-xl border border-[#38434F] overflow-hidden">
      <div className="p-3">
        <div className="flex items-center gap-2">
          <div className="w-12 h-12 rounded-full bg-[#2C3338]" />
          <div>
            <p className="text-sm font-semibold text-white">Your Name</p>
            <p className="text-[10px] text-[#FFFFFFA6]">Your headline</p>
            <p className="text-[10px] text-[#FFFFFF8C]">Just now · <span className="inline-block">🌐</span></p>
          </div>
        </div>
        <p className="text-[13px] text-[#FFFFFFE6] mt-3 whitespace-pre-wrap leading-5">{body}</p>
        {hashtagStr && <p className="text-xs text-[#71B7FB] mt-1.5">{hashtagStr}</p>}
      </div>

      {/* LinkedIn shows carousel for multiple, single for one */}
      {mediaUrls.length > 1 ? (
        <SwipeCarousel
          urls={mediaUrls}
          aspectClass="aspect-[4/3]"
          dotStyle="linkedin"
        />
      ) : mediaUrls.length === 1 ? (
        <div className="aspect-[4/3] overflow-hidden">
          <MediaItem url={mediaUrls[0]} />
        </div>
      ) : null}

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

function FacebookPreview({ body, hashtags, mediaUrls }: PostPreviewProps) {
  const hashtagStr = hashtags.map((t) => `#${t}`).join(" ");
  return (
    <div className="bg-[#242526] rounded-xl border border-[#3E4042] overflow-hidden">
      <div className="p-3">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-full bg-[#3A3B3C]" />
          <div>
            <p className="text-sm font-semibold text-[#E4E6EB]">Your Page</p>
            <p className="text-[11px] text-[#B0B3B8]">Just now · 🌎</p>
          </div>
        </div>
        <p className="text-[14px] text-[#E4E6EB] mt-2.5 leading-5">{body}</p>
        {hashtagStr && <p className="text-xs text-[#4599FF] mt-1">{hashtagStr}</p>}
      </div>

      {/* Facebook: single or carousel */}
      {mediaUrls.length > 1 ? (
        <SwipeCarousel
          urls={mediaUrls}
          aspectClass="aspect-[16/10]"
          dotStyle="default"
        />
      ) : mediaUrls.length === 1 ? (
        <div className="aspect-[16/10] overflow-hidden">
          <MediaItem url={mediaUrls[0]} />
        </div>
      ) : null}

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

function TikTokPreview({ body, hashtags, mediaUrls }: PostPreviewProps) {
  const hashtagStr = hashtags.map((t) => `#${t}`).join(" ");
  return (
    <div className="bg-black rounded-xl border border-[#2F2F2F] overflow-hidden">
      <div className="relative aspect-[9/16] max-h-[320px] bg-[#121212] flex items-center justify-center">
        {mediaUrls.length > 0 ? (
          <MediaItem url={mediaUrls[0]} iconSize={40} />
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
        <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/80 via-black/40 to-transparent">
          <p className="text-xs text-white font-semibold">@yourhandle</p>
          <p className="text-[11px] text-white/90 mt-1 leading-4">
            {(body || "").slice(0, 100)}
          </p>
          {hashtagStr && (
            <p className="text-[11px] text-white/90 mt-0.5">
              {hashtagStr}
            </p>
          )}
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

function YouTubePreview({ title, body, hashtags, mediaUrls }: PostPreviewProps) {
  return (
    <div className="bg-[#0F0F0F] rounded-xl border border-[#272727] overflow-hidden">
      {/* Video thumbnail */}
      <div className="relative aspect-video bg-[#1a1a1a] flex items-center justify-center">
        {mediaUrls.length > 0 ? (
          isVideo(mediaUrls[0]) ? (
            <div className="w-full h-full flex items-center justify-center">
              <div className="w-16 h-11 bg-red-600 rounded-2xl flex items-center justify-center">
                <div className="w-0 h-0 border-t-[8px] border-t-transparent border-l-[14px] border-l-white border-b-[8px] border-b-transparent ml-1" />
              </div>
            </div>
          ) : isPdf(mediaUrls[0]) ? (
            <MediaItem url={mediaUrls[0]} />
          ) : (
            <img src={mediaUrls[0]} alt="" className="w-full h-full object-cover" />
          )
        ) : (
          <span className="text-[#555] text-sm">No video attached</span>
        )}
        {/* Duration */}
        <div className="absolute bottom-1.5 right-1.5 bg-black/80 px-1.5 py-0.5 rounded text-[11px] text-white font-medium">
          0:00
        </div>
        {/* Progress bar */}
        <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-white/20">
          <div className="h-full w-0 bg-red-600" />
        </div>
      </div>

      {/* Info */}
      <div className="p-3 flex gap-3">
        <div className="w-9 h-9 rounded-full bg-[#272727] shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-[14px] font-medium text-[#F1F1F1] leading-5 line-clamp-2">{title || "Untitled"}</p>
          <p className="text-xs text-[#AAAAAA] mt-1">Your Channel · 0 views · Just now</p>
          {body && <p className="text-xs text-[#AAAAAA] mt-1.5 line-clamp-2">{body}</p>}
          {hashtags.length > 0 && (
            <p className="text-xs text-[#3EA6FF] mt-1">{hashtags.map((t) => `#${t}`).join(" ")}</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── EXPORT ──────────────────────────────────────────────────────────────────

const previewMap: Record<string, React.ComponentType<PostPreviewProps>> = {
  INSTAGRAM: InstagramPreview,
  TWITTER: TwitterPreview,
  LINKEDIN: LinkedInPreview,
  FACEBOOK: FacebookPreview,
  TIKTOK: TikTokPreview,
  YOUTUBE: YouTubePreview,
};

export default function PostPreview(props: PostPreviewProps) {
  const PreviewComponent = previewMap[props.platform] || TwitterPreview;

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <PlatformIcon platform={props.platform} size={14} />
        <span className="text-xs font-medium text-bb-muted">
          {getPlatformLabel(props.platform)} Preview
        </span>
      </div>
      <PreviewComponent {...props} />
    </div>
  );
}
