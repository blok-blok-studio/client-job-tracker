"use client";

import { useState } from "react";
import { ASPECT_PRESETS, ORIGINAL_ASPECT, type FocusPoint, type MediaFormat } from "@/lib/social/formats";
import FocusPointPicker from "./FocusPointPicker";

interface Props {
  url: string;
  kind: "image" | "video";
  thumbnailUrl?: string | null;
  format: MediaFormat;
  focus?: FocusPoint | null;
  /** When set (crop mode), the frame becomes a focus point picker */
  onFocusChange?: (point: FocusPoint) => void;
  className?: string;
}

/**
 * Instant preview of how a file will look once formatted. Uses the same math
 * as the renderer: black bars = object-contain on black, fill = object-cover
 * with object-position at the focus point.
 */
export default function FormattedMediaPreview({ url, kind, thumbnailUrl, format, focus, onFocusChange, className = "" }: Props) {
  const [naturalRatio, setNaturalRatio] = useState<number | null>(null);
  const preset = format.aspect !== ORIGINAL_ASPECT ? ASPECT_PRESETS[format.aspect] : undefined;
  const ratio = preset ? preset.width / preset.height : naturalRatio ?? 1;
  const crop = !!preset && format.fit === "crop";
  const point = focus ?? { x: 0.5, y: 0.5 };

  const mediaStyle: React.CSSProperties = {
    objectFit: crop ? "cover" : "contain",
    objectPosition: crop ? `${point.x * 100}% ${point.y * 100}%` : "50% 50%",
  };
  const mediaClass = "absolute inset-0 w-full h-full select-none pointer-events-none";

  return (
    <div className={`relative ${className}`}>
      <div
        className="relative w-full overflow-hidden rounded-md bg-black border border-bb-border"
        style={{ aspectRatio: String(ratio), maxWidth: "100%" }}
      >
        {kind === "video" ? (
          <video
            src={url}
            poster={thumbnailUrl || undefined}
            muted
            loop
            autoPlay
            playsInline
            preload="metadata"
            className={mediaClass}
            style={mediaStyle}
            onLoadedMetadata={(e) => {
              const v = e.currentTarget;
              if (v.videoWidth && v.videoHeight) setNaturalRatio(v.videoWidth / v.videoHeight);
            }}
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={thumbnailUrl || url}
            alt=""
            draggable={false}
            className={mediaClass}
            style={mediaStyle}
            onLoad={(e) => {
              const img = e.currentTarget;
              if (img.naturalWidth && img.naturalHeight) setNaturalRatio(img.naturalWidth / img.naturalHeight);
            }}
          />
        )}
        {crop && onFocusChange && <FocusPointPicker value={point} onChange={onFocusChange} />}
      </div>
      <span className="absolute top-1 left-1 rounded bg-black/70 px-1.5 py-0.5 font-mono text-[10px] text-white">
        {preset ? `${preset.label}${crop ? " fill" : " bars"}` : "Original"}
      </span>
    </div>
  );
}
