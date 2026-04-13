"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Download, Trash2, X, ChevronLeft, ChevronRight,
  Music, ExternalLink, Upload,
  Edit2, Check, Copy, Info, Eye, FileText, Search,
  Calendar, User, HardDrive, Tag, StickyNote,
  FolderOpen, Grid, List, Users, Loader2,
} from "lucide-react";
import TopBar from "@/components/layout/TopBar";
import VideoThumbnail from "@/components/shared/VideoThumbnail";
import { useToast } from "@/components/shared/Toast";

interface MediaFile {
  id: string;
  url: string;
  filename: string;
  fileType: string;
  fileSize: number;
  mimeType: string;
  uploadedBy: string;
  label: string | null;
  notes: string | null;
  createdAt: string;
  client: { id: string; name: string; company: string | null; type: string };
}

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

export default function FilesPage() {
  const { toast } = useToast();
  const [files, setFiles] = useState<MediaFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<"ALL" | "IMAGE" | "VIDEO" | "AUDIO" | "DOCUMENT">("ALL");
  const [filterClient, setFilterClient] = useState<string>("ALL");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [editingLabel, setEditingLabel] = useState(false);
  const [labelValue, setLabelValue] = useState("");
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesValue, setNotesValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [hoverPos, setHoverPos] = useState({ x: 0, y: 0 });
  const [allClients, setAllClients] = useState<{ id: string; name: string }[]>([]);
  const hoverTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragCounter = useRef(0);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Drag-and-drop upload handlers
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current++;
    if (e.dataTransfer.types.includes("Files")) setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current === 0) setDragOver(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current = 0;
    setDragOver(false);

    const droppedFiles = e.dataTransfer.files;
    if (!droppedFiles.length) return;

    // Need a client selected to know where to upload
    if (filterClient === "ALL") {
      toast("Select a client from the dropdown first, then drag files to upload", "error");
      return;
    }

    setUploading(true);
    try {
      let successCount = 0;
      for (const file of Array.from(droppedFiles)) {
        // Stream upload to get blob URL
        const params = new URLSearchParams({ filename: file.name });
        const uploadRes = await fetch(`/api/uploads/stream?${params}`, {
          method: "PUT",
          headers: { "Content-Type": file.type || "application/octet-stream" },
          body: file,
        });
        const uploadData = await uploadRes.json();
        if (!uploadData.success || !uploadData.urls?.[0]) continue;

        // Register as client media
        await fetch("/api/client-media", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            clientId: filterClient,
            url: uploadData.urls[0],
            filename: file.name,
            fileType: file.type,
            fileSize: file.size,
          }),
        });
        successCount++;
      }
      if (successCount > 0) {
        toast(`${successCount} file${successCount !== 1 ? "s" : ""} uploaded`, "success");
        fetchFiles();
      }
    } catch {
      toast("Upload failed", "error");
    } finally {
      setUploading(false);
    }
  }, [filterClient, toast, fetchFiles]);

  // Fetch full client list once (for dropdown)
  useEffect(() => {
    fetch("/api/clients").then((r) => r.json()).then((d) => {
      if (d.success) setAllClients(d.data.map((c: { id: string; name: string }) => ({ id: c.id, name: c.name })));
    }).catch(() => {});
  }, []);

  const fetchFiles = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (filterType !== "ALL") params.set("fileType", filterType);
      if (search) params.set("search", search);
      if (filterClient !== "ALL") params.set("clientId", filterClient);
      const res = await fetch(`/api/client-media?${params}`);
      const data = await res.json();
      if (data.success) setFiles(data.data);
    } catch { /* silently fail */ }
    finally { setLoading(false); }
  }, [filterType, search, filterClient]);

  useEffect(() => { fetchFiles(); }, [fetchFiles]);

  // Derived
  const selectedMedia = selectedId ? files.find((m) => m.id === selectedId) : null;
  const filtered = files; // already filtered by API

  const counts = {
    ALL: files.length,
    IMAGE: files.filter((m) => m.fileType === "IMAGE").length,
    VIDEO: files.filter((m) => m.fileType === "VIDEO").length,
    AUDIO: files.filter((m) => m.fileType === "AUDIO").length,
    DOCUMENT: files.filter((m) => m.fileType === "DOCUMENT").length,
  };

  const totalSize = files.reduce((acc, f) => acc + f.fileSize, 0);

  // Download via proxy
  const handleDownload = async (media: MediaFile) => {
    setDownloading(media.id);
    try {
      const res = await fetch(`/api/client-media/${media.id}/download`);
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = media.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch { toast("Download failed", "error"); }
    finally { setDownloading(null); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this file? This cannot be undone.")) return;
    try {
      await fetch(`/api/client-media/${id}`, { method: "DELETE" });
      setFiles((prev) => prev.filter((f) => f.id !== id));
      if (selectedId === id) setSelectedId(null);
      toast("File deleted", "success");
    } catch { toast("Failed to delete", "error"); }
  };

  const copyUrl = (url: string) => {
    navigator.clipboard.writeText(url);
    toast("URL copied", "success");
  };

  const saveLabel = async () => {
    if (!selectedMedia) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/client-media/${selectedMedia.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: labelValue }),
      });
      if ((await res.json()).success) { toast("Label updated", "success"); fetchFiles(); }
    } catch { toast("Failed to save", "error"); }
    finally { setSaving(false); setEditingLabel(false); }
  };

  const saveNotes = async () => {
    if (!selectedMedia) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/client-media/${selectedMedia.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: notesValue }),
      });
      if ((await res.json()).success) { toast("Notes updated", "success"); fetchFiles(); }
    } catch { toast("Failed to save", "error"); }
    finally { setSaving(false); setEditingNotes(false); }
  };

  // When selecting, sync label/notes
  useEffect(() => {
    if (selectedMedia) {
      setLabelValue(selectedMedia.label || "");
      setNotesValue(selectedMedia.notes || "");
      setEditingLabel(false);
      setEditingNotes(false);
    }
  }, [selectedId, selectedMedia]);

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

  const hoveredMedia = hoveredId ? files.find((m) => m.id === hoveredId) : null;

  return (
    <div
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      className="relative"
    >
      {/* Drag overlay */}
      {dragOver && (
        <div className="fixed inset-0 z-[100] bg-black/60 flex items-center justify-center pointer-events-none">
          <div className="flex flex-col items-center gap-3 p-8 rounded-2xl border-2 border-dashed border-bb-orange bg-bb-orange/5">
            <div className="p-4 rounded-full bg-bb-orange/10">
              <Upload size={32} className="text-bb-orange" />
            </div>
            <p className="text-lg font-medium text-bb-orange">Drop files to upload</p>
            <p className="text-sm text-bb-dim">
              {filterClient !== "ALL"
                ? `Upload to ${allClients.find((c) => c.id === filterClient)?.name || "selected client"}`
                : "Select a client first to upload"}
            </p>
          </div>
        </div>
      )}

      {/* Upload progress overlay */}
      {uploading && (
        <div className="fixed inset-0 z-[100] bg-black/60 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3 p-8 rounded-2xl bg-bb-surface border border-bb-border">
            <Loader2 size={32} className="text-bb-orange animate-spin" />
            <p className="text-sm text-white">Uploading files...</p>
          </div>
        </div>
      )}

      <TopBar title="Files" subtitle="All client media files" />
      <div className="px-4 lg:px-6 pb-8">

        {/* Stats bar */}
        <div className="flex items-center gap-4 mb-4 flex-wrap">
          <div className="flex items-center gap-2 text-xs text-bb-dim">
            <FolderOpen size={14} />
            <span>{files.length} files</span>
            <span className="text-bb-border">|</span>
            <span>{formatSize(totalSize)} total</span>
            <span className="text-bb-border">|</span>
            <span>{allClients.length} clients</span>
          </div>
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-bb-dim" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search files..."
              className="w-full pl-9 pr-3 py-2 text-sm bg-bb-black border border-bb-border rounded-lg text-white placeholder:text-bb-dim focus:outline-none focus:border-bb-orange"
            />
          </div>

          {/* Type pills */}
          <div className="flex gap-1">
            {(["ALL", "IMAGE", "VIDEO", "AUDIO", "DOCUMENT"] as const).map((t) => (
              counts[t] > 0 && (
                <button
                  key={t}
                  onClick={() => setFilterType(t)}
                  className={`text-[11px] px-2.5 py-1 rounded-full transition-colors ${
                    filterType === t
                      ? "bg-bb-orange/20 text-bb-orange"
                      : "bg-bb-elevated text-bb-dim hover:text-white"
                  }`}
                >
                  {t === "ALL" ? "All" : t === "IMAGE" ? "Images" : t === "VIDEO" ? "Videos" : t === "AUDIO" ? "Audio" : "Docs"}
                  {` (${counts[t]})`}
                </button>
              )
            ))}
          </div>

          {/* Client filter */}
          <select
            value={filterClient}
            onChange={(e) => setFilterClient(e.target.value)}
            className="text-xs bg-bb-black border border-bb-border rounded-lg px-3 py-2 text-white focus:outline-none focus:border-bb-orange"
          >
            <option value="ALL">All clients</option>
            {allClients.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>

          {/* View toggle */}
          <div className="flex border border-bb-border rounded-lg overflow-hidden">
            <button
              onClick={() => setViewMode("grid")}
              className={`p-2 ${viewMode === "grid" ? "bg-bb-orange/20 text-bb-orange" : "bg-bb-black text-bb-dim hover:text-white"}`}
            >
              <Grid size={14} />
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={`p-2 ${viewMode === "list" ? "bg-bb-orange/20 text-bb-orange" : "bg-bb-black text-bb-dim hover:text-white"}`}
            >
              <List size={14} />
            </button>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-12 text-bb-dim">Loading files...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12">
            <FolderOpen size={32} className="mx-auto text-bb-dim mb-3" />
            <p className="text-bb-dim">No files found</p>
            {search && <p className="text-xs text-bb-dim mt-1">Try a different search term</p>}
          </div>
        ) : (
          <div className="flex gap-4">
            {/* Main content */}
            <div className="flex-1 min-w-0">
              {viewMode === "grid" ? (
                /* ──── Grid View ──── */
                <div className={`grid gap-2 ${selectedId ? "grid-cols-3 lg:grid-cols-4" : "grid-cols-3 lg:grid-cols-5 xl:grid-cols-6"}`}>
                  {filtered.map((media, idx) => (
                    <div
                      key={media.id}
                      onMouseEnter={(e) => handleMouseEnter(e, media.id)}
                      onMouseLeave={handleMouseLeave}
                      className={`group relative rounded-lg overflow-hidden bg-bb-black border aspect-square cursor-pointer transition-all ${
                        selectedId === media.id
                          ? "border-bb-orange ring-1 ring-bb-orange/30"
                          : "border-bb-border hover:border-bb-muted"
                      }`}
                    >
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

                      {/* Label */}
                      {media.label && (
                        <div className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded bg-bb-orange/80 text-[9px] text-white font-medium truncate max-w-[70%]">
                          {media.label}
                        </div>
                      )}

                      {/* Client name badge */}
                      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent px-2 py-1.5">
                        <span className="text-[9px] text-white/80 truncate block">{media.client.name}</span>
                      </div>

                      {/* Hover overlay */}
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
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDelete(media.id); }}
                            className="p-1.5 rounded-md bg-white/10 text-red-400 hover:bg-red-500/20 transition-colors"
                            title="Delete"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                        <span className="text-[10px] text-white font-medium truncate max-w-[90%]">{media.filename}</span>
                        <span className="text-[9px] text-bb-dim">{formatSize(media.fileSize)} · {media.client.name}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                /* ──── List View ──── */
                <div className="border border-bb-border rounded-lg overflow-hidden">
                  <div className="grid grid-cols-[auto_1fr_120px_100px_100px_80px] gap-3 px-4 py-2 bg-bb-elevated text-[10px] text-bb-dim uppercase tracking-wider border-b border-bb-border">
                    <span className="w-10">Type</span>
                    <span>Name</span>
                    <span>Client</span>
                    <span>Size</span>
                    <span>Date</span>
                    <span>Actions</span>
                  </div>
                  {filtered.map((media, idx) => (
                    <div
                      key={media.id}
                      onClick={() => setSelectedId(selectedId === media.id ? null : media.id)}
                      className={`grid grid-cols-[auto_1fr_120px_100px_100px_80px] gap-3 px-4 py-2.5 items-center cursor-pointer transition-colors border-b border-bb-border last:border-0 ${
                        selectedId === media.id
                          ? "bg-bb-orange/5"
                          : "hover:bg-bb-elevated/50"
                      }`}
                    >
                      <div className="w-10 h-10 rounded-md overflow-hidden bg-bb-black border border-bb-border shrink-0">
                        {media.fileType === "IMAGE" ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={media.url} alt="" className="w-full h-full object-cover" />
                        ) : media.fileType === "VIDEO" ? (
                          <VideoThumbnail src={media.url} showPlayIcon={false} />
                        ) : media.fileType === "AUDIO" ? (
                          <div className="w-full h-full flex items-center justify-center"><Music size={16} className="text-green-400" /></div>
                        ) : (
                          <div className="w-full h-full flex items-center justify-center"><FileText size={16} className="text-orange-400" /></div>
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm text-white truncate">{media.filename}</p>
                        {media.label && <p className="text-[10px] text-bb-orange truncate">{media.label}</p>}
                      </div>
                      <span className="text-xs text-bb-muted truncate">{media.client.name}</span>
                      <span className="text-xs text-bb-dim">{formatSize(media.fileSize)}</span>
                      <span className="text-xs text-bb-dim">{formatDate(media.createdAt)}</span>
                      <div className="flex items-center gap-1">
                        <button onClick={(e) => { e.stopPropagation(); setViewerIndex(idx); }} className="p-1 rounded text-bb-dim hover:text-white" title="Preview">
                          <Eye size={13} />
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); handleDownload(media); }} className="p-1 rounded text-bb-dim hover:text-white" title="Download">
                          <Download size={13} />
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); handleDelete(media.id); }} className="p-1 rounded text-bb-dim hover:text-red-400" title="Delete">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ──── Side Panel ──── */}
            {selectedMedia && (
              <div className="w-72 shrink-0 rounded-lg border border-bb-border bg-bb-black p-4 space-y-3 sticky top-4 max-h-[calc(100vh-120px)] overflow-y-auto">
                {/* Close */}
                <div className="flex justify-between items-center">
                  <span className="text-xs text-bb-dim uppercase tracking-wider">File Details</span>
                  <button onClick={() => setSelectedId(null)} className="p-1 text-bb-dim hover:text-white"><X size={14} /></button>
                </div>

                {/* Preview */}
                <div className="rounded-lg overflow-hidden bg-bb-surface aspect-video flex items-center justify-center">
                  {selectedMedia.fileType === "IMAGE" ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={selectedMedia.url} alt="" className="w-full h-full object-contain" />
                  ) : selectedMedia.fileType === "VIDEO" ? (
                    <video src={selectedMedia.url} controls muted preload="auto" className="w-full h-full object-contain" />
                  ) : selectedMedia.fileType === "AUDIO" ? (
                    <Music size={32} className="text-green-400" />
                  ) : (
                    <FileText size={32} className="text-orange-400" />
                  )}
                </div>

                {/* Filename */}
                <p className="text-sm text-white font-medium break-all">{selectedMedia.filename}</p>

                {/* Client link */}
                <a href={`/clients/${selectedMedia.client.id}`} className="flex items-center gap-1.5 text-xs text-bb-orange hover:text-bb-orange-light">
                  <Users size={11} />
                  {selectedMedia.client.name}
                  {selectedMedia.client.company && <span className="text-bb-dim"> · {selectedMedia.client.company}</span>}
                </a>

                {/* Label */}
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
                      <button onClick={saveLabel} disabled={saving} className="p-1 text-green-400 hover:text-green-300"><Check size={14} /></button>
                      <button onClick={() => setEditingLabel(false)} className="p-1 text-bb-dim hover:text-white"><X size={14} /></button>
                    </div>
                  ) : (
                    <button onClick={() => setEditingLabel(true)} className="text-xs text-bb-muted hover:text-white flex items-center gap-1 w-full text-left">
                      {selectedMedia.label || "Add label..."}
                      <Edit2 size={10} className="ml-auto shrink-0 text-bb-dim" />
                    </button>
                  )}
                </div>

                {/* Notes */}
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
                        <button onClick={saveNotes} disabled={saving} className="text-[10px] px-2 py-0.5 rounded bg-bb-orange text-white hover:bg-bb-orange-light">Save</button>
                        <button onClick={() => setEditingNotes(false)} className="text-[10px] px-2 py-0.5 rounded bg-bb-elevated text-bb-dim hover:text-white">Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <button onClick={() => setEditingNotes(true)} className="text-xs text-bb-muted hover:text-white flex items-center gap-1 w-full text-left">
                      <span className="line-clamp-2">{selectedMedia.notes || "Add notes..."}</span>
                      <Edit2 size={10} className="ml-auto shrink-0 text-bb-dim" />
                    </button>
                  )}
                </div>

                {/* Info */}
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

                {/* Actions */}
                <div className="flex flex-col gap-1.5 pt-2 border-t border-bb-border">
                  <button onClick={() => handleDownload(selectedMedia)} disabled={downloading === selectedMedia.id}
                    className="flex items-center gap-2 text-xs px-3 py-2 rounded-lg bg-bb-elevated text-white hover:bg-bb-border transition-colors w-full">
                    <Download size={13} className={downloading === selectedMedia.id ? "animate-bounce" : ""} />
                    {downloading === selectedMedia.id ? "Downloading..." : "Download"}
                  </button>
                  <button onClick={() => copyUrl(selectedMedia.url)}
                    className="flex items-center gap-2 text-xs px-3 py-2 rounded-lg bg-bb-elevated text-white hover:bg-bb-border transition-colors w-full">
                    <Copy size={13} /> Copy link
                  </button>
                  <button onClick={() => window.open(selectedMedia.url, "_blank")}
                    className="flex items-center gap-2 text-xs px-3 py-2 rounded-lg bg-bb-elevated text-white hover:bg-bb-border transition-colors w-full">
                    <ExternalLink size={13} /> Open in new tab
                  </button>
                  <button onClick={() => handleDelete(selectedMedia.id)}
                    className="flex items-center gap-2 text-xs px-3 py-2 rounded-lg bg-bb-elevated text-red-400 hover:bg-red-500/10 transition-colors w-full">
                    <Trash2 size={13} /> Delete
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Hover preview tooltip */}
        {hoveredMedia && !selectedId && (hoveredMedia.fileType === "IMAGE" || hoveredMedia.fileType === "VIDEO") && (
          <div
            className="fixed z-[100] pointer-events-none"
            style={{
              left: Math.min(hoverPos.x, typeof window !== "undefined" ? window.innerWidth - 220 : 800),
              top: Math.max(8, Math.min(hoverPos.y, typeof window !== "undefined" ? window.innerHeight - 180 : 600)),
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
                <p className="text-[9px] text-bb-dim">{formatSize(hoveredMedia.fileSize)} · {hoveredMedia.client.name}</p>
              </div>
            </div>
          </div>
        )}

        {/* Full-screen viewer */}
        {viewerIndex !== null && filtered[viewerIndex] && (() => {
          const media = filtered[viewerIndex];
          const total = filtered.length;
          return (
            <div className="fixed inset-0 z-[200] bg-black/95 flex flex-col" onClick={() => setViewerIndex(null)}>
              <div className="flex items-center justify-between px-4 py-3 shrink-0" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-sm text-white font-medium truncate max-w-[300px]">{media.filename}</span>
                  <span className="text-xs text-bb-dim shrink-0">
                    {formatSize(media.fileSize)} · {media.client.name} · {media.uploadedBy === "client" ? "Client" : "You"} · {viewerIndex + 1} of {total}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => handleDownload(media)} className="p-2 rounded-lg bg-white/10 text-white hover:bg-white/20 transition-colors" title="Download">
                    <Download size={16} />
                  </button>
                  <button onClick={() => copyUrl(media.url)} className="p-2 rounded-lg bg-white/10 text-white hover:bg-white/20 transition-colors" title="Copy link">
                    <Copy size={16} />
                  </button>
                  <button onClick={() => window.open(media.url, "_blank")} className="p-2 rounded-lg bg-white/10 text-white hover:bg-white/20 transition-colors" title="Open">
                    <ExternalLink size={16} />
                  </button>
                  <button onClick={() => handleDelete(media.id)} className="p-2 rounded-lg bg-white/10 text-white hover:bg-red-500 transition-colors" title="Delete">
                    <Trash2 size={16} />
                  </button>
                  <button onClick={() => setViewerIndex(null)} className="p-2 rounded-lg bg-white/10 text-white hover:bg-white/20 transition-colors">
                    <X size={16} />
                  </button>
                </div>
              </div>

              <div className="flex-1 flex items-center justify-center relative min-h-0 px-16" onClick={(e) => e.stopPropagation()}>
                {viewerIndex > 0 && (
                  <button onClick={() => setViewerIndex(viewerIndex - 1)} className="absolute left-2 top-1/2 -translate-y-1/2 p-3 rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors z-10">
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
                  <iframe src={media.url} className="w-full max-w-4xl h-[80vh] rounded-lg bg-white" title={media.filename}
                    onClick={(e) => e.stopPropagation()} />
                ) : (
                  <div className="flex flex-col items-center gap-4">
                    <div className="w-32 h-32 rounded-2xl bg-white/5 flex items-center justify-center">
                      <FileText size={48} className="text-orange-400" />
                    </div>
                    <p className="text-white font-medium">{media.filename}</p>
                    <p className="text-sm text-bb-dim">{formatSize(media.fileSize)} &middot; {media.mimeType}</p>
                    <button onClick={() => handleDownload(media)}
                      className="px-4 py-2 rounded-lg bg-white/10 text-white hover:bg-white/20 transition-colors text-sm flex items-center gap-2">
                      <Download size={14} /> Download to view
                    </button>
                  </div>
                )}
                {viewerIndex < total - 1 && (
                  <button onClick={() => setViewerIndex(viewerIndex + 1)} className="absolute right-2 top-1/2 -translate-y-1/2 p-3 rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors z-10">
                    <ChevronRight size={24} />
                  </button>
                )}
              </div>

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
                        <div className="w-full h-full bg-bb-surface flex items-center justify-center"><Music size={14} className="text-green-400" /></div>
                      ) : (
                        <div className="w-full h-full bg-bb-surface flex items-center justify-center"><FileText size={14} className="text-orange-400" /></div>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })()}
      </div>
    </div>
  );
}
