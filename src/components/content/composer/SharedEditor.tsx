"use client";

import { useState } from "react";
import { Hash, Loader2, PenLine, Sparkles } from "lucide-react";
import { getSpec } from "@/lib/social/specs";
import { cn } from "@/lib/utils";
import { AccountIcon } from "./AccountPicker";
import { Card, ChipInput, CharCounter, FieldLabel, inputClass } from "./ui";
import { FALLBACK_BODY_LIMITS, platformName, type SharedContent } from "./types";
import SnippetMenu from "./SnippetMenu";

interface Props {
  shared: SharedContent;
  platforms: string[];
  /** Saved captions and hashtag sets are kept per client */
  clientId: string;
  disabled?: boolean;
  onChange: (patch: Partial<SharedContent>) => void;
}

/** Caption length as the platforms count it: body plus the hashtag line. */
export function captionLength(body: string, hashtags: string[]): number {
  const tags = hashtags.map((h) => `#${h}`).join(" ");
  return [body, tags].filter(Boolean).join("\n\n").length;
}

export default function SharedEditor({ shared, platforms, clientId, disabled, onChange }: Props) {
  const [suggesting, setSuggesting] = useState(false);
  const unique = [...new Set(platforms)];
  const titleLimits = unique
    .map((p) => ({ p, max: getSpec(p)?.limits.title }))
    .filter((x): x is { p: string; max: number } => !!x.max);
  const bodyLimits = unique
    .map((p) => ({ p, max: getSpec(p)?.limits.body ?? FALLBACK_BODY_LIMITS[p] }))
    .filter((x): x is { p: string; max: number } => !!x.max);
  const showTitle = titleLimits.length > 0 || unique.length === 0;
  const length = captionLength(shared.body, shared.hashtags);

  const suggest = async () => {
    if (!shared.body && !shared.title) return;
    setSuggesting(true);
    try {
      const res = await fetch("/api/content-posts/suggest-hashtags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform: unique[0] || "INSTAGRAM", title: shared.title, body: shared.body, existingHashtags: shared.hashtags }),
      });
      const data = await res.json().catch(() => null);
      if (data?.success && Array.isArray(data.hashtags)) {
        const next = [...shared.hashtags];
        for (const t of data.hashtags as string[]) {
          const clean = t.replace(/^#/, "");
          if (clean && !next.includes(clean)) next.push(clean);
        }
        onChange({ hashtags: next });
      }
    } catch {
      /* suggestions are optional */
    } finally {
      setSuggesting(false);
    }
  };

  return (
    <Card id="composer-caption" title="Caption" icon={<PenLine size={13} />} action={<span className="text-[11px] text-bb-dim">Shared by every account unless customized</span>}>
      {showTitle && (
        <div>
          <FieldLabel htmlFor="composer-title" hint={titleLimits.length ? titleLimits.map((t) => `${platformName(t.p)} ${t.max}`).join(" · ") : undefined}>
            Title
          </FieldLabel>
          <input
            id="composer-title"
            value={shared.title}
            disabled={disabled}
            onChange={(e) => onChange({ title: e.target.value })}
            placeholder="Used by YouTube, RedNote and TikTok photo posts"
            className={inputClass}
          />
        </div>
      )}

      <div>
        <FieldLabel htmlFor="composer-body">Caption</FieldLabel>
        <div className="flex flex-wrap text-[11px] mb-1.5">
          <SnippetMenu
            kind="CAPTION"
            clientId={clientId}
            current={{ body: shared.body }}
            disabled={disabled}
            onInsert={(s) => onChange({ body: [shared.body.trimEnd(), s.body || ""].filter(Boolean).join("\n\n") })}
          />
        </div>
        <textarea
          id="composer-body"
          value={shared.body}
          disabled={disabled}
          onChange={(e) => onChange({ body: e.target.value })}
          rows={6}
          placeholder="Write the caption"
          className={cn(inputClass, "resize-y min-h-[120px] leading-relaxed")}
        />
        {bodyLimits.length > 0 && (
          <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1.5">
            {bodyLimits.map(({ p, max }) => (
              <span key={p} className="inline-flex items-center gap-1">
                <AccountIcon platform={p} size={10} />
                <CharCounter value={length} max={max} />
              </span>
            ))}
          </div>
        )}
      </div>

      <div>
        <FieldLabel
          hint={
            <button
              type="button"
              onClick={suggest}
              disabled={disabled || suggesting || (!shared.body && !shared.title)}
              className="inline-flex items-center gap-1 text-bb-orange hover:text-bb-orange-light cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {suggesting ? <Loader2 size={11} className="animate-spin" /> : <Sparkles size={11} />} Suggest
            </button>
          }
        >
          <span className="inline-flex items-center gap-1">
            <Hash size={11} /> Hashtags
          </span>
        </FieldLabel>
        <div className="flex flex-wrap text-[11px] mb-1.5">
          <SnippetMenu
            kind="HASHTAGS"
            clientId={clientId}
            current={{ hashtags: shared.hashtags }}
            disabled={disabled}
            onInsert={(s) => onChange({ hashtags: [...shared.hashtags, ...s.hashtags.filter((t) => !shared.hashtags.includes(t))] })}
          />
        </div>
        <ChipInput values={shared.hashtags} onChange={(hashtags) => onChange({ hashtags })} placeholder="Type a tag and press Enter" prefix="#" disabled={disabled} />
      </div>
    </Card>
  );
}
