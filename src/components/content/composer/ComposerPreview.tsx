"use client";

import { Film, Heart, MessageCircle, Star } from "lucide-react";
import PostPreview from "../PostPreview";
import { Avatar } from "./ui";
import RedNoteIcon from "./RedNoteIcon";
import type { MediaFormat } from "@/lib/social/formats";
import type { MediaMeta } from "./types";

function RedNotePreview({ title, body, hashtags, mediaUrls, meta, name }: { title: string; body: string; hashtags: string[]; mediaUrls: string[]; meta: Record<string, MediaMeta>; name: string }) {
  const first = mediaUrls[0];
  const isVideo = first && meta[first]?.kind === "video";
  return (
    <div className="mx-auto max-w-[300px] rounded-2xl overflow-hidden bg-white text-neutral-900 shadow-lg">
      <div className="flex items-center gap-2 px-3 py-2">
        <Avatar name={name} size={24} />
        <span className="text-xs font-medium truncate flex-1">{name}</span>
        <span className="text-[11px] font-medium text-[#FF2442] border border-[#FF2442] rounded-full px-2 py-0.5">Follow</span>
      </div>
      <div className="aspect-[3/4] bg-neutral-100 flex items-center justify-center overflow-hidden">
        {first && !isVideo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={meta[first]?.thumbnailUrl || first} alt="" className="w-full h-full object-cover" />
        ) : first ? (
          <Film size={32} className="text-neutral-400" />
        ) : (
          <RedNoteIcon size={36} />
        )}
      </div>
      {mediaUrls.length > 1 && (
        <div className="flex justify-center gap-1 py-1.5">
          {mediaUrls.slice(0, 9).map((u, i) => (
            <span key={u} className={i === 0 ? "w-1.5 h-1.5 rounded-full bg-[#FF2442]" : "w-1.5 h-1.5 rounded-full bg-neutral-300"} />
          ))}
        </div>
      )}
      <div className="px-3 pb-3 pt-1 space-y-1">
        <p className="text-sm font-semibold leading-snug">{title || "Note title"}</p>
        <p className="text-xs text-neutral-700 whitespace-pre-wrap line-clamp-6">{body}</p>
        {hashtags.length > 0 && <p className="text-xs text-[#13386c]">{hashtags.map((h) => `#${h}`).join(" ")}</p>}
        <div className="flex items-center justify-end gap-3 pt-1 text-neutral-500">
          <Heart size={14} />
          <Star size={14} />
          <MessageCircle size={14} />
        </div>
      </div>
    </div>
  );
}

export default function ComposerPreview({
  platform,
  title,
  body,
  hashtags,
  mediaUrls,
  meta,
  accountName,
  accountHandle,
  avatarUrl,
  postType,
  format,
}: {
  platform: string;
  title: string;
  body: string;
  hashtags: string[];
  mediaUrls: string[];
  meta: Record<string, MediaMeta>;
  accountName: string;
  accountHandle?: string | null;
  avatarUrl?: string | null;
  postType?: string | null;
  format?: MediaFormat | null;
}) {
  if (platform === "REDNOTE") {
    return <RedNotePreview title={title} body={body} hashtags={hashtags} mediaUrls={mediaUrls} meta={meta} name={accountName} />;
  }
  return (
    <PostPreview
      platform={platform}
      title={title}
      body={body}
      hashtags={hashtags}
      mediaUrls={mediaUrls}
      meta={meta}
      postType={postType}
      format={format}
      accountName={accountName}
      accountHandle={accountHandle}
      avatarUrl={avatarUrl}
    />
  );
}
