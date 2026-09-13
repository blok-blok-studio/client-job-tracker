"use client";

import PlatformIcon, { getPlatformLabel } from "@/components/content/PlatformIcon";
import { cn } from "@/lib/utils";
import { displayStatus, STATUS_META, type PlannerPost } from "./planner-utils";

/**
 * One chip per post in a group: platform icon (or account avatar) with a
 * status dot, so a mixed group shows which account failed at a glance.
 */
export default function AccountStack({
  posts,
  size = "sm",
  max = 5,
}: {
  posts: PlannerPost[];
  size?: "xs" | "sm";
  max?: number;
}) {
  const dim = size === "xs" ? "w-4 h-4" : "w-6 h-6";
  const icon = size === "xs" ? 10 : 13;
  const shown = posts.slice(0, max);
  return (
    <div className="flex items-center -space-x-1">
      {shown.map((post) => {
        const status = displayStatus(post);
        const avatar = post.credential?.meta?.avatarUrl;
        const account = post.credential?.label;
        return (
          <span
            key={post.id}
            title={`${getPlatformLabel(post.platform)}${account ? ` · ${account}` : ""} · ${STATUS_META[status].label}`}
            className={cn("relative rounded-full bg-bb-elevated ring-2 ring-bb-surface flex items-center justify-center shrink-0", dim)}
          >
            {avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatar} alt="" className="w-full h-full rounded-full object-cover" />
            ) : (
              <PlatformIcon platform={post.platform} size={icon} />
            )}
            {avatar && (
              <span className="absolute -bottom-0.5 -left-0.5 rounded-full bg-bb-surface p-[1px] leading-none">
                <PlatformIcon platform={post.platform} size={size === "xs" ? 7 : 9} />
              </span>
            )}
            <span
              aria-hidden
              className={cn(
                "absolute -top-0.5 -right-0.5 rounded-full ring-1 ring-bb-surface",
                size === "xs" ? "w-1.5 h-1.5" : "w-2 h-2",
                STATUS_META[status].dot
              )}
            />
          </span>
        );
      })}
      {posts.length > max && (
        <span className={cn("rounded-full bg-bb-elevated ring-2 ring-bb-surface text-[9px] text-bb-muted flex items-center justify-center", dim)}>
          +{posts.length - max}
        </span>
      )}
    </div>
  );
}
