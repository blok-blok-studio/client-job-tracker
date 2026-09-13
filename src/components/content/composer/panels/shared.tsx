"use client";

import { useRef, useState } from "react";
import { ImagePlus, Loader2, X } from "lucide-react";
import { uploadFile } from "@/lib/client-upload";
import { cn } from "@/lib/utils";
import type { AccountDraft, MediaMeta } from "../types";

export interface PanelProps {
  draft: AccountDraft;
  postType: string | null;
  mediaUrls: string[];
  meta: Record<string, MediaMeta>;
  disabled?: boolean;
  onDraft: (patch: Partial<AccountDraft>) => void;
  onSettings: (patch: Record<string, unknown>) => void;
}

export function setting<T>(draft: AccountDraft, key: string, fallback: T): T {
  const v = draft.settings[key];
  return (v === undefined || v === null ? fallback : v) as T;
}

/** Pick an image for a cover/thumbnail from the post's images, or upload one. */
export function ImageChoice({
  value,
  onChange,
  candidates,
  disabled,
  label,
  hint,
}: {
  value: string;
  onChange: (url: string) => void;
  candidates: string[];
  disabled?: boolean;
  label: string;
  hint?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const options = [...new Set([...(value ? [value] : []), ...candidates])];

  return (
    <div>
      <p className="text-xs font-medium text-bb-muted mb-1">{label}</p>
      {hint && <p className="text-[11px] text-bb-dim mb-1.5">{hint}</p>}
      <div className="flex flex-wrap gap-2">
        {options.map((url) => (
          <button
            key={url}
            type="button"
            disabled={disabled}
            onClick={() => onChange(value === url ? "" : url)}
            className={cn(
              "relative w-14 h-14 rounded-md overflow-hidden border-2 cursor-pointer transition-colors disabled:cursor-not-allowed",
              value === url ? "border-bb-orange" : "border-bb-border hover:border-bb-muted"
            )}
            aria-pressed={value === url}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt="" className="w-full h-full object-cover" />
            {value === url && (
              <span className="absolute top-0.5 right-0.5 bg-black/70 rounded-full p-0.5">
                <X size={9} className="text-white" />
              </span>
            )}
          </button>
        ))}
        {!disabled && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="w-14 h-14 rounded-md border border-dashed border-bb-border flex items-center justify-center text-bb-dim hover:text-white hover:border-bb-orange/50 cursor-pointer transition-colors"
            aria-label={`Upload ${label.toLowerCase()}`}
          >
            {uploading ? <Loader2 size={16} className="animate-spin" /> : <ImagePlus size={16} />}
          </button>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png"
          className="hidden"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            setUploading(true);
            setError(null);
            try {
              const { url } = await uploadFile(file);
              onChange(url);
            } catch (err) {
              setError(err instanceof Error ? err.message : "Upload failed");
            } finally {
              setUploading(false);
            }
          }}
        />
      </div>
      {error && <p className="text-xs text-red-400 mt-1">{error}</p>}
    </div>
  );
}

export function imagesOf(urls: string[], meta: Record<string, MediaMeta>): string[] {
  return urls.filter((u) => (meta[u]?.kind ?? (/\.(jpe?g|png|webp|gif)(\?|$)/i.test(u) ? "image" : "")) === "image");
}
