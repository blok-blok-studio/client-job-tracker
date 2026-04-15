"use client";

import { useState } from "react";
import { Film } from "lucide-react";

interface VideoThumbnailProps {
  src: string;
  thumbnailUrl?: string | null;
  filename?: string;
  className?: string;
  iconSize?: number;
  showPlayIcon?: boolean;
}

/**
 * Video thumbnail component. Priority order:
 * 1. Server-generated thumbnailUrl (JPEG image — instant, reliable)
 * 2. Inline <video> element that renders the first frame directly
 *
 * The <video> approach works for any format the browser can decode.
 * No canvas extraction, no proxy, no blob downloads.
 */
export default function VideoThumbnail({
  src,
  thumbnailUrl,
  filename,
  className = "w-full h-full object-cover",
  iconSize = 16,
  showPlayIcon = true,
}: VideoThumbnailProps) {
  const [imgError, setImgError] = useState(false);
  const [videoError, setVideoError] = useState(false);

  // If we have a server-generated thumbnail, use it (instant)
  if (thumbnailUrl && !imgError) {
    return (
      <div className="relative w-full h-full">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={thumbnailUrl}
          alt={filename || ""}
          className={className}
          onError={() => setImgError(true)}
        />
        {showPlayIcon && <PlayOverlay size={iconSize} />}
      </div>
    );
  }

  // If video can't be decoded, show a fallback icon instead of a black box
  if (videoError) {
    return (
      <div className="relative w-full h-full bg-black/80 flex items-center justify-center">
        <Film size={iconSize * 2} className="text-white/40" />
        {filename && (
          <div className="absolute bottom-0 left-0 right-0 px-1.5 py-1 bg-gradient-to-t from-black/80 to-transparent">
            <p className="text-[9px] text-white/80 truncate">{filename}</p>
          </div>
        )}
      </div>
    );
  }

  // Otherwise render a <video> element directly — the browser will show the first decodable frame
  return (
    <div className="relative w-full h-full bg-black">
      <video
        src={src}
        muted
        playsInline
        preload="auto"
        className={className}
        // Once metadata loads, seek to 0.5s to show a non-black frame
        onLoadedMetadata={(e) => {
          const v = e.currentTarget;
          v.currentTime = Math.min(0.5, v.duration * 0.1 || 0.5);
        }}
        onError={() => setVideoError(true)}
      />
      {showPlayIcon && <PlayOverlay size={iconSize} />}
      {/* Filename overlay at bottom so you can identify the video even if frame doesn't render */}
      {filename && (
        <div className="absolute bottom-0 left-0 right-0 px-1.5 py-1 bg-gradient-to-t from-black/80 to-transparent">
          <p className="text-[9px] text-white/80 truncate">{filename}</p>
        </div>
      )}
    </div>
  );
}

function PlayOverlay({ size }: { size: number }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
      <div className="w-9 h-9 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center">
        <Film size={size} className="text-white ml-0.5" />
      </div>
    </div>
  );
}
