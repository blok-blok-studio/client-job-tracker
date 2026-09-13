"use client";

import { useEffect, useState } from "react";
import { Gauge } from "lucide-react";
import { cn } from "@/lib/utils";
import { ChipInput, FieldLabel, SegmentedControl, Toggle, inputClass } from "../ui";
import { ImageChoice, imagesOf, setting, type PanelProps } from "./shared";

const CATEGORIES: [string, string][] = [
  ["22", "People & Blogs"],
  ["1", "Film & Animation"],
  ["2", "Autos & Vehicles"],
  ["10", "Music"],
  ["15", "Pets & Animals"],
  ["17", "Sports"],
  ["19", "Travel & Events"],
  ["20", "Gaming"],
  ["23", "Comedy"],
  ["24", "Entertainment"],
  ["25", "News & Politics"],
  ["26", "Howto & Style"],
  ["27", "Education"],
  ["28", "Science & Technology"],
  ["29", "Nonprofits & Activism"],
];

interface Quota {
  used: number;
  limit: number;
  resetsAt?: string;
  uploadsLeft: number;
}

let quotaCache: { at: number; data: Quota | null } | null = null;

function useYouTubeQuota() {
  const [quota, setQuota] = useState<Quota | null>(quotaCache?.data ?? null);
  useEffect(() => {
    if (quotaCache && Date.now() - quotaCache.at < 60_000) return;
    let cancelled = false;
    fetch("/api/social/youtube/quota")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const data = d?.success ? (d.data as Quota) : null;
        quotaCache = { at: Date.now(), data };
        if (!cancelled) setQuota(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  return quota;
}

export default function YouTubePanel({ draft, postType, mediaUrls, meta, disabled, onDraft, onSettings }: PanelProps) {
  const quota = useYouTubeQuota();
  const madeForKids = draft.settings.madeForKids as boolean | undefined;
  const tags = setting<string[]>(draft, "tags", []);

  return (
    <div className="space-y-3">
      {quota && (
        <div
          className={cn(
            "flex items-center gap-2 rounded-lg border px-3 py-2 text-xs",
            quota.uploadsLeft <= 0 ? "border-red-500/30 bg-red-500/5 text-red-300" : quota.uploadsLeft <= 2 ? "border-amber-500/30 bg-amber-500/5 text-amber-200" : "border-bb-border bg-bb-elevated text-bb-muted"
          )}
        >
          <Gauge size={13} className="shrink-0" />
          <span>
            {quota.uploadsLeft <= 0 ? "No YouTube uploads left today" : `${quota.uploadsLeft} YouTube upload${quota.uploadsLeft === 1 ? "" : "s"} left today`} across all clients
            {quota.resetsAt ? `, resets ${new Date(quota.resetsAt).toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit" })}` : ""}.
          </span>
        </div>
      )}

      <div>
        <FieldLabel>Visibility</FieldLabel>
        <SegmentedControl
          value={setting(draft, "privacyStatus", "public")}
          disabled={disabled}
          onChange={(privacyStatus) => onSettings({ privacyStatus })}
          options={[
            { value: "public", label: "Public" },
            { value: "unlisted", label: "Unlisted" },
            { value: "private", label: "Private" },
          ]}
        />
        {setting(draft, "privacyStatus", "public") === "public" && (
          <p className="text-[11px] text-bb-dim mt-1">Uploads ahead of time as private, then YouTube makes it public at the scheduled minute.</p>
        )}
      </div>

      <div>
        <FieldLabel hint="Required by YouTube">Audience</FieldLabel>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {[
            { v: false, label: "Not made for kids" },
            { v: true, label: "Made for kids" },
          ].map((o) => (
            <button
              key={String(o.v)}
              type="button"
              disabled={disabled}
              onClick={() => onSettings({ madeForKids: o.v })}
              className={cn(
                "px-3 py-2 rounded-lg border text-sm text-left cursor-pointer transition-colors disabled:cursor-not-allowed",
                madeForKids === o.v ? "border-bb-orange bg-bb-orange/10 text-white" : "border-bb-border bg-bb-elevated text-bb-muted hover:text-white"
              )}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div>
          <FieldLabel htmlFor={`yt-cat-${draft.key}`}>Category</FieldLabel>
          <select
            id={`yt-cat-${draft.key}`}
            value={setting(draft, "categoryId", "22")}
            disabled={disabled}
            onChange={(e) => onSettings({ categoryId: e.target.value })}
            className={inputClass}
          >
            {CATEGORIES.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <FieldLabel htmlFor={`yt-pl-${draft.key}`} hint="Optional">
            Playlist ID
          </FieldLabel>
          <input
            id={`yt-pl-${draft.key}`}
            value={setting(draft, "playlistId", "")}
            disabled={disabled}
            onChange={(e) => onSettings({ playlistId: e.target.value.trim() || undefined })}
            placeholder="PL..."
            className={inputClass}
          />
        </div>
      </div>

      <div>
        <FieldLabel hint={`${tags.join(",").length}/500`}>Tags</FieldLabel>
        <ChipInput values={tags} onChange={(v) => onSettings({ tags: v })} placeholder="Add search tags" disabled={disabled} />
      </div>

      <Toggle
        label="Notify subscribers"
        checked={setting(draft, "notifySubscribers", true)}
        disabled={disabled}
        onChange={(notifySubscribers) => onSettings({ notifySubscribers })}
      />
      <Toggle
        label="Altered or synthetic content"
        description="Turn on if realistic-looking footage was made or changed with AI or editing."
        checked={setting(draft, "containsSyntheticMedia", false)}
        disabled={disabled}
        onChange={(containsSyntheticMedia) => onSettings({ containsSyntheticMedia })}
      />

      {postType !== "short" && (
        <ImageChoice
          label="Custom thumbnail"
          hint="JPG or PNG under 2 MB, 1280×720. The channel must be verified for custom thumbnails."
          value={draft.thumbnailUrl}
          candidates={imagesOf(mediaUrls, meta)}
          disabled={disabled}
          onChange={(thumbnailUrl) => onDraft({ thumbnailUrl })}
        />
      )}
    </div>
  );
}
