"use client";

import { useState, useEffect, useRef } from "react";
import { Film } from "lucide-react";

interface VideoThumbnailProps {
  src: string;
  className?: string;
  iconSize?: number;
  showPlayIcon?: boolean;
}

/**
 * Generates a real thumbnail from a video by loading it offscreen,
 * seeking to 0.5s, drawing the frame to a canvas, and displaying it
 * as an image. Falls back to a Film icon if extraction fails.
 */
export default function VideoThumbnail({
  src,
  className = "w-full h-full object-cover",
  iconSize = 16,
  showPlayIcon = true,
}: VideoThumbnailProps) {
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const attempted = useRef(false);

  useEffect(() => {
    if (attempted.current) return;
    attempted.current = true;

    const video = document.createElement("video");
    video.crossOrigin = "anonymous";
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";

    const timeoutId = { current: 0 as unknown as ReturnType<typeof setTimeout> };

    const cleanup = () => {
      clearTimeout(timeoutId.current);
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
          // Check if the frame is actually valid (not all black)
          if (dataUrl.length > 1000) {
            setThumbUrl(dataUrl);
          } else {
            setFailed(true);
          }
        } else {
          setFailed(true);
        }
      } catch {
        // Canvas tainted or other error
        setFailed(true);
      }
      cleanup();
    };

    const onLoaded = () => {
      // Seek to 0.5s or 10% of duration, whichever is less
      const seekTo = Math.min(0.5, video.duration * 0.1 || 0.5);
      video.currentTime = seekTo;
    };

    const onError = () => {
      setFailed(true);
      cleanup();
    };

    // Timeout after 8 seconds
    timeoutId.current = setTimeout(() => {
      setFailed(true);
      cleanup();
    }, 8000);

    video.addEventListener("loadeddata", onLoaded);
    video.addEventListener("seeked", onSeeked);
    video.addEventListener("error", onError);
    video.src = src;
    video.load();

    return cleanup;
  }, [src]);

  // Successfully extracted a thumbnail
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

  // Failed or still loading — show icon fallback
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
