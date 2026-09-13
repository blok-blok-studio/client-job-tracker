"use client";

import { useState } from "react";
import { CheckCircle2, ChevronDown, ExternalLink, Eye, Hand, Loader2, Lock, RotateCcw, Settings2, Sparkles } from "lucide-react";
import { getSpec, type SpecIssue } from "@/lib/social/specs";
import { cn } from "@/lib/utils";
import { AccountIcon } from "./AccountPicker";
import ComposerPreview from "./ComposerPreview";
import IssueList from "./IssueList";
import { Avatar, Card, ChipInput, CharCounter, FieldLabel, SegmentedControl, inputClass } from "./ui";
import { effectiveContent } from "./validation";
import { isLocked, platformName, type AccountDraft, type ComposerAccount, type MediaMeta, type SharedContent, type TeamMember } from "./types";
import YouTubePanel from "./panels/YouTubePanel";
import InstagramPanel from "./panels/InstagramPanel";
import TikTokPanel, { type CreatorInfoState } from "./panels/TikTokPanel";
import RedNotePanel from "./panels/RedNotePanel";
import MediaFormatSection from "./MediaFormatSection";

const STATUS_STYLES: Record<string, string> = {
  DRAFT: "text-bb-muted border-bb-border",
  SCHEDULED: "text-sky-300 border-sky-500/30 bg-sky-500/10",
  PUBLISHING: "text-amber-200 border-amber-500/30 bg-amber-500/10",
  PUBLISHED: "text-emerald-300 border-emerald-500/30 bg-emerald-500/10",
  FAILED: "text-red-300 border-red-500/30 bg-red-500/10",
  ACTION_NEEDED: "text-amber-200 border-amber-500/30 bg-amber-500/10",
};

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Draft",
  SCHEDULED: "Scheduled",
  PUBLISHING: "Publishing",
  PUBLISHED: "Published",
  FAILED: "Failed",
  ACTION_NEEDED: "Ready to post by hand",
};

interface Props {
  account: ComposerAccount;
  draft: AccountDraft;
  shared: SharedContent;
  meta: Record<string, MediaMeta>;
  team: TeamMember[];
  issues: SpecIssue[];
  postType: string | null;
  creator?: CreatorInfoState;
  disabled?: boolean;
  onDraft: (patch: Partial<AccountDraft>) => void;
  onSettings: (patch: Record<string, unknown>) => void;
  onApplyFormatToAll: (format: unknown) => void;
}

export default function AccountTab({ account, draft, shared, meta, team, issues, postType, creator, disabled: disabledProp, onDraft, onSettings, onApplyFormatToAll }: Props) {
  const [showPreview, setShowPreview] = useState(true);
  const spec = getSpec(draft.platform);
  const locked = isLocked(draft);
  const disabled = disabledProp || locked;
  const content = effectiveContent(draft, shared);
  const manualOnly = !!account.manualOnly || draft.platform === "REDNOTE" || !!spec?.assistedOnly;
  const limits = spec?.limits ?? {};

  const panelProps = { draft, postType, mediaUrls: content.mediaUrls, meta, disabled, onDraft, onSettings };

  const panel = (() => {
    switch (draft.platform) {
      case "YOUTUBE":
        return <YouTubePanel {...panelProps} />;
      case "INSTAGRAM":
        return <InstagramPanel {...panelProps} />;
      case "TIKTOK":
        return <TikTokPanel {...panelProps} creator={creator} />;
      case "REDNOTE":
        return <RedNotePanel {...panelProps} title={content.title} body={content.body} />;
      default:
        return null;
    }
  })();

  return (
    <div className="space-y-3">
      {/* Account header */}
      <div className="flex items-center gap-3">
        <div className="relative">
          <Avatar src={account.avatarUrl} name={account.label} size={40} />
          <span className="absolute -bottom-1 -right-1 rounded-full bg-bb-surface p-0.5 border border-bb-border">
            <AccountIcon platform={draft.platform} size={12} />
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-white truncate">{account.manualOnly ? "RedNote" : account.label}</p>
          <p className="text-[11px] text-bb-dim">{platformName(draft.platform)}</p>
        </div>
        {draft.status && (
          <span className={cn("text-[11px] rounded-full border px-2 py-0.5 shrink-0", STATUS_STYLES[draft.status] || STATUS_STYLES.DRAFT)}>
            {STATUS_LABELS[draft.status] || draft.status}
          </span>
        )}
      </div>

      {locked && (
        <div className="flex items-start gap-2 rounded-lg border border-bb-border bg-bb-elevated px-3 py-2.5">
          {draft.status === "PUBLISHING" ? <Loader2 size={14} className="animate-spin text-amber-300 mt-0.5 shrink-0" /> : <Lock size={14} className="text-bb-dim mt-0.5 shrink-0" />}
          <div className="text-xs text-bb-muted space-y-1">
            <p>
              {draft.status === "PUBLISHING"
                ? `Publishing now${draft.publishPhase ? ` (${draft.publishPhase})` : ""}. It can't be edited until it finishes.`
                : "Already published. Changes here won't reach the platform; duplicate the post to publish again."}
            </p>
            {draft.externalUrl && (
              <a href={draft.externalUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-bb-orange hover:text-bb-orange-light">
                View on {platformName(draft.platform)} <ExternalLink size={11} />
              </a>
            )}
          </div>
        </div>
      )}

      {draft.status === "FAILED" && draft.publishError && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2 text-xs text-red-200">
          <p className="font-medium mb-0.5">Last attempt failed</p>
          <p className="text-red-300/90 break-words">{draft.publishError}</p>
          <p className="text-bb-dim mt-1">Fix the issue and schedule again.</p>
        </div>
      )}

      {draft.status === "ACTION_NEEDED" && draft.postId && (
        <a
          href={`/content/handoff/${draft.postId}`}
          className="flex items-center justify-between gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-100 hover:bg-amber-500/10 transition-colors"
        >
          <span className="flex items-center gap-1.5">
            <Hand size={13} /> This post is waiting to be posted by hand.
          </span>
          <span className="inline-flex items-center gap-1 text-bb-orange">
            Open handoff <ExternalLink size={11} />
          </span>
        </a>
      )}

      <IssueList issues={issues} />

      {/* How it gets posted */}
      <Card title="Publishing" icon={<Settings2 size={13} />}>
        {manualOnly ? (
          <p className="flex items-center gap-1.5 text-xs text-bb-muted">
            <Hand size={13} className="text-bb-orange" /> Posted by hand from a phone at the scheduled time.
          </p>
        ) : (
          <SegmentedControl
            value={draft.publishMode}
            disabled={disabled}
            onChange={(publishMode) => onDraft({ publishMode })}
            options={[
              { value: "AUTO", label: "Publish automatically" },
              { value: "ASSISTED", label: "Post manually" },
            ]}
          />
        )}
        {draft.publishMode === "ASSISTED" && !manualOnly && (
          <p className="text-[11px] text-bb-dim">
            For things the API can&apos;t do, like stickers, trending sounds or tagging products. The assignee gets a reminder with everything ready to copy.
          </p>
        )}
        {draft.publishMode === "ASSISTED" && (
          <div>
            <FieldLabel htmlFor={`assignee-${draft.key}`} hint={draft.platform === "REDNOTE" ? "Required" : undefined}>
              Who posts it
            </FieldLabel>
            <select
              id={`assignee-${draft.key}`}
              value={draft.assignedToId || ""}
              disabled={disabled}
              onChange={(e) => onDraft({ assignedToId: e.target.value || null })}
              className={inputClass}
            >
              <option value="">{draft.platform === "REDNOTE" ? "Choose a teammate" : "Owners (nobody assigned)"}</option>
              {team.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {spec && spec.postTypes.length > 0 && (
          <div>
            <FieldLabel
              hint={
                draft.postType ? (
                  !disabled && (
                    <button
                      type="button"
                      onClick={() => onDraft({ postType: null })}
                      className="inline-flex items-center gap-1 text-bb-dim hover:text-white cursor-pointer transition-colors"
                    >
                      <RotateCcw size={10} /> Pick from media
                    </button>
                  )
                ) : (
                  <span className="inline-flex items-center gap-1">
                    <Sparkles size={10} className="text-bb-orange" /> Picked from your media
                  </span>
                )
              }
            >
              Post type
            </FieldLabel>
            <SegmentedControl
              value={postType}
              disabled={disabled}
              onChange={(v) => onDraft({ postType: v })}
              options={spec.postTypes.map((t) => ({ value: t.key, label: t.label }))}
            />
          </div>
        )}
      </Card>

      <MediaFormatSection
        draft={draft}
        postType={postType}
        mediaUrls={content.mediaUrls}
        meta={meta}
        disabled={disabled}
        onSettings={onSettings}
        onApplyToAll={onApplyFormatToAll}
      />

      {panel && (
        <Card title={`${platformName(draft.platform)} settings`} icon={<AccountIcon platform={draft.platform} size={12} />}>
          {panel}
        </Card>
      )}

      {/* Overrides */}
      <Card title="Customize for this account" icon={<ChevronDown size={13} />}>
        <label className="flex items-center gap-2 text-sm text-white cursor-pointer">
          <input
            type="checkbox"
            checked={draft.overrideCaption}
            disabled={disabled}
            onChange={(e) =>
              onDraft(
                e.target.checked
                  ? { overrideCaption: true, title: shared.title, body: shared.body, hashtags: [...shared.hashtags] }
                  : { overrideCaption: false }
              )
            }
            className="accent-bb-orange w-4 h-4"
          />
          Different caption
        </label>
        {draft.overrideCaption && (
          <div className="space-y-2 pl-6">
            {(limits.title || draft.platform === "YOUTUBE" || draft.platform === "REDNOTE") && (
              <div>
                <FieldLabel hint={<CharCounter value={draft.title.length} max={limits.title} />}>Title</FieldLabel>
                <input value={draft.title} disabled={disabled} onChange={(e) => onDraft({ title: e.target.value })} className={inputClass} />
              </div>
            )}
            <div>
              <FieldLabel hint={<CharCounter value={draft.body.length} max={limits.body} />}>Caption</FieldLabel>
              <textarea value={draft.body} disabled={disabled} rows={4} onChange={(e) => onDraft({ body: e.target.value })} className={cn(inputClass, "resize-y")} />
            </div>
            <div>
              <FieldLabel>Hashtags</FieldLabel>
              <ChipInput values={draft.hashtags} onChange={(hashtags) => onDraft({ hashtags })} placeholder="Add tag" prefix="#" disabled={disabled} />
            </div>
          </div>
        )}

        {shared.mediaUrls.length > 1 && (
          <>
            <label className="flex items-center gap-2 text-sm text-white cursor-pointer">
              <input
                type="checkbox"
                checked={draft.overrideMedia}
                disabled={disabled}
                onChange={(e) => onDraft(e.target.checked ? { overrideMedia: true, mediaUrls: [...shared.mediaUrls] } : { overrideMedia: false })}
                className="accent-bb-orange w-4 h-4"
              />
              Use only some of the media
            </label>
            {draft.overrideMedia && (
              <div className="grid grid-cols-4 sm:grid-cols-6 gap-1.5 pl-6">
                {shared.mediaUrls.map((url, i) => {
                  const on = draft.mediaUrls.includes(url);
                  const m = meta[url];
                  const thumb = m?.kind === "video" ? m.thumbnailUrl : m?.thumbnailUrl || url;
                  return (
                    <button
                      key={url}
                      type="button"
                      disabled={disabled}
                      onClick={() => onDraft({ mediaUrls: on ? draft.mediaUrls.filter((u) => u !== url) : [...draft.mediaUrls, url] })}
                      className={cn(
                        "relative aspect-square rounded-md overflow-hidden border-2 cursor-pointer transition-all",
                        on ? "border-bb-orange" : "border-bb-border opacity-40 hover:opacity-70"
                      )}
                      aria-pressed={on}
                      aria-label={`Media ${i + 1}`}
                    >
                      {thumb ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={thumb} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <span className="w-full h-full flex items-center justify-center bg-bb-elevated text-[10px] text-bb-dim">Video</span>
                      )}
                      {on && <CheckCircle2 size={12} className="absolute top-0.5 right-0.5 text-bb-orange bg-black/60 rounded-full" />}
                    </button>
                  );
                })}
              </div>
            )}
          </>
        )}
      </Card>

      <Card
        title="Preview"
        icon={<Eye size={13} />}
        action={
          <button type="button" onClick={() => setShowPreview((v) => !v)} className="text-[11px] text-bb-dim hover:text-white cursor-pointer transition-colors">
            {showPreview ? "Hide" : "Show"}
          </button>
        }
      >
        {showPreview && (
          <ComposerPreview
            platform={draft.platform}
            title={content.title}
            body={content.body}
            hashtags={content.hashtags}
            mediaUrls={content.mediaUrls}
            meta={meta}
            accountName={account.manualOnly ? "RedNote" : account.displayName || account.label}
          />
        )}
      </Card>
    </div>
  );
}
