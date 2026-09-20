"use client";

import { cn } from "@/lib/utils";
import { groupKinds, KIND_LEGEND, KIND_META, postKind, type PlannerPost, type PostGroup } from "./planner-utils";

const tagClass = "inline-flex items-center rounded border px-1 text-[9px] font-medium leading-[14px] whitespace-nowrap shrink-0";

/** Post type label for one account's post. */
export function PostKindTag({ post, className }: { post: PlannerPost; className?: string }) {
  const meta = KIND_META[postKind(post)];
  return <span className={cn(tagClass, meta.tag, className)}>{meta.label}</span>;
}

/** Post type labels for a whole card. `max` keeps tight spots to one label plus a count. */
export function GroupKindTags({ group, max, className }: { group: PostGroup; max?: number; className?: string }) {
  const kinds = groupKinds(group);
  const shown = max ? kinds.slice(0, max) : kinds;
  const title = kinds.map((k) => KIND_META[k].label).join(", ");
  return (
    <span className={cn("inline-flex items-center gap-0.5 shrink-0", className)} title={title}>
      {shown.map((k) => (
        <span key={k} className={cn(tagClass, KIND_META[k].tag)}>
          {KIND_META[k].label}
        </span>
      ))}
      {kinds.length > shown.length && <span className="text-[9px] text-bb-dim">+{kinds.length - shown.length}</span>}
    </span>
  );
}

/** Colour key shown under the calendar. */
export function KindLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-bb-dim">
      {KIND_LEGEND.map((k) => (
        <span key={k} className="inline-flex items-center gap-1">
          <span className={cn("w-1.5 h-1.5 rounded-full", KIND_META[k].dot)} aria-hidden />
          {k === "reel" ? "Reel / Short / Video" : KIND_META[k].label}
        </span>
      ))}
    </div>
  );
}
