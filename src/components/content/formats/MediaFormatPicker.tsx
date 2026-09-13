"use client";

import {
  ASPECT_PRESETS,
  ORIGINAL_ASPECT,
  getFormatOptions,
  type FitMode,
  type MediaFormat,
} from "@/lib/social/formats";

interface Props {
  platform: string;
  postType?: string | null;
  value: MediaFormat | null | undefined;
  onChange: (format: MediaFormat) => void;
  disabled?: boolean;
  className?: string;
}

/** Tiny frame outline drawn at the preset's proportions. */
function FrameIcon({ aspect }: { aspect: string }) {
  const preset = ASPECT_PRESETS[aspect];
  const box = 16;
  let w = box;
  let h = box;
  if (preset) {
    const ratio = preset.width / preset.height;
    if (ratio >= 1) h = Math.max(6, Math.round(box / ratio));
    else w = Math.max(6, Math.round(box * ratio));
  }
  return (
    <span className="inline-flex items-center justify-center w-4 h-4 shrink-0" aria-hidden>
      {preset ? (
        <span className="block rounded-[2px] border border-current" style={{ width: w, height: h }} />
      ) : (
        <span className="block w-3.5 h-3.5 rounded-[2px] border border-dashed border-current" />
      )}
    </span>
  );
}

const FITS: { key: FitMode; label: string; hint: string }[] = [
  { key: "pad", label: "Black bars", hint: "Shows the whole frame" },
  { key: "crop", label: "Fill (crop)", hint: "No bars, trims the edges" },
];

/**
 * Aspect ratio chips (only shapes the platform accepts, recommended one marked)
 * plus the black bars / fill toggle.
 */
export default function MediaFormatPicker({ platform, postType, value, onChange, disabled, className = "" }: Props) {
  const options = getFormatOptions(platform, postType);
  const current: MediaFormat = value ?? { aspect: options.defaultAspect, fit: "pad" };
  const isOriginal = current.aspect === ORIGINAL_ASPECT;

  return (
    <div className={`space-y-2 ${className}`}>
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Aspect ratio">
        {options.aspects.map((aspect) => {
          const preset = ASPECT_PRESETS[aspect];
          const selected = current.aspect === aspect;
          const recommended = aspect === options.defaultAspect;
          return (
            <button
              key={aspect}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={disabled}
              onClick={() => onChange({ ...current, aspect })}
              title={preset ? `${preset.hint}, ${preset.width}×${preset.height}` : "Post the file as it is"}
              className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 ${
                selected
                  ? "border-bb-orange bg-bb-orange/10 text-white"
                  : "border-bb-border bg-bb-elevated text-bb-muted hover:text-white hover:border-bb-dim"
              }`}
            >
              <FrameIcon aspect={aspect} />
              <span className="font-mono">{preset ? preset.label : "Original"}</span>
              {recommended && (
                <span className="text-[10px] leading-none rounded bg-bb-orange/20 text-bb-orange-light px-1 py-0.5">Best</span>
              )}
            </button>
          );
        })}
      </div>

      <div
        className={`inline-flex rounded-md border border-bb-border bg-bb-elevated p-0.5 ${isOriginal ? "opacity-50" : ""}`}
        role="radiogroup"
        aria-label="How to fit the media"
      >
        {FITS.map((fit) => {
          const selected = current.fit === fit.key;
          return (
            <button
              key={fit.key}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={disabled || isOriginal}
              onClick={() => onChange({ ...current, fit: fit.key })}
              title={fit.hint}
              className={`rounded px-2.5 py-1 text-xs transition-colors cursor-pointer disabled:cursor-not-allowed ${
                selected && !isOriginal ? "bg-bb-orange text-white" : "text-bb-muted hover:text-white"
              }`}
            >
              {fit.label}
            </button>
          );
        })}
      </div>

      {options.note && <p className="text-[11px] text-bb-dim">{options.note}</p>}
    </div>
  );
}
