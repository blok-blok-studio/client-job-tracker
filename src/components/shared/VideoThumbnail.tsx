"use client";

import { useState, useEffect, useRef } from "react";
import { Film } from "lucide-react";

interface VideoThumbnailProps {
  src: string;
  thumbnailUrl?: string | null;
  className?: string;
  iconSize?: number;
  showPlayIcon?: boolean;
}

/**
 * Generates a real thumbnail from a video by loading it, seeking, and
 * drawing the frame to a canvas. Tries direct URL first, then falls
 * back to a proxy that fixes content-type headers for old .mov files.
 */
export default function VideoThumbnail({
  src,
  thumbnailUrl,
  className = "w-full h-full object-cover",
  iconSize = 16,
  showPlayIcon = true,
}: VideoThumbnailProps) {
  const [thumbUrl, setThumbUrl] = useState<string | null>(thumbnailUrl || null);
  const [failed, setFailed] = useState(false);
  const attempted = useRef(false);

  useEffect(() => {
    // If we already have a server-generated thumbnail, use it
    if (thumbnailUrl) {
      setThumbUrl(thumbnailUrl);
      return;
    }

    if (attempted.current) return;
    attempted.current = true;

    // Try direct URL first, then proxy if it fails
    extractFrame(src).then((dataUrl) => {
      if (dataUrl) {
        setThumbUrl(dataUrl);
      } else {
        // Retry through proxy (fixes content-type for old .mov files)
        const proxied = `/api/client-media/thumb?url=${encodeURIComponent(src)}`;
        extractFrame(proxied).then((dataUrl2) => {
          if (dataUrl2) setThumbUrl(dataUrl2);
          else setFailed(true);
        });
      }
    });
  }, [src, thumbnailUrl]);

  if (thumbUrl) {
    return (
      <div className="relative w-full h-full">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={thumbUrl} alt="" className={className} />
        {showPlayIcon && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-9 h-9 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center">
              <Film size={iconSize} className="text-white ml-0.5" />
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-purple-500/10 to-transparent relative">
      <Film size={iconSize + 8} className="text-purple-400" />
      {!failed && (
        <div className="absolute bottom-2 left-0 right-0 flex justify-center">
          <div className="w-4 h-0.5 rounded-full bg-purple-400/30 overflow-hidden">
            <div className="h-full bg-purple-400 animate-pulse w-full" />
          </div>
        </div>
      )}
    </div>
  );
}

/** Try to load a video URL and extract a frame as a JPEG data URL. */
function extractFrame(videoSrc: string): Promise<string | null> {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    video.crossOrigin = "anonymous";
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";

    const timer = setTimeout(() => {
      cleanup();
      resolve(null);
    }, 8000);

    const cleanup = () => {
      clearTimeout(timer);
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("error", onError);
      video.removeEventListener("loadeddata", onLoaded);
      video.src = "";
      video.load();
    };

    const onSeeked = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = video.videoWidth || 320;
        canvas.height = video.videoHeight || 180;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
          cleanup();
          resolve(dataUrl.length > 1000 ? dataUrl : null);
        } else {
          cleanup();
          resolve(null);
        }
      } catch {
        cleanup();
        resolve(null);
      }
    };

    const onLoaded = () => {
      video.currentTime = Math.min(0.5, video.duration * 0.1 || 0.5);
    };

    const onError = () => {
      cleanup();
      resolve(null);
    };

    video.addEventListener("loadeddata", onLoaded);
    video.addEventListener("seeked", onSeeked);
    video.addEventListener("error", onError);
    video.src = videoSrc;
    video.load();
  });
}
