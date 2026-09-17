"use client";

import { useCallback, useRef, useState } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, rectSortingStrategy, sortableKeyboardCoordinates, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Download, Film, FolderOpen, GripVertical, ImagePlus, Loader2, Music, Upload, X, FileText, Accessibility } from "lucide-react";
import MediaLibrary from "../MediaLibrary";
import ReelAudioMaker from "./ReelAudioMaker";
import { uploadFile } from "@/lib/client-upload";
import { readJson } from "@/lib/fetch-json";
import { cn } from "@/lib/utils";
import { imageThumb } from "@/lib/media-thumb";
import type { MediaMeta } from "./types";
import { aspectLabel, formatBytes, formatDuration, kindFromMime, metaFromClientMedia, probeFile } from "./media";
import { Card, inputClass } from "./ui";
import { safeUuid } from "@/lib/safe-uuid";
import { downloadMediaFile } from "@/lib/client-download";
import { useZipDownload } from "@/components/shared/useZipDownload";

interface Props {
  clientId: string;
  mediaUrls: string[];
  meta: Record<string, MediaMeta>;
  altTexts: Record<string, string>;
  disabled?: boolean;
  onChange: (urls: string[]) => void;
  onAltTextChange: (url: string, text: string) => void;
  onMetaAdd: (items: MediaMeta[]) => void;
}

/** Save the original file. Library files keep their filename; anything else comes straight off the Blob CDN. */
function downloadOriginal(url: string, meta?: MediaMeta) {
  if (meta?.id) {
    downloadMediaFile({ id: meta.id, url, filename: meta.filename || "media" });
    return;
  }
  window.open(`${url}${url.includes("?") ? "&" : "?"}download=1`, "_blank", "noopener,noreferrer");
}

function SortableTile({
  url,
  index,
  meta,
  altText,
  disabled,
  onRemove,
  onAlt,
}: {
  url: string;
  index: number;
  meta?: MediaMeta;
  altText: string;
  disabled?: boolean;
  onRemove: () => void;
  onAlt: (text: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: url, disabled });
  const [showAlt, setShowAlt] = useState(false);
  const kind = meta?.kind || kindFromMime(null, url);
  const thumb = kind === "image" ? imageThumb({ url, thumbnailUrl: meta?.thumbnailUrl ?? null }) : meta?.thumbnailUrl;
  const details = [aspectLabel(meta?.width, meta?.height), formatDuration(meta?.duration), formatBytes(meta?.size)].filter(Boolean).join(" · ");

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn("relative group rounded-lg border border-bb-border bg-bb-elevated overflow-hidden", isDragging && "z-10 ring-2 ring-bb-orange/60")}
    >
      <div className="relative aspect-square bg-black/40">
        {thumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumb} alt={altText || meta?.filename || ""} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-bb-dim">
            {kind === "video" ? <Film size={22} /> : kind === "audio" ? <Music size={22} /> : <FileText size={22} />}
          </div>
        )}
        <span className="absolute top-1 left-1 text-[10px] font-mono bg-black/70 text-white rounded px-1">{index + 1}</span>
        {kind === "video" && (
          <span className="absolute bottom-1 left-1 inline-flex items-center gap-0.5 text-[10px] bg-black/70 text-white rounded px-1">
            <Film size={9} /> {formatDuration(meta?.duration) || "Video"}
          </span>
        )}
        <button
          type="button"
          onClick={() => downloadOriginal(url, meta)}
          aria-label={`Download ${meta?.filename || "file"}`}
          title="Download original"
          className="absolute bottom-1 right-1 p-1.5 sm:p-1 rounded bg-black/70 text-white hover:bg-bb-orange cursor-pointer transition-colors"
        >
          <Download size={14} className="sm:w-3 sm:h-3" />
        </button>
        {!disabled && (
          <>
            <button
              type="button"
              {...attributes}
              {...listeners}
              aria-label="Drag to reorder"
              className="absolute top-1 right-9 sm:right-7 p-1.5 sm:p-1 rounded bg-black/70 text-white opacity-100 sm:opacity-0 sm:group-hover:opacity-100 focus:opacity-100 cursor-grab active:cursor-grabbing transition-opacity touch-none"
            >
              <GripVertical size={14} className="sm:w-3 sm:h-3" />
            </button>
            <button
              type="button"
              onClick={onRemove}
              aria-label="Remove from post"
              className="absolute top-1 right-1 p-1.5 sm:p-1 rounded bg-black/70 text-white hover:bg-red-600 cursor-pointer transition-colors"
            >
              <X size={14} className="sm:w-3 sm:h-3" />
            </button>
          </>
        )}
      </div>
      <div className="px-1.5 py-1 flex items-center justify-between gap-1">
        <span className="text-[10px] text-bb-dim truncate" title={details}>
          {details || meta?.filename || ""}
        </span>
        {kind === "image" && !disabled && (
          <button
            type="button"
            onClick={() => setShowAlt((v) => !v)}
            aria-label="Alt text"
            title={altText ? "Edit alt text" : "Add alt text"}
            className={cn("p-1.5 -m-1 sm:p-0.5 sm:m-0 rounded cursor-pointer transition-colors", altText ? "text-emerald-400" : "text-bb-dim hover:text-white")}
          >
            <Accessibility size={14} className="sm:w-3 sm:h-3" />
          </button>
        )}
      </div>
      {showAlt && (
        <div className="px-1.5 pb-1.5">
          <textarea
            value={altText}
            onChange={(e) => onAlt(e.target.value)}
            rows={2}
            placeholder="Describe this image"
            className={cn(inputClass, "sm:text-xs px-2 py-1 resize-none")}
          />
        </div>
      )}
    </div>
  );
}

export default function MediaTray({ clientId, mediaUrls, meta, altTexts, disabled, onChange, onAltTextChange, onMetaAdd }: Props) {
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [uploads, setUploads] = useState<{ id: string; name: string; pct: number }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { startZip, zipBar } = useZipDownload();
  // Photos only (no GIFs): these can be turned into one Reel video with audio
  const photosOnly = mediaUrls.length > 0 && mediaUrls.every((u) => (meta[u]?.kind || kindFromMime(meta[u]?.mimeType, u)) === "image" && !/\.gif(\?|#|$)/i.test(u));
  const libraryIds = mediaUrls.map((u) => meta[u]?.id).filter((id): id is string => !!id);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    const from = mediaUrls.indexOf(String(e.active.id));
    const to = mediaUrls.indexOf(String(e.over.id));
    if (from >= 0 && to >= 0) onChange(arrayMove(mediaUrls, from, to));
  };

  const handleFiles = useCallback(
    async (files: FileList | File[]) => {
      if (!clientId) {
        setError("Pick a client first so uploads land in their media library.");
        return;
      }
      setError(null);
      const list = Array.from(files).filter((file) => {
        const kind = kindFromMime(file.type, file.name);
        if (kind === "image" || kind === "video") return true;
        setError(`${file.name} isn't an image or video.`);
        return false;
      });
      // Keep the picked order even though files upload a few at a time
      const added: (string | undefined)[] = new Array(list.length);
      const failed: string[] = [];

      const uploadOne = async (file: File, index: number) => {
        const id = safeUuid();
        const kind = kindFromMime(file.type, file.name);
        setUploads((u) => [...u, { id, name: file.name, pct: 0 }]);
        try {
          const probed = await probeFile(file);
          const { url } = await uploadFile(file, {
            onProgress: (loaded, total) => setUploads((u) => u.map((x) => (x.id === id ? { ...x, pct: total ? Math.round((loaded / total) * 100) : 0 } : x))),
          });
          // Register in the client's library so the file is reusable and gets a thumbnail
          const res = await fetch("/api/client-media", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ clientId, url, filename: file.name, fileType: file.type || (kind === "video" ? "video/mp4" : "image/jpeg"), fileSize: file.size }),
          });
          const json = await readJson<{ data?: Parameters<typeof metaFromClientMedia>[0][] }>(res);
          const record = json.ok ? json.data?.data?.[0] : undefined;
          const base = record ? metaFromClientMedia(record) : { url, kind, filename: file.name, mimeType: file.type, size: file.size };
          onMetaAdd([{ ...base, ...probed, url } as MediaMeta]);
          added[index] = url;
        } catch (err) {
          failed.push(file.name);
          if (list.length === 1) setError(err instanceof Error ? err.message : `Couldn't upload ${file.name}.`);
        } finally {
          setUploads((u) => u.filter((x) => x.id !== id));
        }
      };

      let cursor = 0;
      const worker = async () => {
        while (cursor < list.length) {
          const index = cursor++;
          await uploadOne(list[index], index);
        }
      };
      await Promise.all(Array.from({ length: Math.min(3, list.length) }, worker));
      if (failed.length && list.length > 1) {
        setError(`${failed.length} of ${list.length} didn't upload (${failed.join(", ")}). Check your connection and add ${failed.length === 1 ? "it" : "them"} again.`);
      }
      const done = added.filter((u): u is string => !!u);
      if (done.length) onChange([...mediaUrls, ...done]);
    },
    [clientId, mediaUrls, onChange, onMetaAdd]
  );

  return (
    <Card
      id="composer-media"
      title="Media"
      icon={<ImagePlus size={13} />}
      action={
        <span className="flex items-center gap-2">
          <span className="text-[11px] text-bb-dim">{mediaUrls.length ? `${mediaUrls.length} selected · hold and drag to reorder` : "Originals kept as-is"}</span>
          {mediaUrls.length > 1 && libraryIds.length === mediaUrls.length && (
            <button
              type="button"
              onClick={() => startZip(libraryIds, "post-media")}
              className="inline-flex items-center gap-1 text-[11px] text-bb-muted hover:text-white cursor-pointer transition-colors"
            >
              <Download size={11} /> Download all
            </button>
          )}
        </span>
      }
    >
      <div
        onDragOver={(e) => {
          if (disabled) return;
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (!disabled && e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
        }}
        className={cn("rounded-lg transition-colors", dragOver && "bg-bb-orange/5 ring-2 ring-dashed ring-bb-orange/40")}
      >
        {mediaUrls.length > 0 && (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={mediaUrls} strategy={rectSortingStrategy}>
              <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-2 mb-3">
                {mediaUrls.map((url, i) => (
                  <SortableTile
                    key={url}
                    url={url}
                    index={i}
                    meta={meta[url]}
                    altText={altTexts[url] || ""}
                    disabled={disabled}
                    onRemove={() => onChange(mediaUrls.filter((u) => u !== url))}
                    onAlt={(text) => onAltTextChange(url, text)}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}

        {uploads.length > 0 && (
          <div className="space-y-1.5 mb-3">
            {uploads.map((u) => (
              <div key={u.id} className="text-xs text-bb-muted">
                <div className="flex items-center gap-2">
                  <Loader2 size={12} className="animate-spin text-bb-orange shrink-0" />
                  <span className="truncate flex-1">{u.name}</span>
                  <span className="font-mono tabular-nums">{u.pct}%</span>
                </div>
                <div className="mt-1 h-1 rounded-full bg-bb-border overflow-hidden">
                  <div className="h-full bg-bb-orange transition-[width] duration-300" style={{ width: `${u.pct}%` }} />
                </div>
              </div>
            ))}
          </div>
        )}

        {!disabled && (
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="flex items-center justify-center gap-2 px-3 py-3 sm:py-2.5 rounded-lg border border-dashed border-bb-border text-sm text-bb-muted hover:text-white hover:border-bb-orange/50 cursor-pointer transition-colors"
            >
              <Upload size={14} /> <span className="sm:hidden">Photos &amp; videos</span>
              <span className="hidden sm:inline">Upload</span>
            </button>
            <button
              type="button"
              disabled={!clientId}
              onClick={() => setLibraryOpen((v) => !v)}
              className={cn(
                "flex items-center justify-center gap-2 px-3 py-3 sm:py-2.5 rounded-lg border text-sm cursor-pointer transition-colors disabled:opacity-40 disabled:cursor-not-allowed",
                libraryOpen ? "border-bb-orange/60 text-white bg-bb-orange/10" : "border-bb-border text-bb-muted hover:text-white"
              )}
            >
              <FolderOpen size={14} /> {libraryOpen ? "Close library" : "Client library"}
            </button>
            <input
              ref={inputRef}
              type="file"
              multiple
              accept="image/*,video/*,.heic,.heif,.mov"
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.length) handleFiles(e.target.files);
                e.target.value = "";
              }}
            />
          </div>
        )}
        {!disabled && clientId && photosOnly && uploads.length === 0 && (
          <ReelAudioMaker
            clientId={clientId}
            imageUrls={mediaUrls}
            onCreated={(video) => {
              onMetaAdd([video]);
              onChange([video.url]);
            }}
          />
        )}
        {!mediaUrls.length && !disabled && (
          <p className="hidden sm:block text-[11px] text-bb-dim mt-2 text-center">Or drop files here</p>
        )}
        {error && <p className="text-xs text-red-400 mt-2">{error}</p>}
      </div>

      {libraryOpen && clientId && (
        <div className="border-t border-bb-border pt-3">
          <MediaLibrary
            clientId={clientId}
            selectedUrls={mediaUrls}
            allowedTypes={["IMAGE", "VIDEO"]}
            onSelect={(urls) => onChange(urls)}
          />
        </div>
      )}
      {zipBar}
    </Card>
  );
}
