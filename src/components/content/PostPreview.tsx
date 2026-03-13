"use client";

import { Film } from "lucide-react";
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

function MediaPreview({ urls }: { urls: string[] }) {
  if (urls.length === 0) return null;

  if (urls.length === 1) {
    const url = urls[0];
    return (
      <div className="rounded-lg overflow-hidden border border-bb-border bg-bb-surface">
        {isVideo(url) ? (
          <div className="w-full h-48 flex items-center justify-center bg-black/40">
            <Film size={32} className="text-bb-muted" />
            <span className="text-xs text-bb-dim ml-2">Video</span>
          </div>
        ) : (
          <img src={url} alt="" className="w-full h-48 object-cover" />
        )}
      </div>
    );
  }

  // Grid for multiple images
  return (
    <div className={`grid gap-0.5 rounded-lg overflow-hidden border border-bb-border ${
      urls.length === 2 ? "grid-cols-2" : urls.length === 3 ? "grid-cols-2" : "grid-cols-2"
    }`}>
      {urls.slice(0, 4).map((url, i) => (
        <div
          key={url}
          className={`bg-bb-surface overflow-hidden ${
            urls.length === 3 && i === 0 ? "row-span-2" : ""
          }`}
        >
          {isVideo(url) ? (
            <div className="w-full h-24 flex items-center justify-center bg-black/40">
              <Film size={20} className="text-bb-muted" />
            </div>
          ) : (
            <img src={url} alt="" className="w-full h-24 object-cover" />
          )}
        </div>
      ))}
    </div>
  );
}

function InstagramPreview({ body, hashtags, mediaUrls }: PostPreviewProps) {
  const hashtagStr = hashtags.map((t) => `#${t}`).join(" ");
  return (
    <div className="bg-black rounded-xl overflow-hidden border border-bb-border/50">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2">
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-pink-500 via-red-500 to-yellow-500" />
        <span className="text-xs font-semibold text-white">your_account</span>
      </div>
      {/* Media */}
      {mediaUrls.length > 0 ? (
        <div className="w-full aspect-square bg-bb-surface overflow-hidden">
          {isVideo(mediaUrls[0]) ? (
            <div className="w-full h-full flex items-center justify-center">
              <Film size={40} className="text-bb-muted" />
            </div>
          ) : (
            <img src={mediaUrls[0]} alt="" className="w-full h-full object-cover" />
          )}
        </div>
      ) : (
        <div className="w-full aspect-square bg-bb-surface flex items-center justify-center text-bb-dim text-sm">
          No media attached
        </div>
      )}
      {/* Carousel dots */}
      {mediaUrls.length > 1 && (
        <div className="flex justify-center gap-1 py-1.5">
          {mediaUrls.slice(0, 10).map((_, i) => (
            <div key={i} className={`w-1.5 h-1.5 rounded-full ${i === 0 ? "bg-blue-400" : "bg-bb-dim/40"}`} />
          ))}
        </div>
      )}
      {/* Caption */}
      <div className="px-3 py-2">
        <p className="text-xs text-white">
          <span className="font-semibold">your_account</span>{" "}
          {body && <span>{body.slice(0, 125)}{body.length > 125 ? "..." : ""}</span>}
        </p>
        {hashtagStr && (
          <p className="text-xs text-blue-400 mt-0.5">{hashtagStr}</p>
        )}
      </div>
    </div>
  );
}

function TwitterPreview({ body, hashtags, mediaUrls }: PostPreviewProps) {
  const hashtagStr = hashtags.map((t) => `#${t}`).join(" ");
  const fullText = [body, hashtagStr].filter(Boolean).join("\n\n").slice(0, 280);
  return (
    <div className="bg-black rounded-xl border border-bb-border/50 p-3">
      <div className="flex gap-2">
        <div className="w-10 h-10 rounded-full bg-bb-elevated shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1">
            <span className="text-sm font-bold text-white">Your Name</span>
            <span className="text-xs text-bb-dim">@yourhandle · now</span>
          </div>
          <p className="text-sm text-white mt-1 whitespace-pre-wrap break-words">{fullText}</p>
          {mediaUrls.length > 0 && (
            <div className="mt-2">
              <MediaPreview urls={mediaUrls} />
            </div>
          )}
          {/* Action bar */}
          <div className="flex justify-between mt-3 text-bb-dim">
            {["Reply", "Repost", "Like", "View"].map((action) => (
              <span key={action} className="text-[10px]">{action}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function LinkedInPreview({ body, hashtags, mediaUrls }: PostPreviewProps) {
  const hashtagStr = hashtags.map((t) => `#${t}`).join(" ");
  return (
    <div className="bg-[#1B1F23] rounded-xl border border-bb-border/50">
      <div className="p-3">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-full bg-bb-elevated" />
          <div>
            <p className="text-sm font-semibold text-white">Your Name</p>
            <p className="text-[10px] text-bb-dim">Your title · Just now</p>
          </div>
        </div>
        <p className="text-sm text-white mt-3 whitespace-pre-wrap">{body}</p>
        {hashtagStr && <p className="text-xs text-blue-400 mt-1">{hashtagStr}</p>}
      </div>
      {mediaUrls.length > 0 && (
        <MediaPreview urls={mediaUrls} />
      )}
      <div className="flex justify-around py-2 border-t border-bb-border/30 text-bb-dim text-[10px]">
        <span>Like</span><span>Comment</span><span>Repost</span><span>Send</span>
      </div>
    </div>
  );
}

function FacebookPreview({ body, hashtags, mediaUrls }: PostPreviewProps) {
  const hashtagStr = hashtags.map((t) => `#${t}`).join(" ");
  return (
    <div className="bg-[#242526] rounded-xl border border-bb-border/50">
      <div className="p-3">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-full bg-bb-elevated" />
          <div>
            <p className="text-sm font-semibold text-white">Your Page</p>
            <p className="text-[10px] text-bb-dim">Just now · Public</p>
          </div>
        </div>
        <p className="text-sm text-white mt-3">{body}</p>
        {hashtagStr && <p className="text-xs text-blue-400 mt-1">{hashtagStr}</p>}
      </div>
      {mediaUrls.length > 0 && (
        <MediaPreview urls={mediaUrls} />
      )}
      <div className="flex justify-around py-2 border-t border-bb-border/30 text-bb-dim text-[10px]">
        <span>Like</span><span>Comment</span><span>Share</span>
      </div>
    </div>
  );
}

function TikTokPreview({ body, hashtags, mediaUrls }: PostPreviewProps) {
  const hashtagStr = hashtags.map((t) => `#${t}`).join(" ");
  return (
    <div className="bg-black rounded-xl border border-bb-border/50 overflow-hidden">
      <div className="relative aspect-[9/16] max-h-[280px] bg-bb-surface flex items-center justify-center">
        {mediaUrls.length > 0 ? (
          isVideo(mediaUrls[0]) ? (
            <Film size={40} className="text-bb-muted" />
          ) : (
            <img src={mediaUrls[0]} alt="" className="w-full h-full object-cover" />
          )
        ) : (
          <span className="text-bb-dim text-sm">No video attached</span>
        )}
        {/* Overlay text */}
        <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/80 to-transparent">
          <p className="text-xs text-white font-semibold">@yourhandle</p>
          <p className="text-[10px] text-white/90 mt-1">
            {(body || "").slice(0, 80)}
            {hashtagStr && <span className="text-cyan-300"> {hashtagStr}</span>}
          </p>
        </div>
      </div>
    </div>
  );
}

function YouTubePreview({ title, body, hashtags, mediaUrls }: PostPreviewProps) {
  return (
    <div className="bg-[#0F0F0F] rounded-xl border border-bb-border/50 overflow-hidden">
      <div className="relative aspect-video bg-bb-surface flex items-center justify-center">
        {mediaUrls.length > 0 ? (
          isVideo(mediaUrls[0]) ? (
            <Film size={40} className="text-bb-muted" />
          ) : (
            <img src={mediaUrls[0]} alt="" className="w-full h-full object-cover" />
          )
        ) : (
          <span className="text-bb-dim text-sm">No video attached</span>
        )}
        {/* Duration placeholder */}
        <div className="absolute bottom-1 right-1 bg-black/80 px-1 py-0.5 rounded text-[10px] text-white">
          0:00
        </div>
      </div>
      <div className="p-3">
        <p className="text-sm font-medium text-white line-clamp-2">{title || "Untitled"}</p>
        <p className="text-[10px] text-bb-dim mt-1">Your Channel · 0 views · Just now</p>
        {body && <p className="text-xs text-bb-muted mt-2 line-clamp-2">{body}</p>}
        {hashtags.length > 0 && (
          <p className="text-xs text-blue-400 mt-1">{hashtags.map((t) => `#${t}`).join(" ")}</p>
        )}
      </div>
    </div>
  );
}

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
