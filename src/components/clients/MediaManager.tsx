"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  Upload, Download, Trash2, X, ChevronLeft, ChevronRight,
  Film, Music, ExternalLink, Image as ImageIcon,
  Edit2, Check, Copy, Info, Eye, FileText,
  Calendar, User, HardDrive, Tag, StickyNote,
  CheckSquare, Square, Loader2,
} from "lucide-react";
import ConfirmDialog from "@/components/shared/ConfirmDialog";
import VideoThumbnail from "@/components/shared/VideoThumbnail";

interface MediaFile {
  id: string;
  url: string;
  filename: string;
  fileType: string;
  fileSize: number;
  mimeType: string;
  uploadedBy: string;
  label: string | null;
  notes?: string | null;
  createdAt: string;
}

interface MediaManagerProps {
  mediaFiles: MediaFile[];
  uploadToken: string | null;
  uploadingMedia: boolean;
  onUpload: (files: FileList) => void;
  onDelete: (id: string) => void;
  onBatchDelete: (ids: string[]) => Promise<void>;
  onRefresh: () => void;
  toast: (msg: string, type: "success" | "error") => void;
}

const ACCEPTED_FILES = "image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.rtf";

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  });
}

function getFileIcon(fileType: string, size: number) {
  if (fileType === "IMAGE") return <ImageIcon size={size} className="text-blue-400" />;
  if (fileType === "VIDEO") return <Film size={size} className="text-purple-400" />;
  if (fileType === "AUDIO") return <Music size={size} className="text-green-400" />;
  return <FileText size={size} className="text-orange-400" />;
}

export default function MediaManager({
  mediaFiles, uploadingMedia, onUpload, onDelete, onBatchDelete, onRefresh, toast,
}: MediaManagerProps) {
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingLabel, setEditingLabel] = useState(false);
  const [labelValue, setLabelValue] = useState("");
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesValue, setNotesValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [filter, setFilter] = useState<"ALL" | "IMAGE" | "VIDEO" | "AUDIO" | "DOCUMENT">("ALL");
  const hoverTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previewRef = useRef<HTMLDivElement>(null);

  // Multi-select state
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Drag-and-drop state
  const [dragOver, setDragOver] = useState(false);
  const dragCounter = useRef(0);
  const dropZoneRef = useRef<HTMLDivElement>(null);

  const selectedMedia = selectedId ? mediaFiles.find((m) => m.id === selectedId) : null;
  const hoveredMedia = hoveredId ? mediaFiles.find((m) => m.id === hoveredId) : null;

  const filtered = filter === "ALL" ? mediaFiles : mediaFiles.filter((m) => m.fileType === filter);

  const counts = {
    ALL: mediaFiles.length,
    IMAGE: mediaFiles.filter((m) => m.fileType === "IMAGE").length,
    VIDEO: mediaFiles.filter((m) => m.fileType === "VIDEO").length,
    AUDIO: mediaFiles.filter((m) => m.fileType === "AUDIO").length,
    DOCUMENT: mediaFiles.filter((m) => m.fileType === "DOCUMENT").length,
  };

  // Native DOM drop listeners — more reliable than React synthetic events
  useEffect(() => {
    const el = dropZoneRef.current;
    if (!el) return;

    const onDragEnter = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounter.current++;
      if (e.dataTransfer?.types.includes("Files")) setDragOver(true);
    };

    const onDragOver = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
    };

    const onDragLeave = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounter.current--;
      if (dragCounter.current <= 0) { dragCounter.current = 0; setDragOver(false); }
    };

    const onDrop = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounter.current = 0;
      setDragOver(false);
      if (e.dataTransfer?.files.length) onUpload(e.dataTransfer.files);
    };

    el.addEventListener("dragenter", onDragEnter);
    el.addEventListener("dragover", onDragOver);
    el.addEventListener("dragleave", onDragLeave);
    el.addEventListener("drop", onDrop);

    return () => {
      el.removeEventListener("dragenter", onDragEnter);
      el.removeEventListener("dragover", onDragOver);
      el.removeEventListener("dragleave", onDragLeave);
      el.removeEventListener("drop", onDrop);
    };
  }, [onUpload]);

  // Multi-select helpers
  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    setSelectedIds(new Set(filtered.map((m) => m.id)));
  };

  const deselectAll = () => {
    setSelectedIds(new Set());
  };

  const exitSelectMode = () => {
    setSelectMode(false);
    setSelectedIds(new Set());
  };

  const handleBatchDelete = async () => {
    if (selectedIds.size === 0) return;
    setDeleting(true);
    try {
      await onBatchDelete(Array.from(selectedIds));
      exitSelectMode();
    } catch {
      toast("Failed to delete files", "error");
    } finally {
      setDeleting(false);
      setConfirmDeleteOpen(false);
    }
  };

  // Force download via proxy route
  const handleDownload = useCallback(async (media: MediaFile) => {
    setDownloading(media.id);
    try {
      const res = await fetch(`/api/client-media/${media.id}/download`);
      if (!res.ok) throw new Error("Download failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = media.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      toast("Download failed", "error");
    } finally {
      setDownloading(null);
    }
  }, [toast]);

  // Save label
  const saveLabel = async () => {
    if (!selectedMedia) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/client-media/${selectedMedia.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: labelValue }),
      });
      if ((await res.json()).success) {
        toast("Label updated", "success");
        onRefresh();
      }
    } catch { toast("Failed to save", "error"); }
    finally { setSaving(false); setEditingLabel(false); }
  };

  // Save notes
  const saveNotes = async () => {
    if (!selectedMedia) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/client-media/${selectedMedia.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: notesValue }),
      });
      if ((await res.json()).success) {
        toast("Notes updated", "success");
        onRefresh();
      }
    } catch { toast("Failed to save", "error"); }
    finally { setSaving(false); setEditingNotes(false); }
  };

  // Copy URL
  const copyUrl = (url: string) => {
    navigator.clipboard.writeText(url);
    toast("URL copied to clipboard", "success");
  };

  // Handle hover with delay
  const handleMouseEnter = (e: React.MouseEvent, id: string) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setHoverPos({ x: rect.right + 8, y: rect.top });
    if (hoverTimeout.current) clearTimeout(hoverTimeout.current);
    hoverTimeout.current = setTimeout(() => setHoveredId(id), 300);
  };

  const handleMouseLeave = () => {
    if (hoverTimeout.current) clearTimeout(hoverTimeout.current);
    setHoveredId(null);
  };

  // Keyboard nav in viewer
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

  // Escape key exits select mode
  useEffect(() => {
    if (!selectMode) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") exitSelectMode();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectMode]);

  // When selecting a file, set label/notes values
  useEffect(() => {
    if (selectedMedia) {
      setLabelValue(selectedMedia.label || "");
      setNotesValue((selectedMedia as MediaFile & { notes?: string | null }).notes || "");
      setEditingLabel(false);
      setEditingNotes(false);
    }
  }, [selectedId, selectedMedia]);

  return (
    <div ref={dropZoneRef} className="relative">
      {/* Drag overlay */}
      {dragOver && (
        <div className="absolute inset-0 z-50 rounded-xl border-2 border-dashed border-bb-orange bg-bb-orange/5 flex flex-col items-center justify-center pointer-events-none">
          <div className="p-4 rounded-full bg-bb-orange/10 mb-3">
            <Upload size={32} className="text-bb-orange" />
          </div>
          <p className="text-sm font-medium text-bb-orange">Drop files to upload</p>
          <p className="text-xs text-bb-dim mt-1">Photos, videos, audio, and documents</p>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <p className="text-xs text-bb-dim">{mediaFiles.length} files</p>
          {/* Type filter pills */}
          <div className="flex gap-1 ml-2">
            {(["ALL", "IMAGE", "VIDEO", "AUDIO", "DOCUMENT"] as const).map((t) => (
              counts[t] > 0 && (
                <button
                  key={t}
                  onClick={() => setFilter(t)}
                  className={`text-[10px] px-2 py-0.5 rounded-full transition-colors ${
                    filter === t
                      ? "bg-bb-orange/20 text-bb-orange"
                      : "bg-bb-elevated text-bb-dim hover:text-white"
                  }`}
                >
                  {t === "ALL" ? "All" : t === "IMAGE" ? "Images" : t === "VIDEO" ? "Videos" : t === "AUDIO" ? "Audio" : "Docs"} ({counts[t]})
                </button>
              )
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Select mode toggle */}
          {filtered.length > 0 && (
            selectMode ? (
              <div className="flex items-center gap-2">
                <button
                  onClick={selectedIds.size === filtered.length ? deselectAll : selectAll}
                  className="text-[11px] text-bb-dim hover:text-white transition-colors"
                >
                  {selectedIds.size === filtered.length ? "Deselect All" : "Select All"}
                </button>
                <button
                  onClick={exitSelectMode}
                  className="text-[11px] text-bb-dim hover:text-white transition-colors"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => { setSelectMode(true); setSelectedId(null); }}
                className="text-[11px] text-bb-dim hover:text-white flex items-center gap-1 transition-colors"
              >
                <CheckSquare size={13} />
                Select
              </button>
            )
          )}
          <label className="text-bb-orange hover:text-bb-orange-light text-sm flex items-center gap-1 cursor-pointer">
            <Upload size={14} />
            {uploadingMedia ? "Uploading..." : "Upload"}
            <input
              type="file"
              multiple
              accept={ACCEPTED_FILES}
              className="hidden"
              onChange={(e) => e.target.files && onUpload(e.target.files)}
              disabled={uploadingMedia}
            />
          </label>
        </div>
      </div>

      {filtered.length > 0 ? (
        <div className="flex gap-3">
          {/* File Grid */}
          <div className={`grid gap-2 flex-1 ${selectedId && !selectMode ? "grid-cols-2 lg:grid-cols-3" : "grid-cols-3 lg:grid-cols-4"}`}>
            {filtered.map((media, idx) => {
              const isSelected = selectedIds.has(media.id);
              return (
                <div
                  key={media.id}
                  onMouseEnter={(e) => !selectMode && handleMouseEnter(e, media.id)}
                  onMouseLeave={() => !selectMode && handleMouseLeave()}
                  onClick={() => {
                    if (selectMode) {
                      toggleSelect(media.id);
                    } else {
                      setSelectedId(selectedId === media.id ? null : media.id);
                    }
                  }}
                  className={`group relative rounded-lg overflow-hidden bg-bb-black border aspect-square cursor-pointer transition-all ${
                    selectMode && isSelected
                      ? "border-bb-orange ring-1 ring-bb-orange/30"
                      : selectedId === media.id
                      ? "border-bb-orange ring-1 ring-bb-orange/30"
                      : "border-bb-border hover:border-bb-muted"
                  }`}
                >
                  {/* Thumbnail — real preview for images and videos */}
                  {media.fileType === "IMAGE" ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={media.url} alt={media.filename} className="w-full h-full object-cover" />
                  ) : media.fileType === "VIDEO" ? (
                    <VideoThumbnail src={media.url} />
                  ) : media.fileType === "AUDIO" ? (
                    <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-green-500/10 to-transparent">
                      <Music size={28} className="text-green-400 mb-2" />
                      <span className="text-[10px] text-bb-dim truncate max-w-full px-2">{media.filename}</span>
                    </div>
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-orange-500/10 to-transparent">
                      <FileText size={28} className="text-orange-400 mb-2" />
                      <span className="text-[10px] text-bb-dim truncate max-w-full px-2">{media.filename}</span>
                    </div>
                  )}

                  {/* Bottom filename bar — always visible on non-image tiles */}
                  {media.fileType !== "IMAGE" && (
                    <div className="absolute bottom-0 left-0 right-0 px-2 py-1.5 bg-gradient-to-t from-black/80 to-transparent">
                      <p className="text-[10px] text-white truncate">{media.filename}</p>
                      <p className="text-[9px] text-white/50">{formatSize(media.fileSize)}</p>
                    </div>
                  )}

                  {/* Select mode checkbox */}
                  {selectMode && (
                    <div className="absolute top-1.5 left-1.5 z-10">
                      {isSelected ? (
                        <CheckSquare size={18} className="text-bb-orange drop-shadow-md" />
                      ) : (
                        <Square size={18} className="text-white/60 drop-shadow-md" />
                      )}
                    </div>
                  )}

                  {/* Label badge */}
                  {media.label && !selectMode && (
                    <div className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded bg-bb-orange/80 text-[9px] text-white font-medium truncate max-w-[80%]">
                      {media.label}
                    </div>
                  )}

                  {/* Upload source badge */}
                  <div className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded bg-black/60 text-[9px] text-bb-dim">
                    {media.uploadedBy === "client" ? "Client" : "You"}
                  </div>

                  {/* Hover overlay with actions — only in normal mode */}
                  {!selectMode && (
                    <div className="absolute inset-0 bg-black/70 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2">
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={(e) => { e.stopPropagation(); setViewerIndex(idx); }}
                          className="p-1.5 rounded-md bg-white/10 text-white hover:bg-white/20 transition-colors"
                          title="Preview"
                        >
                          <Eye size={14} />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); setSelectedId(selectedId === media.id ? null : media.id); }}
                          className="p-1.5 rounded-md bg-white/10 text-white hover:bg-white/20 transition-colors"
                          title="Info & Edit"
                        >
                          <Info size={14} />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDownload(media); }}
                          className="p-1.5 rounded-md bg-white/10 text-white hover:bg-white/20 transition-colors"
                          title="Download"
                          disabled={downloading === media.id}
                        >
                          <Download size={14} className={downloading === media.id ? "animate-bounce" : ""} />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); copyUrl(media.url); }}
                          className="p-1.5 rounded-md bg-white/10 text-white hover:bg-white/20 transition-colors"
                          title="Copy link"
                        >
                          <Copy size={14} />
                        </button>
                      </div>
                      <span className="text-[10px] text-white font-medium truncate max-w-[90%]">{media.filename}</span>
                      <span className="text-[9px] text-bb-dim">{formatSize(media.fileSize)}</span>
                    </div>
                  )}

                  {/* Select mode dim overlay for selected items */}
                  {selectMode && isSelected && (
                    <div className="absolute inset-0 bg-bb-orange/10 pointer-events-none" />
                  )}
                </div>
              );
            })}
          </div>

          {/* Side panel — file details (hidden in select mode) */}
          {selectedMedia && !selectMode && (
            <div className="w-64 shrink-0 rounded-lg border border-bb-border bg-bb-black p-3 space-y-3 max-h-[500px] overflow-y-auto">
              {/* Preview thumbnail — real preview for images and videos */}
              <div className="rounded-lg overflow-hidden bg-bb-surface aspect-video flex items-center justify-center">
                {selectedMedia.fileType === "IMAGE" ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={selectedMedia.url} alt="" className="w-full h-full object-contain" />
                ) : selectedMedia.fileType === "VIDEO" ? (
                  <video
                    src={selectedMedia.url}
                    controls
                    muted
                    preload="auto"
                    className="w-full h-full object-contain"
                  />
                ) : (
                  getFileIcon(selectedMedia.fileType, 32)
                )}
              </div>

              {/* Filename */}
              <p className="text-sm text-white font-medium truncate" title={selectedMedia.filename}>
                {selectedMedia.filename}
              </p>

              {/* Label field */}
              <div>
                <div className="flex items-center gap-1 mb-1">
                  <Tag size={11} className="text-bb-dim" />
                  <span className="text-[10px] text-bb-dim uppercase tracking-wider">Label</span>
                </div>
                {editingLabel ? (
                  <div className="flex gap-1">
                    <input
                      value={labelValue}
                      onChange={(e) => setLabelValue(e.target.value)}
                      className="flex-1 text-xs bg-bb-surface border border-bb-border rounded px-2 py-1 text-white focus:outline-none focus:border-bb-orange"
                      placeholder="e.g. Logo, Headshot..."
                      autoFocus
                      onKeyDown={(e) => { if (e.key === "Enter") saveLabel(); if (e.key === "Escape") setEditingLabel(false); }}
                    />
                    <button onClick={saveLabel} disabled={saving} className="p-1 text-green-400 hover:text-green-300">
                      <Check size={14} />
                    </button>
                    <button onClick={() => setEditingLabel(false)} className="p-1 text-bb-dim hover:text-white">
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setEditingLabel(true)}
                    className="text-xs text-bb-muted hover:text-white flex items-center gap-1 w-full text-left"
                  >
                    {selectedMedia.label || "Add label..."}
                    <Edit2 size={10} className="ml-auto shrink-0 text-bb-dim" />
                  </button>
                )}
              </div>

              {/* Notes field */}
              <div>
                <div className="flex items-center gap-1 mb-1">
                  <StickyNote size={11} className="text-bb-dim" />
                  <span className="text-[10px] text-bb-dim uppercase tracking-wider">Notes</span>
                </div>
                {editingNotes ? (
                  <div className="space-y-1">
                    <textarea
                      value={notesValue}
                      onChange={(e) => setNotesValue(e.target.value)}
                      rows={3}
                      className="w-full text-xs bg-bb-surface border border-bb-border rounded px-2 py-1 text-white focus:outline-none focus:border-bb-orange resize-none"
                      placeholder="Add notes..."
                      autoFocus
                    />
                    <div className="flex gap-1 justify-end">
                      <button onClick={saveNotes} disabled={saving} className="text-[10px] px-2 py-0.5 rounded bg-bb-orange text-white hover:bg-bb-orange-light">
                        Save
                      </button>
                      <button onClick={() => setEditingNotes(false)} className="text-[10px] px-2 py-0.5 rounded bg-bb-elevated text-bb-dim hover:text-white">
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setEditingNotes(true)}
                    className="text-xs text-bb-muted hover:text-white flex items-center gap-1 w-full text-left"
                  >
                    <span className="line-clamp-2">{(selectedMedia as MediaFile & { notes?: string | null }).notes || "Add notes..."}</span>
                    <Edit2 size={10} className="ml-auto shrink-0 text-bb-dim" />
                  </button>
                )}
              </div>

              {/* Info rows */}
              <div className="space-y-2 pt-2 border-t border-bb-border">
                <div className="flex items-center gap-2">
                  <HardDrive size={11} className="text-bb-dim shrink-0" />
                  <span className="text-[11px] text-bb-dim">Size</span>
                  <span className="text-[11px] text-white ml-auto">{formatSize(selectedMedia.fileSize)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <FileText size={11} className="text-bb-dim shrink-0" />
                  <span className="text-[11px] text-bb-dim">Type</span>
                  <span className="text-[11px] text-white ml-auto">{selectedMedia.mimeType}</span>
                </div>
                <div className="flex items-center gap-2">
                  <User size={11} className="text-bb-dim shrink-0" />
                  <span className="text-[11px] text-bb-dim">Uploaded by</span>
                  <span className="text-[11px] text-white ml-auto">{selectedMedia.uploadedBy === "client" ? "Client" : "You"}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Calendar size={11} className="text-bb-dim shrink-0" />
                  <span className="text-[11px] text-bb-dim">Date</span>
                  <span className="text-[11px] text-white ml-auto">{formatDate(selectedMedia.createdAt)}</span>
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex flex-col gap-1.5 pt-2 border-t border-bb-border">
                <button
                  onClick={() => handleDownload(selectedMedia)}
                  disabled={downloading === selectedMedia.id}
                  className="flex items-center gap-2 text-xs px-3 py-2 rounded-lg bg-bb-elevated text-white hover:bg-bb-border transition-colors w-full"
                >
                  <Download size={13} className={downloading === selectedMedia.id ? "animate-bounce" : ""} />
                  {downloading === selectedMedia.id ? "Downloading..." : "Download"}
                </button>
                <button
                  onClick={() => copyUrl(selectedMedia.url)}
                  className="flex items-center gap-2 text-xs px-3 py-2 rounded-lg bg-bb-elevated text-white hover:bg-bb-border transition-colors w-full"
                >
                  <Copy size={13} />
                  Copy link
                </button>
                <button
                  onClick={() => window.open(selectedMedia.url, "_blank")}
                  className="flex items-center gap-2 text-xs px-3 py-2 rounded-lg bg-bb-elevated text-white hover:bg-bb-border transition-colors w-full"
                >
                  <ExternalLink size={13} />
                  Open in new tab
                </button>
                <button
                  onClick={() => { onDelete(selectedMedia.id); setSelectedId(null); }}
                  className="flex items-center gap-2 text-xs px-3 py-2 rounded-lg bg-bb-elevated text-red-400 hover:bg-red-500/10 transition-colors w-full"
                >
                  <Trash2 size={13} />
                  Delete
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="text-center py-6">
          <ImageIcon size={24} className="mx-auto text-bb-dim mb-2" />
          <p className="text-sm text-bb-dim">No media files yet</p>
          <p className="text-[10px] text-bb-dim mt-1">Drag & drop files here or use the Upload button</p>
        </div>
      )}

      {/* Batch delete toolbar */}
      {selectMode && selectedIds.size > 0 && (
        <div className="sticky bottom-0 mt-3 flex items-center justify-between px-4 py-3 rounded-xl bg-bb-surface border border-bb-border shadow-lg">
          <span className="text-sm text-white font-medium">
            {selectedIds.size} file{selectedIds.size !== 1 ? "s" : ""} selected
          </span>
          <button
            onClick={() => setConfirmDeleteOpen(true)}
            disabled={deleting}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 transition-colors disabled:opacity-50"
          >
            {deleting ? (
              <><Loader2 size={14} className="animate-spin" /> Deleting...</>
            ) : (
              <><Trash2 size={14} /> Delete {selectedIds.size} file{selectedIds.size !== 1 ? "s" : ""}</>
            )}
          </button>
        </div>
      )}

      {/* Batch delete confirmation dialog */}
      <ConfirmDialog
        open={confirmDeleteOpen}
        onClose={() => setConfirmDeleteOpen(false)}
        onConfirm={handleBatchDelete}
        title="Delete Files"
        message={`Are you sure you want to delete ${selectedIds.size} file${selectedIds.size !== 1 ? "s" : ""}? This cannot be undone.`}
        confirmLabel={`Delete ${selectedIds.size} file${selectedIds.size !== 1 ? "s" : ""}`}
        confirmVariant="danger"
        loading={deleting}
      />

      {/* Hover preview tooltip — images and videos */}
      {hoveredMedia && !selectedId && !selectMode && (hoveredMedia.fileType === "IMAGE" || hoveredMedia.fileType === "VIDEO") && (
        <div
          ref={previewRef}
          className="fixed z-[100] pointer-events-none"
          style={{
            left: Math.min(hoverPos.x, window.innerWidth - 220),
            top: Math.max(8, Math.min(hoverPos.y, window.innerHeight - 180)),
          }}
        >
          <div className="w-52 rounded-lg overflow-hidden bg-bb-surface border border-bb-border shadow-modal">
            {hoveredMedia.fileType === "IMAGE" ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={hoveredMedia.url} alt="" className="w-full aspect-video object-cover" />
            ) : (
              <VideoThumbnail src={hoveredMedia.url} className="w-full aspect-video object-cover" showPlayIcon={false} />
            )}
            <div className="px-2 py-1.5">
              <p className="text-[10px] text-white truncate">{hoveredMedia.filename}</p>
              <p className="text-[9px] text-bb-dim">
                {formatSize(hoveredMedia.fileSize)} · {hoveredMedia.uploadedBy === "client" ? "Client" : "You"}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Full-screen viewer */}
      {viewerIndex !== null && filtered[viewerIndex] && (() => {
        const media = filtered[viewerIndex];
        const total = filtered.length;
        return (
          <div
            className="fixed inset-0 z-[200] bg-black/95 flex flex-col"
            onClick={() => setViewerIndex(null)}
          >
            {/* Top bar */}
            <div className="flex items-center justify-between px-4 py-3 shrink-0" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center gap-3 min-w-0">
                <span className="text-sm text-white font-medium truncate max-w-[300px]">{media.filename}</span>
                <span className="text-xs text-bb-dim shrink-0">
                  {formatSize(media.fileSize)}
                  {" · "}{media.uploadedBy === "client" ? "Client" : "You"}
                  {" · "}{viewerIndex + 1} of {total}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleDownload(media)}
                  disabled={downloading === media.id}
                  className="p-2 rounded-lg bg-white/10 text-white hover:bg-white/20 transition-colors"
                  title="Download"
                >
                  <Download size={16} className={downloading === media.id ? "animate-bounce" : ""} />
                </button>
                <button
                  onClick={() => copyUrl(media.url)}
                  className="p-2 rounded-lg bg-white/10 text-white hover:bg-white/20 transition-colors"
                  title="Copy link"
                >
                  <Copy size={16} />
                </button>
                <button
                  onClick={() => window.open(media.url, "_blank")}
                  className="p-2 rounded-lg bg-white/10 text-white hover:bg-white/20 transition-colors"
                  title="Open in new tab"
                >
                  <ExternalLink size={16} />
                </button>
                <button
                  onClick={() => { onDelete(media.id); setViewerIndex(null); }}
                  className="p-2 rounded-lg bg-white/10 text-white hover:bg-red-500 transition-colors"
                  title="Delete"
                >
                  <Trash2 size={16} />
                </button>
                <button
                  onClick={() => setViewerIndex(null)}
                  className="p-2 rounded-lg bg-white/10 text-white hover:bg-white/20 transition-colors"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Main content */}
            <div className="flex-1 flex items-center justify-center relative min-h-0 px-16" onClick={(e) => e.stopPropagation()}>
              {viewerIndex > 0 && (
                <button
                  onClick={() => setViewerIndex(viewerIndex - 1)}
                  className="absolute left-2 top-1/2 -translate-y-1/2 p-3 rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors z-10"
                >
                  <ChevronLeft size={24} />
                </button>
              )}

              {media.fileType === "IMAGE" ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={media.url} alt={media.filename} className="max-w-full max-h-full object-contain rounded-lg" />
              ) : media.fileType === "VIDEO" ? (
                <video src={media.url} controls autoPlay className="max-w-full max-h-full rounded-lg" onClick={(e) => e.stopPropagation()} />
              ) : media.fileType === "AUDIO" ? (
                <div className="flex flex-col items-center gap-4">
                  <div className="w-32 h-32 rounded-2xl bg-white/5 flex items-center justify-center">
                    <Music size={48} className="text-green-400" />
                  </div>
                  <p className="text-white font-medium">{media.filename}</p>
                  <audio src={media.url} controls autoPlay className="w-80" onClick={(e) => e.stopPropagation()} />
                </div>
              ) : media.mimeType === "application/pdf" ? (
                <iframe
                  src={media.url}
                  className="w-full max-w-4xl h-[80vh] rounded-lg bg-white"
                  title={media.filename}
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <div className="flex flex-col items-center gap-4">
                  <div className="w-32 h-32 rounded-2xl bg-white/5 flex items-center justify-center">
                    <FileText size={48} className="text-orange-400" />
                  </div>
                  <p className="text-white font-medium">{media.filename}</p>
                  <p className="text-sm text-bb-dim">{formatSize(media.fileSize)} &middot; {media.mimeType}</p>
                  <button
                    onClick={() => handleDownload(media)}
                    className="px-4 py-2 rounded-lg bg-white/10 text-white hover:bg-white/20 transition-colors text-sm flex items-center gap-2"
                  >
                    <Download size={14} /> Download to view
                  </button>
                </div>
              )}

              {viewerIndex < total - 1 && (
                <button
                  onClick={() => setViewerIndex(viewerIndex + 1)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-3 rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors z-10"
                >
                  <ChevronRight size={24} />
                </button>
              )}
            </div>

            {/* Thumbnail strip */}
            {total > 1 && (
              <div className="shrink-0 px-4 py-3 flex gap-2 justify-center overflow-x-auto" onClick={(e) => e.stopPropagation()}>
                {filtered.map((thumb, i) => (
                  <button
                    key={thumb.id}
                    onClick={() => setViewerIndex(i)}
                    className={`shrink-0 w-14 h-14 rounded-lg overflow-hidden border-2 transition-all ${
                      i === viewerIndex ? "border-bb-orange scale-110" : "border-transparent opacity-50 hover:opacity-100"
                    }`}
                  >
                    {thumb.fileType === "IMAGE" ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={thumb.url} alt="" className="w-full h-full object-cover" />
                    ) : thumb.fileType === "VIDEO" ? (
                      <VideoThumbnail src={thumb.url} showPlayIcon={false} iconSize={10} />
                    ) : thumb.fileType === "AUDIO" ? (
                      <div className="w-full h-full bg-bb-surface flex items-center justify-center">
                        <Music size={14} className="text-green-400" />
                      </div>
                    ) : (
                      <div className="w-full h-full bg-bb-surface flex items-center justify-center">
                        <FileText size={14} className="text-orange-400" />
                      </div>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}
