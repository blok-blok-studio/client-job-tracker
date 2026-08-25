"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  FolderUp,
  Search,
  FileText,
  FileImage,
  FileVideo,
  FileAudio,
  File as FileIcon,
  HardHat,
  X,
  Loader2,
  Upload,
  Users,
  CalendarDays,
  Download,
  Eye,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Music,
  Copy,
} from "lucide-react";
import { upload as vercelBlobUpload } from "@vercel/blob/client";
import TopBar from "@/components/layout/TopBar";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/shared/Toast";
import { readJson, friendlyError } from "@/lib/fetch-json";
import { safeUuid } from "@/lib/safe-uuid";

interface WorkRow {
  id: string;
  filename: string;
  url: string;
  fileSize: number | null;
  mimeType: string | null;
  note: string | null;
  clientId: string | null;
  clientName: string | null;
  uploadedBy: string;
  createdAt: string;
  contractor: { id: string; name: string } | null;
}

interface ClientOption {
  id: string;
  name: string;
}

function fmtBytes(bytes: number | null | undefined) {
  if (bytes === null || bytes === undefined) return null;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

type PreviewKind = "IMAGE" | "VIDEO" | "AUDIO" | "PDF" | "OTHER";

const EXT_KIND: Record<string, PreviewKind> = {
  jpg: "IMAGE", jpeg: "IMAGE", png: "IMAGE", gif: "IMAGE", webp: "IMAGE",
  avif: "IMAGE", svg: "IMAGE", bmp: "IMAGE", heic: "IMAGE", heif: "IMAGE",
  mp4: "VIDEO", mov: "VIDEO", m4v: "VIDEO", webm: "VIDEO", avi: "VIDEO", mkv: "VIDEO",
  mp3: "AUDIO", m4a: "AUDIO", wav: "AUDIO", aac: "AUDIO", ogg: "AUDIO", flac: "AUDIO",
  pdf: "PDF",
};

// Uploads often arrive with a null or generic mimeType — Safari hands over an
// empty type for HEIC and iCloud Drive files — so fall back to the extension
// before deciding a file can't be previewed.
function previewKind(r: { filename: string; mimeType: string | null }): PreviewKind {
  const m = r.mimeType || "";
  if (m.startsWith("image/")) return "IMAGE";
  if (m.startsWith("video/")) return "VIDEO";
  if (m.startsWith("audio/")) return "AUDIO";
  if (m === "application/pdf") return "PDF";
  const ext = r.filename.includes(".") ? r.filename.split(".").pop()!.toLowerCase() : "";
  return EXT_KIND[ext] || "OTHER";
}

function iconFor(r: WorkRow) {
  switch (previewKind(r)) {
    case "IMAGE": return <FileImage size={16} className="text-purple-400 shrink-0" />;
    case "VIDEO": return <FileVideo size={16} className="text-purple-400 shrink-0" />;
    case "AUDIO": return <FileAudio size={16} className="text-green-400 shrink-0" />;
    case "PDF": return <FileText size={16} className="text-bb-orange shrink-0" />;
    default: return <FileIcon size={16} className="text-bb-muted shrink-0" />;
  }
}

/**
 * The viewer body. Images, video, audio and PDFs play right here; anything the
 * browser can't render (or a HEIC it refuses to decode) falls back to a
 * download prompt instead of a broken frame.
 */
function PreviewPane({ row, onDownload }: { row: WorkRow; onDownload: () => void }) {
  const kind = previewKind(row);
  const [failed, setFailed] = useState(false);

  // Viewer reuses this component as you page through files
  useEffect(() => setFailed(false), [row.id]);

  if (!failed) {
    if (kind === "IMAGE") {
      return (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={row.url}
          alt={row.filename}
          onError={() => setFailed(true)}
          className="max-w-full max-h-full object-contain rounded-lg"
        />
      );
    }
    if (kind === "VIDEO") {
      return (
        <video
          src={row.url}
          controls
          autoPlay
          playsInline
          onError={() => setFailed(true)}
          onClick={(e) => e.stopPropagation()}
          className="max-w-full max-h-full rounded-lg"
        />
      );
    }
    if (kind === "AUDIO") {
      return (
        <div className="flex flex-col items-center gap-4">
          <div className="w-32 h-32 rounded-2xl bg-white/5 flex items-center justify-center">
            <Music size={48} className="text-green-400" />
          </div>
          <p className="text-white font-medium text-center px-4">{row.filename}</p>
          <audio
            src={row.url}
            controls
            autoPlay
            onError={() => setFailed(true)}
            onClick={(e) => e.stopPropagation()}
            className="w-80"
          />
        </div>
      );
    }
    if (kind === "PDF") {
      return (
        <iframe
          src={row.url}
          title={row.filename}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-4xl h-[80vh] rounded-lg bg-white"
        />
      );
    }
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="w-32 h-32 rounded-2xl bg-white/5 flex items-center justify-center">
        <FileText size={48} className="text-orange-400" />
      </div>
      <p className="text-white font-medium text-center px-4">{row.filename}</p>
      <p className="text-sm text-bb-dim">
        {[fmtBytes(row.fileSize), row.mimeType].filter(Boolean).join(" · ")}
      </p>
      <p className="text-sm text-bb-dim">
        {failed
          ? "Your browser can't play this one — download it to open."
          : "No in-browser preview for this file type."}
      </p>
      <button
        onClick={onDownload}
        className="px-4 py-2 rounded-lg bg-white/10 text-white hover:bg-white/20 transition-colors text-sm flex items-center gap-2"
      >
        <Download size={14} /> Download to view
      </button>
    </div>
  );
}

export default function WorkPage() {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<WorkRow[]>([]);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [search, setSearch] = useState("");
  const [clientFilter, setClientFilter] = useState("");
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);
  const { toast } = useToast();

  // Upload form
  const [pending, setPending] = useState<File[]>([]);
  const [uploadClientId, setUploadClientId] = useState("");
  const [note, setNote] = useState("");
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchRows = useCallback(async () => {
    try {
      const res = await fetch("/api/work");
      const data = await res.json();
      if (data.success) setRows(data.data);
    } catch {
      // API not available
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRows();
    fetch("/api/clients?type=ALL")
      .then((r) => r.json())
      .then(
        (d) =>
          d.success &&
          setClients(
            d.data.map((c: ClientOption) => ({ id: c.id, name: c.name }))
          )
      )
      .catch(() => {});
  }, [fetchRows]);

  const acceptFiles = (list: FileList | File[]) => {
    const incoming = Array.from(list);
    if (!incoming.length) return;
    setPending((prev) => {
      const next = [...prev];
      for (const f of incoming) {
        if (!next.some((p) => p.name === f.name && p.size === f.size)) next.push(f);
      }
      return next;
    });
  };

  const handleSubmit = async () => {
    if (!pending.length || uploading) return;
    if (!uploadClientId) {
      toast("Choose which client this work goes to first", "error");
      return;
    }
    setUploading(true);
    setProgress(0);
    try {
      // Straight browser → Blob. Routing finished work through an API route
      // capped it at Vercel's 4.5MB function body limit, and the 413 came back
      // as plain text — the failure every big delivery hit.
      const totalBytes = pending.reduce((sum, f) => sum + f.size, 0) || 1;
      const sentBytes = new Map<number, number>();
      const reportProgress = () => {
        let sent = 0;
        for (const v of sentBytes.values()) sent += v;
        setProgress(Math.min(99, Math.round((sent / totalBytes) * 100)));
      };

      const uploaded = [];
      for (let i = 0; i < pending.length; i++) {
        const f = pending[i];
        const ext = f.name.includes(".") ? "." + f.name.split(".").pop() : "";
        const blob = await vercelBlobUpload(`work/${safeUuid()}${ext}`, f, {
          access: "public",
          handleUploadUrl: "/api/uploads/blob",
          // Multipart only pays off on big files; the extra round trips slow
          // a batch of small ones down
          multipart: f.size > 8 * 1024 * 1024,
          onUploadProgress: ({ loaded }) => {
            sentBytes.set(i, loaded);
            reportProgress();
          },
        });
        sentBytes.set(i, f.size);
        reportProgress();
        uploaded.push({
          blobUrl: blob.url,
          filename: f.name,
          contentType: blob.contentType || f.type || undefined,
          size: f.size,
        });
      }

      const res = await fetch("/api/work", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: uploadClientId,
          note: note.trim(),
          files: uploaded,
        }),
      });
      const result = await readJson<{ success: boolean }>(res, "Couldn't save the upload. Please try again.");
      if (!result.ok) throw new Error(result.error!);

      setPending([]);
      setNote("");
      setUploadClientId("");
      toast(
        uploadClientId !== "general"
          ? "Work uploaded — it's in the client's Files tab too"
          : "Work uploaded",
        "success"
      );
      fetchRows();
    } catch (err) {
      toast(friendlyError(err, "Upload failed. Please try again."), "error");
    } finally {
      setUploading(false);
      setProgress(0);
    }
  };

  // Download through our own endpoint. Pointing an <a download> at the Blob URL
  // is ignored cross-origin, so videos and PDFs just opened in a tab and never
  // saved — this route sets an attachment disposition (and redirects big files
  // straight to the CDN so nothing buffers in a function).
  const handleDownload = (row: WorkRow) => {
    setDownloading(row.id);
    const a = document.createElement("a");
    a.href = `/api/work/${row.id}/download`;
    a.download = row.filename;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    // No completion event for a native download; clear the spinner shortly after.
    setTimeout(() => setDownloading((cur) => (cur === row.id ? null : cur)), 1500);
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (clientFilter && r.clientId !== clientFilter) return false;
      if (q) {
        const hay = `${r.filename} ${r.clientName || ""} ${r.contractor?.name || r.uploadedBy} ${r.note || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, search, clientFilter]);

  const summary = useMemo(() => {
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    return {
      total: rows.length,
      thisWeek: rows.filter((r) => new Date(r.createdAt).getTime() > weekAgo).length,
      fromContractors: rows.filter((r) => r.contractor).length,
      clientsCovered: new Set(rows.map((r) => r.clientId).filter(Boolean)).size,
    };
  }, [rows]);

  // Arrow keys page through the viewer, Escape closes it
  useEffect(() => {
    if (viewerIndex === null) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setViewerIndex(null);
      if (e.key === "ArrowLeft" && viewerIndex > 0) setViewerIndex(viewerIndex - 1);
      if (e.key === "ArrowRight" && viewerIndex < filtered.length - 1) setViewerIndex(viewerIndex + 1);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [viewerIndex, filtered.length]);

  // Filters can shrink the list out from under an open viewer
  useEffect(() => {
    setViewerIndex((cur) => (cur !== null && cur >= filtered.length ? null : cur));
  }, [filtered.length]);

  return (
    <div>
      <TopBar title="Work" subtitle="Finished work from the team and contractors — one drop point" />
      <div className="px-4 lg:px-6 space-y-4">
        {/* Summary tiles */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { label: "Files", value: summary.total, icon: FolderUp },
            { label: "This Week", value: summary.thisWeek, icon: CalendarDays },
            { label: "From Contractors", value: summary.fromContractors, icon: HardHat },
            { label: "Clients Covered", value: summary.clientsCovered, icon: Users },
          ].map((tile) => (
            <div
              key={tile.label}
              className="bg-bb-surface border border-bb-border rounded-lg p-4 flex items-center gap-3"
            >
              <tile.icon size={18} className="text-bb-orange shrink-0" />
              <div className="min-w-0">
                <p className="text-lg font-semibold text-white truncate">{tile.value}</p>
                <p className="text-xs text-bb-dim truncate">{tile.label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Upload card */}
        <div className="bg-bb-surface border border-bb-border rounded-lg p-4 space-y-3">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              if (e.dataTransfer.files.length) acceptFiles(e.dataTransfer.files);
            }}
            onClick={() => fileInputRef.current?.click()}
            className={cn(
              "flex items-center justify-center gap-3 py-6 rounded-lg border-2 border-dashed cursor-pointer transition-all",
              dragOver
                ? "border-bb-orange bg-bb-orange/5"
                : "border-bb-border hover:border-bb-orange/50"
            )}
          >
            <FolderUp size={20} className={dragOver ? "text-bb-orange" : "text-bb-dim"} />
            <p className="text-sm text-bb-muted">
              Drop finished files here or <span className="text-white font-medium">browse</span>
              <span className="text-bb-dim"> · any type · originals kept as-is, never compressed</span>
            </p>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="sr-only"
            tabIndex={-1}
            onChange={(e) => {
              if (e.target.files?.length) acceptFiles(e.target.files);
              e.target.value = "";
            }}
          />

          {pending.length > 0 && (
            <>
              <div className="space-y-1.5">
                {pending.map((f, i) => (
                  <div
                    key={`${f.name}-${f.size}-${i}`}
                    className="flex items-center gap-2 px-3 py-2 bg-bb-black border border-bb-border rounded-md"
                  >
                    <FileText size={14} className="text-bb-orange shrink-0" />
                    <span className="text-sm text-white truncate flex-1">{f.name}</span>
                    <span className="text-[10px] text-bb-dim shrink-0">{fmtBytes(f.size)}</span>
                    <button
                      type="button"
                      onClick={() => setPending((prev) => prev.filter((_, idx) => idx !== i))}
                      className="text-bb-dim hover:text-white shrink-0"
                    >
                      <X size={13} />
                    </button>
                  </div>
                ))}
              </div>
              <div className="flex flex-col sm:flex-row gap-2">
                <select
                  value={uploadClientId}
                  onChange={(e) => setUploadClientId(e.target.value)}
                  className={cn(
                    "px-3 py-2 bg-bb-black border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-bb-orange/50 sm:w-56 [color-scheme:dark]",
                    uploadClientId ? "border-bb-border text-white" : "border-bb-orange/60 text-bb-dim"
                  )}
                >
                  <option value="" disabled>
                    Which client is this for?
                  </option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                  <option value="general">General / internal (not client work)</option>
                </select>
                <input
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Note (optional) — what's in this delivery"
                  className="flex-1 px-3 py-2 bg-bb-black border border-bb-border rounded-md text-white placeholder:text-bb-dim text-sm focus:outline-none focus:ring-2 focus:ring-bb-orange/50"
                />
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={uploading || !uploadClientId}
                  className="flex items-center justify-center gap-2 px-4 py-2 bg-bb-orange hover:bg-bb-orange-light text-white text-sm font-medium rounded-md transition-colors disabled:opacity-50 shrink-0"
                >
                  {uploading ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      {progress}%
                    </>
                  ) : (
                    <>
                      <Upload size={14} />
                      Upload {pending.length === 1 ? "file" : `${pending.length} files`}
                    </>
                  )}
                </button>
              </div>
              {uploadClientId && (
                <p className="text-[11px] text-bb-dim">
                  These files will also appear in the client&apos;s Files tab.
                </p>
              )}
            </>
          )}
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-bb-dim" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search files, clients, uploaders, notes…"
              className="w-full pl-9 pr-4 py-2 bg-bb-surface border border-bb-border rounded-md text-white placeholder:text-bb-dim text-sm focus:outline-none focus:ring-2 focus:ring-bb-orange/50"
            />
          </div>
          <select
            value={clientFilter}
            onChange={(e) => setClientFilter(e.target.value)}
            className="px-3 py-2 bg-bb-surface border border-bb-border rounded-md text-white text-sm focus:outline-none focus:ring-2 focus:ring-bb-orange/50 sm:w-56 [color-scheme:dark]"
          >
            <option value="">All clients</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        {/* List */}
        <div className="space-y-2 pb-8">
          {loading ? (
            <div className="text-center py-12 text-bb-dim">Loading work…</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-bb-dim flex flex-col items-center gap-2">
              <FolderUp size={32} className="text-bb-dim/50" />
              <p>
                {rows.length === 0
                  ? "No finished work yet. Drop files above, or wait for contractors to submit through their portal."
                  : "Nothing matches these filters."}
              </p>
            </div>
          ) : (
            filtered.map((r, idx) => (
              <div
                key={r.id}
                className="bg-bb-surface border border-bb-border rounded-lg p-3 flex items-center gap-3"
              >
                {iconFor(r)}
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white truncate">
                    <button
                      type="button"
                      onClick={() => setViewerIndex(idx)}
                      className="hover:text-bb-orange transition-colors text-left"
                      title="Preview"
                    >
                      {r.filename}
                    </button>
                    {r.clientName && <span className="text-bb-muted"> · {r.clientName}</span>}
                  </p>
                  <p className="text-[11px] text-bb-dim flex items-center gap-1.5 flex-wrap">
                    <span className="flex items-center gap-1">
                      {r.contractor && <HardHat size={10} />}
                      {r.contractor?.name || r.uploadedBy}
                    </span>
                    <span>·</span>
                    <span>
                      {new Date(r.createdAt).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </span>
                    {fmtBytes(r.fileSize) && (
                      <>
                        <span>·</span>
                        <span>{fmtBytes(r.fileSize)}</span>
                      </>
                    )}
                  </p>
                  {r.note && <p className="text-xs text-bb-dim mt-1 line-clamp-1">{r.note}</p>}
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => setViewerIndex(idx)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-bb-black border border-bb-border text-bb-muted hover:text-white text-xs font-medium rounded-md transition-colors"
                    title="Preview / watch here"
                  >
                    <Eye size={12} />
                    Preview
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDownload(r)}
                    disabled={downloading === r.id}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-bb-black border border-bb-border text-bb-muted hover:text-white text-xs font-medium rounded-md transition-colors disabled:opacity-60"
                    title="Download"
                  >
                    <Download size={12} className={downloading === r.id ? "animate-bounce" : ""} />
                    Download
                  </button>
                  <a
                    href={r.url}
                    target="_blank"
                    rel="noreferrer"
                    className="p-1.5 text-bb-dim hover:text-white transition-colors"
                    title="Open in new tab"
                  >
                    <ExternalLink size={13} />
                  </a>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Full-screen viewer — watch/read before deciding to download */}
        {viewerIndex !== null && filtered[viewerIndex] && (() => {
          const row = filtered[viewerIndex];
          const total = filtered.length;
          return (
            <div
              className="fixed inset-0 z-[200] bg-black/95 flex flex-col"
              onClick={() => setViewerIndex(null)}
            >
              <div
                className="flex items-center justify-between gap-3 px-4 py-3 shrink-0"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-sm text-white font-medium truncate max-w-[300px]">
                    {row.filename}
                  </span>
                  <span className="text-xs text-bb-dim shrink-0">
                    {[
                      fmtBytes(row.fileSize),
                      row.clientName,
                      row.contractor?.name || row.uploadedBy,
                      `${viewerIndex + 1} of ${total}`,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => handleDownload(row)}
                    disabled={downloading === row.id}
                    className="p-2 rounded-lg bg-white/10 text-white hover:bg-white/20 transition-colors disabled:opacity-60"
                    title="Download"
                  >
                    <Download size={16} className={downloading === row.id ? "animate-bounce" : ""} />
                  </button>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(row.url);
                      toast("Link copied", "success");
                    }}
                    className="p-2 rounded-lg bg-white/10 text-white hover:bg-white/20 transition-colors"
                    title="Copy link"
                  >
                    <Copy size={16} />
                  </button>
                  <button
                    onClick={() => window.open(row.url, "_blank", "noopener")}
                    className="p-2 rounded-lg bg-white/10 text-white hover:bg-white/20 transition-colors"
                    title="Open in new tab"
                  >
                    <ExternalLink size={16} />
                  </button>
                  <button
                    onClick={() => setViewerIndex(null)}
                    className="p-2 rounded-lg bg-white/10 text-white hover:bg-white/20 transition-colors"
                    title="Close"
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>

              <div
                className="flex-1 flex items-center justify-center relative min-h-0 px-4 sm:px-16 pb-4"
                onClick={(e) => e.stopPropagation()}
              >
                {viewerIndex > 0 && (
                  <button
                    onClick={() => setViewerIndex(viewerIndex - 1)}
                    className="absolute left-2 top-1/2 -translate-y-1/2 p-3 rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors z-10"
                    title="Previous"
                  >
                    <ChevronLeft size={24} />
                  </button>
                )}
                <PreviewPane row={row} onDownload={() => handleDownload(row)} />
                {viewerIndex < total - 1 && (
                  <button
                    onClick={() => setViewerIndex(viewerIndex + 1)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-3 rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors z-10"
                    title="Next"
                  >
                    <ChevronRight size={24} />
                  </button>
                )}
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
}
