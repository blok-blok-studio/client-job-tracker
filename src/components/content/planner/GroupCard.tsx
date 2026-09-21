"use client";

import Link from "next/link";
import { useDraggable } from "@dnd-kit/core";
import { format } from "date-fns";
import { AlertTriangle, ExternalLink, Film, MessageSquareWarning, RotateCcw, Smartphone, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { optimizedThumb } from "@/lib/media-thumb";
import { getPlatformLabel } from "@/components/content/PlatformIcon";
import AccountStack from "./AccountStack";
import { GroupKindTags, PostKindTag } from "./KindTag";
import StatusBadge, { StatusDot } from "./StatusBadge";
import {
  displayStatus,
  isReschedulable,
  isVideo,
  postSnippet,
  postThumb,
  publishProgress,
  STATUS_META,
  type PlannerPost,
  type PostGroup,
} from "./planner-utils";

const ACCENT_BORDER: Record<string, string> = {
  DRAFT: "border-l-bb-dim",
  SCHEDULED: "border-l-blue-400",
  PUBLISHING: "border-l-yellow-400",
  ACTION_NEEDED: "border-l-bb-orange",
  PUBLISHED: "border-l-emerald-400",
  FAILED: "border-l-red-500",
  AWAITING_APPROVAL: "border-l-purple-400",
};

/** Worst status in the group decides the card's accent. */
function groupAccent(group: PostGroup) {
  const order = ["FAILED", "ACTION_NEEDED", "AWAITING_APPROVAL", "PUBLISHING", "SCHEDULED", "DRAFT", "PUBLISHED"] as const;
  const statuses = group.posts.map(displayStatus);
  return order.find((s) => statuses.includes(s)) || "DRAFT";
}

function Thumb({ post, className }: { post: PlannerPost; className?: string }) {
  const still = postThumb(post);
  const hasVideo = post.mediaUrls.some(isVideo);
  if (!still && !hasVideo) return null;
  return (
    <div className={cn("relative rounded-md overflow-hidden bg-bb-elevated border border-bb-border shrink-0", className)}>
      {still ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={optimizedThumb(still, 256)} alt="" className="w-full h-full object-cover" loading="lazy" />
      ) : (
        <div className="w-full h-full flex items-center justify-center">
          <Film size={14} className="text-bb-dim" />
        </div>
      )}
      {still && hasVideo && (
        <span className="absolute bottom-0.5 right-0.5 bg-black/70 rounded p-0.5">
          <Film size={8} className="text-white" />
        </span>
      )}
    </div>
  );
}

function useGroupDrag(group: PostGroup, enabled: boolean) {
  const movable = enabled && group.posts.some(isReschedulable) && group.posts.every((p) => p.status !== "PUBLISHING");
  const drag = useDraggable({ id: group.key, data: { group }, disabled: !movable });
  return { ...drag, movable };
}

/** Compact chip for month cells. */
export function MonthChip({
  group,
  onOpen,
  draggable = true,
}: {
  group: PostGroup;
  onOpen: (post: PlannerPost) => void;
  draggable?: boolean;
}) {
  const { attributes, listeners, setNodeRef, isDragging, movable } = useGroupDrag(group, draggable);
  const accent = groupAccent(group);
  return (
    <button
      ref={setNodeRef}
      type="button"
      {...attributes}
      {...listeners}
      onClick={(e) => {
        e.stopPropagation();
        onOpen(group.lead);
      }}
      className={cn(
        "w-full flex items-center gap-1 overflow-hidden rounded px-1 py-0.5 text-left bg-bb-elevated/80 hover:bg-bb-elevated border border-transparent hover:border-bb-border transition-colors cursor-pointer focus-visible:outline focus-visible:outline-1 focus-visible:outline-bb-orange",
        movable && "touch-none",
        isDragging && "opacity-40"
      )}
      title={`${group.clientName}: ${postSnippet(group.lead, 120)}`}
    >
      <StatusDot status={accent} />
      <span className="hidden sm:inline text-[10px] text-bb-dim tabular-nums shrink-0">
        {group.date ? format(group.date, "h:mma").toLowerCase() : ""}
      </span>
      <GroupKindTags group={group} max={1} />
      <span className="hidden md:block min-w-0 flex-1 truncate text-[11px] text-bb-muted">{postSnippet(group.lead, 40)}</span>
      <span className="hidden lg:flex shrink-0">
        <AccountStack posts={group.posts} size="xs" max={3} />
      </span>
    </button>
  );
}

/** Block for the week time grid. */
export function WeekBlock({ group, onOpen }: { group: PostGroup; onOpen: (post: PlannerPost) => void }) {
  const { attributes, listeners, setNodeRef, isDragging, movable } = useGroupDrag(group, true);
  const accent = groupAccent(group);
  return (
    <button
      ref={setNodeRef}
      type="button"
      {...attributes}
      {...listeners}
      onClick={(e) => {
        e.stopPropagation();
        onOpen(group.lead);
      }}
      className={cn(
        "w-full h-full text-left rounded-md bg-bb-elevated border border-bb-border border-l-2 hover:bg-[#252525] px-1.5 py-1 transition-colors cursor-pointer overflow-hidden focus-visible:outline focus-visible:outline-1 focus-visible:outline-bb-orange",
        ACCENT_BORDER[accent],
        movable && "touch-none",
        isDragging && "opacity-40"
      )}
      title={`${group.clientName}: ${postSnippet(group.lead, 120)}`}
    >
      <span className={cn("flex items-center gap-1 text-[10px] font-medium", STATUS_META[accent].text)}>
        <span className="shrink-0">{group.date ? format(group.date, "h:mm a") : ""}</span>
        <GroupKindTags group={group} max={1} />
      </span>
      <span className="block text-[11px] text-white truncate leading-tight">{postSnippet(group.lead, 50)}</span>
      <span className="mt-0.5 flex items-center justify-between gap-1">
        <span className="text-[10px] text-bb-dim truncate">{group.clientName}</span>
        <AccountStack posts={group.posts} size="xs" max={3} />
      </span>
    </button>
  );
}

/** Full card with per-account status and actions (day panel, attention strip). */
export function GroupCard({
  group,
  onOpen,
  onRetry,
  onDelete,
  compact = false,
}: {
  group: PostGroup;
  onOpen: (post: PlannerPost) => void;
  onRetry: (post: PlannerPost) => void;
  onDelete?: (post: PlannerPost) => void;
  compact?: boolean;
}) {
  const lead = group.lead;
  return (
    <div className="bg-bb-elevated/60 border border-bb-border rounded-lg p-3 hover:border-bb-orange/30 transition-colors">
      <button type="button" onClick={() => onOpen(lead)} className="w-full text-left flex gap-3 cursor-pointer">
        <Thumb post={lead} className="w-12 h-12" />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm text-white leading-snug line-clamp-2">{postSnippet(lead, 90)}</p>
            <AccountStack posts={group.posts} />
          </div>
          <p className="mt-1 text-xs text-bb-dim truncate">
            {group.clientName}
            {group.date && <> · {format(group.date, "EEE MMM d, h:mm a")}</>}
          </p>
          <GroupKindTags group={group} className="mt-1 flex-wrap" />
        </div>
      </button>
      {!compact && (
        <div className="mt-2 space-y-1.5">
          {group.posts.map((post) => (
            <PostStatusRow key={post.id} post={post} onRetry={onRetry} onDelete={onDelete} showWhenFine={group.posts.length > 1} />
          ))}
        </div>
      )}
    </div>
  );
}

/** One account's status line with the action it needs, if any. */
export function PostStatusRow({
  post,
  onRetry,
  onDelete,
  showWhenFine = true,
}: {
  post: PlannerPost;
  onRetry: (post: PlannerPost) => void;
  onDelete?: (post: PlannerPost) => void;
  showWhenFine?: boolean;
}) {
  const status = displayStatus(post);
  const progress = publishProgress(post);
  const needsAttention =
    status === "FAILED" || status === "ACTION_NEEDED" || post.approvalStatus === "CHANGES_REQUESTED" || status === "PUBLISHING";
  if (!needsAttention && !showWhenFine) {
    return (
      <div className="flex items-center gap-2">
        <StatusBadge post={post} />
        {post.status === "PUBLISHED" && post.externalUrl && <ViewLink href={post.externalUrl} />}
      </div>
    );
  }

  return (
    <div className="rounded-md bg-bb-surface/60 border border-bb-border/60 px-2 py-1.5">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="flex items-center gap-1.5 min-w-0">
          <span className="text-xs text-bb-muted truncate">
            {getPlatformLabel(post.platform)}
            {post.credential?.label ? ` · ${post.credential.label}` : ""}
          </span>
          <PostKindTag post={post} />
        </span>
        <div className="flex items-center gap-1.5">
          <StatusBadge post={post} />
          {post.status === "FAILED" && (
            <button
              type="button"
              onClick={() => onRetry(post)}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] text-white bg-bb-orange hover:bg-bb-orange-light transition-colors cursor-pointer"
            >
              <RotateCcw size={11} /> Retry
            </button>
          )}
          {post.status === "FAILED" && onDelete && (
            <button
              type="button"
              onClick={() => onDelete(post)}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] text-red-300 border border-red-500/30 hover:bg-red-500/10 transition-colors cursor-pointer"
            >
              <Trash2 size={11} /> Delete
            </button>
          )}
          {post.status === "ACTION_NEEDED" && (
            <Link
              href={`/content/handoff/${post.id}`}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] text-white bg-bb-orange hover:bg-bb-orange-light transition-colors"
            >
              <Smartphone size={11} /> Post it
            </Link>
          )}
          {post.status === "PUBLISHED" && post.externalUrl && <ViewLink href={post.externalUrl} />}
        </div>
      </div>
      {post.status === "PUBLISHING" && progress !== null && (
        <div className="mt-1.5 h-1 rounded-full bg-bb-border overflow-hidden" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full bg-yellow-400 transition-[width] duration-500" style={{ width: `${progress}%` }} />
        </div>
      )}
      {post.status === "FAILED" && post.publishError && (
        <p className="mt-1 flex gap-1.5 text-[11px] text-red-300/90 leading-snug">
          <AlertTriangle size={11} className="shrink-0 mt-0.5" />
          <span className="line-clamp-3">{post.publishError}</span>
        </p>
      )}
      {post.approvalStatus === "CHANGES_REQUESTED" && (
        <p className="mt-1 flex gap-1.5 text-[11px] text-purple-300 leading-snug">
          <MessageSquareWarning size={11} className="shrink-0 mt-0.5" />
          <span className="line-clamp-3">{post.approvalNote ? `Client: ${post.approvalNote}` : "The client asked for changes."}</span>
        </p>
      )}
    </div>
  );
}

function ViewLink({ href }: { href: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-[11px] text-bb-muted hover:text-white transition-colors"
    >
      View <ExternalLink size={10} />
    </a>
  );
}
