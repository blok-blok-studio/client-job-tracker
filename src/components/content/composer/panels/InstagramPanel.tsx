"use client";

import PeopleInput from "../PeopleInput";
import { FieldLabel, SegmentedControl, Toggle, inputClass, CharCounter } from "../ui";
import { ImageChoice, imagesOf, setting, type PanelProps } from "./shared";
import { getSpec } from "@/lib/social/specs";
import { cn } from "@/lib/utils";

export default function InstagramPanel({ draft, postType, mediaUrls, meta, disabled, onDraft, onSettings }: PanelProps) {
  const isReel = postType === "reel" || postType === "trial_reel";
  const isStory = postType === "story";
  const commentLimit = getSpec("INSTAGRAM")?.limits.firstComment ?? 2200;
  const hasImages = imagesOf(mediaUrls, meta).length > 0;

  return (
    <div className="space-y-3">
      {isStory && (
        <p className="rounded-lg border border-bb-border bg-bb-elevated px-3 py-2 text-[11px] text-bb-muted">
          Stories post without stickers, links or mentions. For those, switch this account to Post manually.
        </p>
      )}

      {postType === "reel" && (
        <Toggle
          label="Also show in the profile grid"
          checked={setting(draft, "shareToFeed", true)}
          disabled={disabled}
          onChange={(shareToFeed) => onSettings({ shareToFeed })}
        />
      )}

      {postType === "trial_reel" && (
        <div>
          <FieldLabel>After the trial</FieldLabel>
          <SegmentedControl
            value={setting(draft, "trialGraduation", "MANUAL")}
            disabled={disabled}
            onChange={(trialGraduation) => onSettings({ trialGraduation })}
            options={[
              { value: "MANUAL", label: "I'll decide" },
              { value: "SS_PERFORMANCE", label: "Share if it does well" },
            ]}
          />
          <p className="text-[11px] text-bb-dim mt-1">Trial reels are shown to non-followers first.</p>
        </div>
      )}

      {isReel && (
        <>
          <ImageChoice
            label="Cover image"
            hint="Optional. Leave empty to use a frame from the video."
            value={draft.coverImageUrl}
            candidates={imagesOf(mediaUrls, meta)}
            disabled={disabled}
            onChange={(coverImageUrl) => onDraft({ coverImageUrl })}
          />
          {!draft.coverImageUrl && (
            <div>
              <FieldLabel htmlFor={`ig-thumb-${draft.key}`} hint="Seconds into the video">
                Cover frame
              </FieldLabel>
              <input
                id={`ig-thumb-${draft.key}`}
                type="number"
                min={0}
                step={0.5}
                value={draft.settings.thumbOffsetMs !== undefined ? Number(draft.settings.thumbOffsetMs) / 1000 : ""}
                disabled={disabled}
                onChange={(e) => onSettings({ thumbOffsetMs: e.target.value === "" ? undefined : Math.round(Number(e.target.value) * 1000) })}
                placeholder="0"
                className={cn(inputClass, "max-w-[140px]")}
              />
            </div>
          )}
          <div>
            <FieldLabel htmlFor={`ig-audio-${draft.key}`} hint="Optional">
              Audio name
            </FieldLabel>
            <input
              id={`ig-audio-${draft.key}`}
              value={setting(draft, "audioName", "")}
              disabled={disabled}
              onChange={(e) => onSettings({ audioName: e.target.value || undefined })}
              placeholder="Original audio"
              className={inputClass}
            />
          </div>
        </>
      )}

      {!isStory && (
        <>
          <div>
            <FieldLabel hint="Up to 3, they accept the invite">Collaborators</FieldLabel>
            <PeopleInput values={draft.collaborators} onChange={(collaborators) => onDraft({ collaborators })} max={3} disabled={disabled} />
          </div>

          <div>
            <FieldLabel htmlFor={`ig-fc-${draft.key}`} hint={<CharCounter value={draft.firstComment.length} max={commentLimit} />}>
              First comment
            </FieldLabel>
            <textarea
              id={`ig-fc-${draft.key}`}
              value={draft.firstComment}
              disabled={disabled}
              onChange={(e) => onDraft({ firstComment: e.target.value })}
              rows={2}
              placeholder="Posted right after publishing, good for extra hashtags"
              className={cn(inputClass, "resize-none")}
            />
          </div>

          {(hasImages || isReel) && (
            <div>
              <FieldLabel hint={isReel ? "On the reel" : "On photos"}>Tag people</FieldLabel>
              <PeopleInput values={draft.taggedUsers} onChange={(taggedUsers) => onDraft({ taggedUsers })} disabled={disabled} />
            </div>
          )}

          <div>
            <FieldLabel htmlFor={`ig-loc-${draft.key}`} hint="Optional Facebook place ID">
              Location ID
            </FieldLabel>
            <input
              id={`ig-loc-${draft.key}`}
              value={setting(draft, "locationId", "")}
              disabled={disabled}
              onChange={(e) => onSettings({ locationId: e.target.value.trim() || undefined })}
              placeholder="e.g. 110843418940484"
              className={inputClass}
            />
            {/[^\d\s]/.test(setting(draft, "locationId", "")) && (
              <p className="text-[11px] text-amber-400 mt-1">
                Instagram only takes the number ID of a place, not its name. This location will be left off the post.
              </p>
            )}
          </div>
        </>
      )}

      {hasImages && <p className="text-[11px] text-bb-dim">Alt text for each photo is set on the media tile (accessibility icon).</p>}
    </div>
  );
}
