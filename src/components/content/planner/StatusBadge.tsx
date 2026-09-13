"use client";

import { cn } from "@/lib/utils";
import { displayStatus, phaseLabel, STATUS_META, type PlannerPost, type StatusKey } from "./planner-utils";

export function StatusDot({ status, className }: { status: StatusKey; className?: string }) {
  return <span aria-hidden className={cn("inline-block w-1.5 h-1.5 rounded-full shrink-0", STATUS_META[status].dot, className)} />;
}

export default function StatusBadge({ post, className }: { post: PlannerPost; className?: string }) {
  const status = displayStatus(post);
  const label =
    status === "AWAITING_APPROVAL" && post.approvalStatus === "CHANGES_REQUESTED" ? "Changes requested" : phaseLabel(post);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border text-[11px] font-medium whitespace-nowrap",
        STATUS_META[status].badge,
        className
      )}
    >
      <StatusDot status={status} />
      {label}
    </span>
  );
}
