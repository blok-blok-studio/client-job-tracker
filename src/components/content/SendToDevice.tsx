"use client";

import { useState } from "react";
import {
  Smartphone,
  Copy,
  Check,
  ExternalLink,
  Download,
  ClipboardList,
  Music,
  Film,
  Image as ImageIcon,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

interface SendToDeviceProps {
  platform: string;
  caption: string;      // Full caption with hashtags
  mediaUrls: string[];
  firstComment?: string;
  taggedUsers?: string[];
  location?: string;
}

export default function SendToDevice({
  platform,
  caption,
  mediaUrls,
  firstComment,
  taggedUsers,
  location,
}: SendToDeviceProps) {
  const [captionCopied, setCaptionCopied] = useState(false);
  const [commentCopied, setCommentCopied] = useState(false);
  const [tagsCopied, setTagsCopied] = useState(false);
  const [locationCopied, setLocationCopied] = useState(false);
  const [showChecklist, setShowChecklist] = useState(true);
  const [checklist, setChecklist] = useState({
    downloadMedia: false,
    addMusic: false,
    pasteCaption: false,
    addTags: false,
    addLocation: false,
    pasteComment: false,
    posted: false,
  });

  const videos = mediaUrls.filter((u) => /\.(mp4|mov|webm)$/i.test(u));
  const images = mediaUrls.filter((u) => /\.(jpg|jpeg|png|gif|webp|heic)$/i.test(u));
  const audio = mediaUrls.filter((u) => /\.(mp3|wav|ogg|m4a|weba)$/i.test(u));

  const copyText = async (text: string, setter: (v: boolean) => void) => {
    await navigator.clipboard.writeText(text);
    setter(true);
    setTimeout(() => setter(false), 2000);
  };

  const platformLabel = platform === "INSTAGRAM" ? "Instagram" : platform === "TIKTOK" ? "TikTok" : platform;
  const platformColor = platform === "INSTAGRAM" ? "from-purple-500 to-pink-500" : "from-cyan-500 to-pink-500";

  const toggleCheck = (key: keyof typeof checklist) => {
    setChecklist((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const completedCount = Object.values(checklist).filter(Boolean).length;
  const totalSteps = Object.keys(checklist).filter((k) => {
    if (k === "addTags" && (!taggedUsers || taggedUsers.length === 0)) return false;
    if (k === "addLocation" && !location) return false;
    if (k === "pasteComment" && !firstComment) return false;
    return true;
  }).length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className={`p-4 rounded-xl bg-gradient-to-r ${platformColor} bg-opacity-10`}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-white/10 backdrop-blur rounded-xl flex items-center justify-center">
            <Smartphone size={20} className="text-white" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">Post via {platformLabel} App</h3>
            <p className="text-xs text-white/60">
              Everything is prepped. Follow the steps below to post with music.
            </p>
          </div>
        </div>
      </div>

      {/* ─── DOWNLOAD MEDIA ──────────────────────────────────────────── */}
      <div className="space-y-2">
        <h4 className="text-xs font-medium text-bb-muted flex items-center gap-1.5">
          <Download size={12} /> Step 1: Get media on your phone
        </h4>
        <div className="grid grid-cols-1 gap-1.5">
          {videos.map((url, i) => (
            <a
              key={i}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2.5 p-2.5 bg-bb-elevated border border-bb-border rounded-lg text-xs hover:bg-bb-surface transition-colors"
            >
              <Film size={14} className="text-purple-400 shrink-0" />
              <span className="text-white flex-1 truncate">Video {videos.length > 1 ? i + 1 : ""}</span>
              <ExternalLink size={12} className="text-bb-dim" />
            </a>
          ))}
          {images.map((url, i) => (
            <a
              key={i}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2.5 p-2.5 bg-bb-elevated border border-bb-border rounded-lg text-xs hover:bg-bb-surface transition-colors"
            >
              <ImageIcon size={14} className="text-blue-400 shrink-0" />
              <span className="text-white flex-1 truncate">Photo {images.length > 1 ? i + 1 : ""}</span>
              <ExternalLink size={12} className="text-bb-dim" />
            </a>
          ))}
          {audio.map((url, i) => (
            <a
              key={i}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2.5 p-2.5 bg-bb-elevated border border-bb-border rounded-lg text-xs hover:bg-bb-surface transition-colors"
            >
              <Music size={14} className="text-green-400 shrink-0" />
              <span className="text-white flex-1 truncate">Audio {audio.length > 1 ? i + 1 : ""}</span>
              <ExternalLink size={12} className="text-bb-dim" />
            </a>
          ))}
        </div>
        <p className="text-[10px] text-bb-dim">
          Open each link on your phone to download. Or AirDrop from desktop.
        </p>
      </div>

      {/* ─── COPY BLOCKS ─────────────────────────────────────────────── */}
      <div className="space-y-2">
        <h4 className="text-xs font-medium text-bb-muted flex items-center gap-1.5">
          <ClipboardList size={12} /> Step 2: Copy your content
        </h4>

        {/* Caption */}
        <div className="bg-bb-elevated border border-bb-border rounded-lg overflow-hidden">
          <div className="flex items-center justify-between p-2.5">
            <span className="text-[10px] font-medium text-bb-dim uppercase tracking-wide">Caption</span>
            <button
              type="button"
              onClick={() => copyText(caption, setCaptionCopied)}
              className="flex items-center gap-1 px-2 py-1 rounded-md bg-bb-surface text-xs text-bb-muted hover:text-white transition-colors"
            >
              {captionCopied ? <Check size={10} className="text-green-400" /> : <Copy size={10} />}
              {captionCopied ? "Copied!" : "Copy"}
            </button>
          </div>
          <div className="px-2.5 pb-2.5">
            <p className="text-xs text-white/80 whitespace-pre-wrap leading-relaxed max-h-32 overflow-y-auto">
              {caption || "(no caption)"}
            </p>
          </div>
        </div>

        {/* First Comment */}
        {firstComment && (
          <div className="bg-bb-elevated border border-bb-border rounded-lg overflow-hidden">
            <div className="flex items-center justify-between p-2.5">
              <span className="text-[10px] font-medium text-bb-dim uppercase tracking-wide">First Comment</span>
              <button
                type="button"
                onClick={() => copyText(firstComment, setCommentCopied)}
                className="flex items-center gap-1 px-2 py-1 rounded-md bg-bb-surface text-xs text-bb-muted hover:text-white transition-colors"
              >
                {commentCopied ? <Check size={10} className="text-green-400" /> : <Copy size={10} />}
                {commentCopied ? "Copied!" : "Copy"}
              </button>
            </div>
            <div className="px-2.5 pb-2.5">
              <p className="text-xs text-white/80 whitespace-pre-wrap max-h-20 overflow-y-auto">{firstComment}</p>
            </div>
          </div>
        )}

        {/* Tags */}
        {taggedUsers && taggedUsers.length > 0 && (
          <div className="flex items-center gap-2">
            <div className="flex-1 text-xs text-bb-muted truncate">
              Tag: {taggedUsers.map((u) => (u.startsWith("@") ? u : `@${u}`)).join(" ")}
            </div>
            <button
              type="button"
              onClick={() => copyText(taggedUsers.map((u) => (u.startsWith("@") ? u : `@${u}`)).join(" "), setTagsCopied)}
              className="text-[10px] text-bb-dim hover:text-white flex items-center gap-1"
            >
              {tagsCopied ? <Check size={10} className="text-green-400" /> : <Copy size={10} />}
            </button>
          </div>
        )}

        {/* Location */}
        {location && (
          <div className="flex items-center gap-2">
            <div className="flex-1 text-xs text-bb-muted truncate">Location: {location}</div>
            <button
              type="button"
              onClick={() => copyText(location, setLocationCopied)}
              className="text-[10px] text-bb-dim hover:text-white flex items-center gap-1"
            >
              {locationCopied ? <Check size={10} className="text-green-400" /> : <Copy size={10} />}
            </button>
          </div>
        )}
      </div>

      {/* ─── POST CHECKLIST ──────────────────────────────────────────── */}
      <div className="space-y-2">
        <button
          type="button"
          onClick={() => setShowChecklist(!showChecklist)}
          className="flex items-center justify-between w-full text-xs font-medium text-bb-muted"
        >
          <span className="flex items-center gap-1.5">
            <Music size={12} />
            Step 3: Post on {platformLabel}
            <span className="text-[10px] text-bb-dim">({completedCount}/{totalSteps})</span>
          </span>
          {showChecklist ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        </button>

        {showChecklist && (
          <div className="space-y-1">
            {[
              { key: "downloadMedia" as const, label: "Downloaded media to phone" },
              { key: "addMusic" as const, label: `Added trending audio / music in ${platformLabel}` },
              { key: "pasteCaption" as const, label: "Pasted caption" },
              ...(taggedUsers && taggedUsers.length > 0
                ? [{ key: "addTags" as const, label: "Tagged people" }]
                : []),
              ...(location
                ? [{ key: "addLocation" as const, label: "Added location" }]
                : []),
              ...(firstComment
                ? [{ key: "pasteComment" as const, label: "Posted first comment" }]
                : []),
              { key: "posted" as const, label: "Published!" },
            ].map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => toggleCheck(item.key)}
                className={`flex items-center gap-2.5 w-full p-2 rounded-lg border text-xs text-left transition-all ${
                  checklist[item.key]
                    ? "border-green-500/20 bg-green-500/5 text-green-300"
                    : "border-bb-border/50 bg-bb-elevated/30 text-bb-muted hover:bg-bb-elevated"
                }`}
              >
                <div
                  className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                    checklist[item.key]
                      ? "border-green-500 bg-green-500"
                      : "border-bb-border"
                  }`}
                >
                  {checklist[item.key] && <Check size={10} className="text-white" />}
                </div>
                <span className={checklist[item.key] ? "line-through opacity-70" : ""}>
                  {item.label}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Tip */}
      <div className="p-3 bg-bb-elevated/50 border border-bb-border/50 rounded-lg">
        <p className="text-[10px] text-bb-dim leading-relaxed">
          <strong className="text-bb-muted">Pro tip:</strong> Open {platformLabel} on your phone,
          start a new post, select the downloaded media, add trending audio,
          then paste the caption. The first comment strategy boosts engagement — paste it
          right after posting.
        </p>
      </div>
    </div>
  );
}
