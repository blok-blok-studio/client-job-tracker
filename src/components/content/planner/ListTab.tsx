"use client";

import { useMemo, useState } from "react";
import { format } from "date-fns";
import { ArrowDown, ArrowUp, CalendarClock, CheckSquare, Square, Trash2, X } from "lucide-react";
import ConfirmDialog from "@/components/shared/ConfirmDialog";
import { cn } from "@/lib/utils";
import AccountStack from "./AccountStack";
import { PostStatusRow } from "./GroupCard";
import { GroupKindTags } from "./KindTag";
import {
  displayStatus,
  isReschedulable,
  postSnippet,
  type PlannerPost,
  type PostGroup,
} from "./planner-utils";

type SortKey = "date" | "client" | "status";

export default function ListTab({
  groups,
  onOpen,
  onRetry,
  onBulkReschedule,
  onBulkDelete,
}: {
  groups: PostGroup[];
  onOpen: (post: PlannerPost) => void;
  onRetry: (post: PlannerPost) => void;
  onBulkReschedule: (groups: PostGroup[], when: Date) => Promise<void>;
  onBulkDelete: (groups: PostGroup[]) => Promise<void>;
}) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "date", dir: 1 });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [moveTo, setMoveTo] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const sorted = useMemo(() => {
    const now = Date.now();
    const list = [...groups];
    list.sort((a, b) => {
      if (sort.key === "client") return a.clientName.localeCompare(b.clientName) * sort.dir;
      if (sort.key === "status") return displayStatus(a.lead).localeCompare(displayStatus(b.lead)) * sort.dir;
      // Date: undated drafts last; otherwise chronological
      if (!a.date && !b.date) return 0;
      if (!a.date) return 1;
      if (!b.date) return -1;
      return (a.date.getTime() - b.date.getTime()) * sort.dir;
    });
    // Upcoming first when sorting by date ascending
    if (sort.key === "date" && sort.dir === 1) {
      const upcoming = list.filter((g) => !g.date || g.date.getTime() >= now - 60 * 60 * 1000);
      const past = list.filter((g) => g.date && g.date.getTime() < now - 60 * 60 * 1000).reverse();
      return [...upcoming, ...past];
    }
    return list;
  }, [groups, sort]);

  const selectedGroups = sorted.filter((g) => selected.has(g.key));
  const canMove = selectedGroups.length > 0 && selectedGroups.every((g) => g.posts.every((p) => isReschedulable(p)));
  // Anything that hasn't gone out yet; published posts stay as records
  const deletableCount = selectedGroups.reduce((n, g) => n + g.posts.filter((p) => p.status !== "PUBLISHING" && p.status !== "PUBLISHED").length, 0);
  const canDelete = deletableCount > 0;
  const [confirmDelete, setConfirmDelete] = useState(false);

  const toggle = (key: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const SortButton = ({ k, label }: { k: SortKey; label: string }) => (
    <button
      type="button"
      onClick={() => setSort((s) => ({ key: k, dir: s.key === k ? ((s.dir * -1) as 1 | -1) : 1 }))}
      className={cn(
        "inline-flex items-center gap-1 text-xs font-medium uppercase tracking-wide transition-colors cursor-pointer",
        sort.key === k ? "text-white" : "text-bb-dim hover:text-bb-muted"
      )}
    >
      {label}
      {sort.key === k && (sort.dir === 1 ? <ArrowUp size={11} /> : <ArrowDown size={11} />)}
    </button>
  );

  if (groups.length === 0) {
    return (
      <div className="text-center py-16 bg-bb-surface border border-bb-border rounded-xl">
        <p className="text-sm text-white">No posts match these filters.</p>
        <p className="text-xs text-bb-dim mt-1">Clear a filter or create a new post.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Bulk bar */}
      {selected.size > 0 && (
        <div className="sticky top-2 z-20 flex flex-wrap items-center gap-2 bg-bb-elevated border border-bb-orange/30 rounded-lg px-3 py-2 shadow-modal">
          <span className="text-sm text-white">{selected.size} selected</span>
          <div className="flex items-center gap-1.5">
            <input
              type="datetime-local"
              value={moveTo}
              onChange={(e) => setMoveTo(e.target.value)}
              aria-label="New date and time"
              className="bg-bb-surface border border-bb-border rounded-md px-2 py-1 text-xs text-white [color-scheme:dark]"
            />
            <button
              type="button"
              disabled={!canMove || !moveTo || busy}
              title={canMove ? "" : "Only drafts, scheduled, and failed posts can be moved"}
              onClick={async () => {
                setBusy(true);
                await onBulkReschedule(selectedGroups, new Date(moveTo));
                setBusy(false);
                setSelected(new Set());
              }}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs text-white bg-bb-orange hover:bg-bb-orange-light disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
            >
              <CalendarClock size={12} /> Move
            </button>
          </div>
          <button
            type="button"
            disabled={!canDelete || busy}
            title={canDelete ? "" : "Published posts can't be deleted here"}
            onClick={() => setConfirmDelete(true)}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs text-red-300 border border-red-500/30 hover:bg-red-500/10 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
          >
            <Trash2 size={12} /> Delete
          </button>
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            className="ml-auto p-1 text-bb-dim hover:text-white cursor-pointer"
            aria-label="Clear selection"
          >
            <X size={14} />
          </button>
        </div>
      )}

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => !busy && setConfirmDelete(false)}
        onConfirm={async () => {
          setBusy(true);
          await onBulkDelete(selectedGroups);
          setBusy(false);
          setConfirmDelete(false);
          setSelected(new Set());
        }}
        loading={busy}
        title={`Delete ${deletableCount} post${deletableCount === 1 ? "" : "s"}?`}
        message="Drafts, scheduled and failed posts are deleted, and scheduled ones won't go out. Published posts stay. This can't be undone."
        confirmLabel="Delete"
      />

      <div className="hidden md:flex items-center gap-6 px-3">
        <span className="w-5" />
        <span className="flex-1">
          <SortButton k="date" label="When" />
        </span>
        <span className="w-40">
          <SortButton k="client" label="Client" />
        </span>
        <span className="w-72">
          <SortButton k="status" label="Status" />
        </span>
      </div>

      <ul className="space-y-2">
        {sorted.map((group) => {
          const isSel = selected.has(group.key);
          const lead = group.lead;
          return (
            <li
              key={group.key}
              className={cn(
                "bg-bb-surface border rounded-xl p-3 transition-colors",
                isSel ? "border-bb-orange/50" : "border-bb-border hover:border-bb-border/80"
              )}
            >
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => toggle(group.key)}
                  aria-label={isSel ? "Deselect" : "Select"}
                  aria-pressed={isSel}
                  className="mt-0.5 text-bb-dim hover:text-white shrink-0 h-5 cursor-pointer"
                >
                  {isSel ? <CheckSquare size={16} className="text-bb-orange" /> : <Square size={16} />}
                </button>
                <div className="flex-1 min-w-0 md:flex md:items-start md:gap-6">
                  <button type="button" onClick={() => onOpen(lead)} className="flex-1 min-w-0 text-left cursor-pointer">
                    <div className="flex items-center gap-2">
                      <AccountStack posts={group.posts} />
                      <span className="text-xs text-bb-dim tabular-nums">
                        {group.date ? format(group.date, "EEE MMM d, h:mm a") : "No date"}
                      </span>
                      <GroupKindTags group={group} />
                    </div>
                    <p className="mt-1 text-sm text-white line-clamp-2">{postSnippet(lead, 140)}</p>
                    <p className="mt-0.5 text-xs text-bb-dim md:hidden">{group.clientName}</p>
                  </button>
                  <span className="hidden md:block w-40 text-sm text-bb-muted truncate">{group.clientName}</span>
                  <div className="mt-2 md:mt-0 md:w-72 space-y-1.5">
                    {group.posts.map((p) => (
                      <PostStatusRow key={p.id} post={p} onRetry={onRetry} showWhenFine={group.posts.length > 1} />
                    ))}
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      <p className="text-[11px] text-bb-dim px-1">
        {groups.length} post{groups.length === 1 ? "" : "s"}. A card covers every account a post was made for.
      </p>
    </div>
  );
}
