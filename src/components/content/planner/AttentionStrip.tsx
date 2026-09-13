"use client";

import { useState } from "react";
import { AlertTriangle, ChevronDown, ChevronUp } from "lucide-react";
import { GroupCard } from "./GroupCard";
import type { PlannerPost, PostGroup } from "./planner-utils";

/** Groups with a failed post, a manual post waiting, or client changes requested. */
export function needsAttention(group: PostGroup) {
  return group.posts.some(
    (p) => p.status === "FAILED" || p.status === "ACTION_NEEDED" || p.approvalStatus === "CHANGES_REQUESTED"
  );
}

export default function AttentionStrip({
  groups,
  onOpen,
  onRetry,
}: {
  groups: PostGroup[];
  onOpen: (post: PlannerPost) => void;
  onRetry: (post: PlannerPost) => void;
}) {
  const [open, setOpen] = useState(true);
  const items = groups.filter(needsAttention);
  if (items.length === 0) return null;

  const failed = items.filter((g) => g.posts.some((p) => p.status === "FAILED")).length;
  const manual = items.filter((g) => g.posts.some((p) => p.status === "ACTION_NEEDED")).length;
  const changes = items.filter((g) => g.posts.some((p) => p.approvalStatus === "CHANGES_REQUESTED")).length;
  const parts = [
    failed && `${failed} failed`,
    manual && `${manual} to post by hand`,
    changes && `${changes} with client changes`,
  ].filter(Boolean);

  return (
    <section className="bg-bb-surface border border-bb-orange/25 rounded-xl">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-2 px-4 py-2.5 cursor-pointer"
      >
        <span className="flex items-center gap-2 text-sm text-white">
          <AlertTriangle size={15} className="text-bb-orange" />
          Needs attention
          <span className="text-xs text-bb-muted">{parts.join(" · ")}</span>
        </span>
        {open ? <ChevronUp size={15} className="text-bb-dim" /> : <ChevronDown size={15} className="text-bb-dim" />}
      </button>
      {open && (
        <div className="px-4 pb-4 grid gap-2 md:grid-cols-2 2xl:grid-cols-3">
          {items.slice(0, 9).map((g) => (
            <GroupCard key={g.key} group={g} onOpen={onOpen} onRetry={onRetry} />
          ))}
        </div>
      )}
    </section>
  );
}
