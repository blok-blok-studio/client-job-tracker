"use client";

import { Hand, Smartphone } from "lucide-react";
import { getSpec } from "@/lib/social/specs";
import { CharCounter } from "../ui";
import type { PanelProps } from "./shared";

export default function RedNotePanel({ draft, mediaUrls, title, body }: PanelProps & { title: string; body: string }) {
  const limits = getSpec("REDNOTE")?.limits ?? { title: 20, body: 1000 };
  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2.5 rounded-lg border border-bb-border bg-bb-elevated px-3 py-2.5">
        <Hand size={15} className="text-bb-orange mt-0.5 shrink-0" />
        <div className="text-[11px] text-bb-muted space-y-1">
          <p className="text-sm text-white">Posted by hand</p>
          <p>RedNote has no posting API. At the scheduled time the assigned teammate gets a notification that opens a phone page to save the media, copy the text and open RedNote.</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 text-[11px]">
        <div className="rounded-lg border border-bb-border px-3 py-2">
          <p className="text-bb-dim mb-0.5">Title</p>
          <CharCounter value={title.length} max={limits.title} />
        </div>
        <div className="rounded-lg border border-bb-border px-3 py-2">
          <p className="text-bb-dim mb-0.5">Body</p>
          <CharCounter value={body.length} max={limits.body} />
        </div>
      </div>
      <p className="flex items-center gap-1.5 text-[11px] text-bb-dim">
        <Smartphone size={12} /> {mediaUrls.length} file{mediaUrls.length === 1 ? "" : "s"} to save on the phone{draft.postType === "video_note" ? " (video note)" : ""}.
      </p>
    </div>
  );
}
