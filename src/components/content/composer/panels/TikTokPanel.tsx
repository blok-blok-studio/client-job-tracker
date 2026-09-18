"use client";

import { AlertTriangle, Info, Loader2 } from "lucide-react";
import {
  TIKTOK_BRANDED_CONTENT_POLICY_URL,
  TIKTOK_BRANDED_PRIVATE_NOTICE,
  TIKTOK_LABEL_BRANDED,
  TIKTOK_LABEL_YOUR_BRAND,
  TIKTOK_MUSIC_USAGE_URL,
  TIKTOK_PRIVACY_LABELS,
  TIKTOK_PROCESSING_NOTICE,
} from "@/lib/social/specs/tiktok";
import { cn } from "@/lib/utils";
import { Avatar, FieldLabel, Toggle, inputClass } from "../ui";
import type { TikTokCreatorInfo } from "../validation";
import { setting, type PanelProps } from "./shared";
import TrendingSoundField from "./TrendingSoundField";

const MUSIC_URL = TIKTOK_MUSIC_USAGE_URL;
const BRANDED_URL = TIKTOK_BRANDED_CONTENT_POLICY_URL;

/** Friendlier wording for Friends; the rest come from the spec. */
export const PRIVACY_LABELS: Record<string, string> = {
  ...TIKTOK_PRIVACY_LABELS,
  MUTUAL_FOLLOW_FRIENDS: "Friends (followers you follow back)",
};

export interface CreatorInfoState {
  loading: boolean;
  data: TikTokCreatorInfo | null;
  error: string | null;
}

/** The consent sentence TikTok requires next to the post button. */
export function TikTokConsent({ branded }: { branded: boolean }) {
  return (
    <p className="text-[11px] text-bb-dim">
      {branded ? (
        <>
          By posting, you agree to TikTok&apos;s{" "}
          <a href={BRANDED_URL} target="_blank" rel="noreferrer" className="underline hover:text-white">
            Branded Content Policy
          </a>{" "}
          and{" "}
          <a href={MUSIC_URL} target="_blank" rel="noreferrer" className="underline hover:text-white">
            Music Usage Confirmation
          </a>
          .
        </>
      ) : (
        <>
          By posting, you agree to TikTok&apos;s{" "}
          <a href={MUSIC_URL} target="_blank" rel="noreferrer" className="underline hover:text-white">
            Music Usage Confirmation
          </a>
          .
        </>
      )}
    </p>
  );
}

export default function TikTokPanel({ draft, postType, disabled, onDraft, onSettings, creator }: PanelProps & { creator?: CreatorInfoState }) {
  const info = creator?.data;
  const isPhoto = postType === "photo";
  const privacy = draft.settings.privacyLevel as string | undefined;
  const disclose = setting(draft, "discloseCommercial", false);
  const brandOrganic = setting(draft, "brandOrganic", false);
  const brandedContent = setting(draft, "brandedContent", false);
  const options = info?.privacyLevelOptions ?? Object.keys(PRIVACY_LABELS);
  const media = isPhoto ? "photo" : "video";

  const labelNotice = brandedContent ? TIKTOK_LABEL_BRANDED : brandOrganic ? TIKTOK_LABEL_YOUR_BRAND : null;

  if (draft.publishMode === "ASSISTED") {
    return (
      <div className="space-y-3">
        <TrendingSoundField draft={draft} disabled={disabled} onDraft={onDraft} onSettings={onSettings} platform="TIKTOK" />
        <p className="text-[11px] text-bb-dim">Posting by hand: privacy, interactions and disclosure are set in the TikTok app.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2.5 rounded-lg border border-bb-border bg-bb-elevated px-3 py-2">
        {creator?.loading ? (
          <Loader2 size={16} className="animate-spin text-bb-dim" />
        ) : (
          <Avatar src={info?.avatarUrl} name={info?.nickname || info?.username || "TikTok"} size={28} />
        )}
        <div className="min-w-0">
          <p className="text-[11px] text-bb-dim">Posting to</p>
          <p className="text-sm text-white truncate">
            {info ? `${info.nickname || ""}${info.username ? ` @${info.username}` : ""}`.trim() : creator?.loading ? "Checking account" : "TikTok account"}
          </p>
        </div>
      </div>
      {creator?.error && (
        <p className="flex items-start gap-1.5 text-[11px] text-amber-300">
          <AlertTriangle size={12} className="mt-px shrink-0" /> {creator.error}
        </p>
      )}

      <div>
        <FieldLabel htmlFor={`tt-privacy-${draft.key}`} hint="Required">
          Who can view this {media}
        </FieldLabel>
        <select
          id={`tt-privacy-${draft.key}`}
          value={privacy || ""}
          disabled={disabled}
          onChange={(e) => onSettings({ privacyLevel: e.target.value || undefined })}
          className={cn(inputClass, !privacy && "text-bb-dim")}
        >
          <option value="" disabled>
            Choose who can view
          </option>
          {options.map((o) => (
            <option key={o} value={o} disabled={o === "SELF_ONLY" && brandedContent}>
              {PRIVACY_LABELS[o] || o}
              {o === "SELF_ONLY" && brandedContent ? " (not available)" : ""}
            </option>
          ))}
        </select>
        {brandedContent && <p className="text-[11px] text-bb-dim mt-1">{TIKTOK_BRANDED_PRIVATE_NOTICE}</p>}
      </div>

      <div className="rounded-lg border border-bb-border px-3 py-1.5">
        <p className="text-xs font-medium text-bb-muted pt-1">Allow users to</p>
        <Toggle
          label="Comment"
          checked={setting(draft, "allowComment", false) && !info?.commentDisabled}
          disabled={disabled || info?.commentDisabled}
          disabledReason={info?.commentDisabled ? "Comments are turned off in this account's TikTok settings." : undefined}
          onChange={(allowComment) => onSettings({ allowComment })}
        />
        {!isPhoto && (
          <>
            <Toggle
              label="Duet"
              checked={setting(draft, "allowDuet", false) && !info?.duetDisabled}
              disabled={disabled || info?.duetDisabled}
              disabledReason={info?.duetDisabled ? "Duets are turned off in this account's TikTok settings." : undefined}
              onChange={(allowDuet) => onSettings({ allowDuet })}
            />
            <Toggle
              label="Stitch"
              checked={setting(draft, "allowStitch", false) && !info?.stitchDisabled}
              disabled={disabled || info?.stitchDisabled}
              disabledReason={info?.stitchDisabled ? "Stitch is turned off in this account's TikTok settings." : undefined}
              onChange={(allowStitch) => onSettings({ allowStitch })}
            />
          </>
        )}
      </div>

      <div className="rounded-lg border border-bb-border px-3 py-1.5">
        <Toggle
          label="Disclose commercial content"
          description="Let others know this post promotes a brand, product or service."
          checked={disclose}
          disabled={disabled}
          onChange={(v) => onSettings(v ? { discloseCommercial: true } : { discloseCommercial: false, brandOrganic: false, brandedContent: false })}
        />
        {disclose && (
          <div className="pl-1 pb-1 space-y-1 border-t border-bb-border mt-1 pt-1">
            <Toggle
              label="Your brand"
              description="You are promoting yourself or your own business."
              checked={brandOrganic}
              disabled={disabled}
              onChange={(v) => onSettings({ brandOrganic: v })}
            />
            <Toggle
              label="Branded content"
              description="You are promoting another brand or a third party."
              checked={brandedContent}
              disabled={disabled}
              onChange={(v) => onSettings(v && privacy === "SELF_ONLY" ? { brandedContent: v, privacyLevel: undefined } : { brandedContent: v })}
            />
            {labelNotice ? (
              <p className="flex items-start gap-1.5 text-[11px] text-bb-muted">
                <Info size={12} className="mt-px shrink-0 text-bb-orange" /> {labelNotice}
              </p>
            ) : (
              <p className="text-[11px] text-amber-300">Pick at least one to disclose.</p>
            )}
          </div>
        )}
      </div>

      <Toggle
        label="AI-generated content"
        description="Label this post as made with AI."
        checked={setting(draft, "isAigc", false)}
        disabled={disabled}
        onChange={(isAigc) => onSettings({ isAigc })}
      />

      {isPhoto ? (
        <Toggle
          label="Add recommended music"
          checked={setting(draft, "autoAddMusic", false)}
          disabled={disabled}
          onChange={(autoAddMusic) => onSettings({ autoAddMusic })}
        />
      ) : (
        <div>
          <FieldLabel htmlFor={`tt-cover-${draft.key}`} hint="Seconds into the video">
            Cover frame
          </FieldLabel>
          <input
            id={`tt-cover-${draft.key}`}
            type="number"
            min={0}
            step={0.5}
            value={draft.settings.videoCoverTimestampMs !== undefined ? Number(draft.settings.videoCoverTimestampMs) / 1000 : ""}
            disabled={disabled}
            onChange={(e) =>
              onSettings({ videoCoverTimestampMs: e.target.value === "" ? undefined : Math.round(Number(e.target.value) * 1000) })
            }
            placeholder="0"
            className={cn(inputClass, "max-w-[140px]")}
          />
        </div>
      )}

      <TrendingSoundField draft={draft} disabled={disabled} onDraft={onDraft} onSettings={onSettings} platform="TIKTOK" />

      {info?.maxVideoPostDurationSec && !isPhoto && (
        <p className="text-[11px] text-bb-dim">This account can post videos up to {Math.floor(info.maxVideoPostDurationSec / 60)} min {info.maxVideoPostDurationSec % 60 ? `${info.maxVideoPostDurationSec % 60}s` : ""}.</p>
      )}
      <p className="text-[11px] text-bb-dim">{TIKTOK_PROCESSING_NOTICE}</p>
    </div>
  );
}
