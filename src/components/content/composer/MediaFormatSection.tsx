"use client";

import { useState } from "react";
import { Copy, Crop } from "lucide-react";
import { MediaFormatPicker, FormattedMediaPreview } from "../formats";
import type { MediaFormat } from "@/lib/social/formats";
import { Card } from "./ui";
import type { AccountDraft, MediaMeta } from "./types";
import { effectiveFormat } from "./format-utils";
import { toSpecMedia } from "./validation";

interface Props {
  draft: AccountDraft;
  postType: string | null;
  mediaUrls: string[];
  meta: Record<string, MediaMeta>;
  disabled?: boolean;
  onSettings: (patch: Record<string, unknown>) => void;
  onApplyToAll: (format: MediaFormat) => void;
}

/** Aspect ratio + bars/crop for this account's media, with a live framed preview. */
export default function MediaFormatSection({ draft, postType, mediaUrls, meta, disabled, onSettings, onApplyToAll }: Props) {
  const [applied, setApplied] = useState(false);
  const visual = mediaUrls.filter((u) => {
    const k = meta[u]?.kind;
    return k === "image" || k === "video" || (!k && /\.(jpe?g|png|webp|gif|heic|mp4|mov|webm)(\?|$)/i.test(u));
  });
  if (visual.length === 0) return null;

  const format = effectiveFormat(draft, postType, toSpecMedia(mediaUrls, meta));
  const focus = (format.focus || {}) as Record<string, { x: number; y: number }>;

  const setFormat = (next: MediaFormat) => {
    // Keep focus points across aspect changes; they only matter in crop mode
    onSettings({ mediaFormat: { ...next, focus: next.focus ?? format.focus }, mediaFormatManual: true });
    setApplied(false);
  };

  return (
    <Card
      title="Format"
      icon={<Crop size={13} />}
      action={
        !disabled && (
          <button
            type="button"
            onClick={() => {
              onApplyToAll(format);
              setApplied(true);
            }}
            className="inline-flex items-center gap-1 text-[11px] text-bb-dim hover:text-white cursor-pointer transition-colors"
          >
            <Copy size={11} /> {applied ? "Applied to all" : "Apply to all accounts"}
          </button>
        )
      }
    >
      <MediaFormatPicker platform={draft.platform} postType={postType} value={format} disabled={disabled} onChange={setFormat} />
      {!draft.settings.mediaFormatManual && (
        <p className="text-[11px] text-bb-dim">
          {format.aspect === "original"
            ? "Posts your original files at full quality. Pick a shape only if you want one."
            : "This post type needs this shape, so a full-resolution copy is made when it publishes. Your original stays untouched."}
        </p>
      )}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {visual.slice(0, 6).map((url) => {
          const m = meta[url];
          return (
            <FormattedMediaPreview
              key={url}
              url={url}
              kind={m?.kind === "video" ? "video" : "image"}
              thumbnailUrl={m?.thumbnailUrl ?? undefined}
              format={format}
              focus={focus[url]}
              onFocusChange={
                disabled || format.fit !== "crop"
                  ? undefined
                  : (point: { x: number; y: number }) => setFormat({ ...format, focus: { ...focus, [url]: point } })
              }
            />
          );
        })}
      </div>
      {visual.length > 6 && <p className="text-[11px] text-bb-dim">+{visual.length - 6} more use the same format.</p>}
    </Card>
  );
}
