"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

export interface ViewerItem {
  url: string;
  kind: "image" | "video" | "audio";
  filename?: string;
  /** Browser-friendly copy of a video (iPhone HEVC .mov won't play in Chrome) */
  playbackUrl?: string | null;
  /** Poster for video, or the JPEG preview of a HEIC photo */
  thumbnailUrl?: string | null;
}

/**
 * Full-screen look and listen. The file streams from storage, so nothing is
 * downloaded to the device. Sits above any open modal and takes Escape first.
 */
export default function MediaViewer({ item, onClose }: { item: ViewerItem | null; onClose: () => void }) {
  useEffect(() => {
    if (!item) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // Close only the viewer, not the editor underneath
      e.stopImmediatePropagation();
      onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [item, onClose]);

  if (!item || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[200] flex flex-col bg-black/95" role="dialog" aria-modal="true" aria-label={item.filename || "Preview"} onClick={onClose}>
      <div className="flex items-center justify-between gap-3 px-4 py-3 shrink-0">
        <p className="text-sm text-white/80 truncate">{item.filename || ""}</p>
        <button type="button" onClick={onClose} aria-label="Close preview" className="p-2.5 -m-1 rounded-full bg-white/10 text-white hover:bg-white/20 cursor-pointer transition-colors shrink-0">
          <X size={18} />
        </button>
      </div>
      <div className="flex-1 min-h-0 flex items-center justify-center px-3 pb-[max(env(safe-area-inset-bottom),12px)]">
        {item.kind === "video" ? (
          <video
            key={item.url}
            src={item.playbackUrl || item.url}
            poster={item.thumbnailUrl || undefined}
            controls
            autoPlay
            playsInline
            preload="metadata"
            onClick={(e) => e.stopPropagation()}
            className="max-w-full max-h-full rounded-lg bg-black"
          />
        ) : item.kind === "audio" ? (
          // eslint-disable-next-line jsx-a11y/media-has-caption
          <audio key={item.url} src={item.url} controls autoPlay onClick={(e) => e.stopPropagation()} className="w-full max-w-md" />
        ) : (
          // HEIC originals only display in Safari, so use the JPEG preview when there is one
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.thumbnailUrl || item.url} alt={item.filename || ""} onClick={(e) => e.stopPropagation()} className="max-w-full max-h-full object-contain rounded-lg" />
        )}
      </div>
    </div>,
    document.body
  );
}
