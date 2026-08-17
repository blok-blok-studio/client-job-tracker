"use client";

import { useMemo, useRef, useState } from "react";
import { upload as vercelBlobUpload } from "@vercel/blob/client";
import {
  Plus, Upload, Link2, Trash2, Pencil, ExternalLink, Copy, Loader2,
  FileText, FileImage, FileVideo, FileAudio, FileArchive, File as FileIcon, HardDrive,
} from "lucide-react";
import { cn } from "@/lib/utils";

export interface ClientFileItem {
  id: string;
  kind: "FILE" | "LINK";
  filename: string;
  url: string;
  fileSize: number | null;
  mimeType: string | null;
  folder: string | null;
  notes: string | null;
  uploadedBy: string;
  createdAt: string;
}

interface ClientFilesPanelProps {
  clientId: string;
  files: ClientFileItem[];
  onRefresh: () => void;
  toast: (message: string, type?: "success" | "error") => void;
}

function formatBytes(bytes: number | null): string {
  if (bytes == null) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function iconFor(file: ClientFileItem) {
  if (file.kind === "LINK") return <Link2 size={16} className="text-sky-400" />;
  const m = file.mimeType || "";
  if (m.startsWith("image/")) return <FileImage size={16} className="text-purple-400" />;
  if (m.startsWith("video/")) return <FileVideo size={16} className="text-purple-400" />;
  if (m.startsWith("audio/")) return <FileAudio size={16} className="text-purple-400" />;
  if (m.includes("zip") || m.includes("compressed") || m.includes("tar")) return <FileArchive size={16} className="text-amber-400" />;
  if (m.includes("pdf") || m.startsWith("text/") || m.includes("document") || m.includes("word")) return <FileText size={16} className="text-bb-orange" />;
  return <FileIcon size={16} className="text-bb-muted" />;
}

// Files clients hand over outside our upload portal (usually a shared Google
// Drive). Upload anything here, or save their Drive folder as a LINK row so
// the access never gets lost in email threads.
export default function ClientFilesPanel({ clientId, files, onRefresh, toast }: ClientFilesPanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState<{ done: number; total: number; percent: number } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploadFolder, setUploadFolder] = useState("");

  const [showLinkForm, setShowLinkForm] = useState(false);
  const [linkLabel, setLinkLabel] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [linkSaving, setLinkSaving] = useState(false);

  const [editing, setEditing] = useState<ClientFileItem | null>(null);
  const [editName, setEditName] = useState("");
  const [editFolder, setEditFolder] = useState("");
  const [editNotes, setEditNotes] = useState("");

  const folders = useMemo(
    () => [...new Set(files.map((f) => f.folder).filter(Boolean) as string[])].sort(),
    [files]
  );

  const grouped = useMemo(() => {
    const map = new Map<string, ClientFileItem[]>();
    for (const f of files) {
      const key = f.folder || "";
      map.set(key, [...(map.get(key) || []), f]);
    }
    // Ungrouped first, then folders alphabetically
    return [...map.entries()].sort((a, b) =>
      a[0] === "" ? -1 : b[0] === "" ? 1 : a[0].localeCompare(b[0])
    );
  }, [files]);

  async function uploadFiles(list: FileList | File[]) {
    const items = [...list];
    if (items.length === 0) return;
    setUploading({ done: 0, total: items.length, percent: 0 });
    let failed = 0;
    let lastError = "";

    // Direct browser → Vercel Blob (multipart, no size limit, no serverless
    // proxy in the middle — the old streaming path hit function limits on big
    // Drive dumps). A few files upload at once; progress is total bytes sent.
    const totalBytes = items.reduce((s, f) => s + f.size, 0) || 1;
    const sentBytes = new Map<number, number>();
    let done = 0;
    let cursor = 0;

    const reportProgress = () => {
      let sent = 0;
      for (const v of sentBytes.values()) sent += v;
      const percent = Math.min(99, Math.round((sent / totalBytes) * 100));
      setUploading({ done, total: items.length, percent });
    };

    const worker = async () => {
      while (cursor < items.length) {
        const index = cursor++;
        const file = items[index];
        try {
          const ext = file.name.includes(".") ? "." + file.name.split(".").pop() : "";
          const blob = await vercelBlobUpload(
            `client-files/${clientId}/${crypto.randomUUID()}${ext}`,
            file,
            {
              access: "public",
              handleUploadUrl: "/api/uploads/blob",
              multipart: true,
              onUploadProgress: ({ loaded }) => {
                sentBytes.set(index, loaded);
                reportProgress();
              },
            }
          );

          const res = await fetch("/api/client-files", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              clientId,
              kind: "FILE",
              filename: file.name,
              url: blob.url,
              fileSize: file.size,
              mimeType: file.type || "application/octet-stream",
              folder: uploadFolder.trim() || null,
            }),
          });
          const json = await res.json().catch(() => null);
          if (!res.ok || !json?.success) throw new Error(json?.error || `Couldn't save ${file.name}`);
          sentBytes.set(index, file.size);
        } catch (err) {
          failed++;
          lastError = err instanceof Error && err.message ? err.message : "Upload failed";
        }
        done++;
        reportProgress();
      }
    };

    await Promise.all(Array.from({ length: Math.min(3, items.length) }, worker));

    setUploading(null);
    if (failed > 0) toast(`${failed} of ${items.length} uploads failed — ${lastError}`, "error");
    else toast(items.length === 1 ? "File added" : `${items.length} files added`, "success");
    onRefresh();
  }

  async function handleAddLink(e: React.FormEvent) {
    e.preventDefault();
    if (!linkUrl.trim()) return;
    setLinkSaving(true);
    try {
      const res = await fetch("/api/client-files", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId,
          kind: "LINK",
          filename: linkLabel.trim() || "Google Drive folder",
          url: linkUrl.trim(),
          folder: uploadFolder.trim() || null,
        }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        setLinkLabel("");
        setLinkUrl("");
        setShowLinkForm(false);
        toast("Link saved", "success");
        onRefresh();
      } else {
        toast(json?.error || "Failed to save link", "error");
      }
    } finally {
      setLinkSaving(false);
    }
  }

  async function handleDelete(file: ClientFileItem) {
    const what = file.kind === "LINK" ? "link" : "file";
    if (!window.confirm(`Remove ${what} "${file.filename}"?`)) return;
    const res = await fetch(`/api/client-files/${file.id}`, { method: "DELETE" });
    const json = await res.json();
    if (res.ok && json.success) {
      toast(`${file.kind === "LINK" ? "Link" : "File"} removed`, "success");
      onRefresh();
    } else {
      toast(json?.error || "Failed to remove", "error");
    }
  }

  function startEdit(file: ClientFileItem) {
    setEditing(file);
    setEditName(file.filename);
    setEditFolder(file.folder || "");
    setEditNotes(file.notes || "");
  }

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    const res = await fetch(`/api/client-files/${editing.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename: editName.trim() || editing.filename, folder: editFolder.trim() || null, notes: editNotes.trim() || null }),
    });
    const json = await res.json();
    if (res.ok && json.success) {
      setEditing(null);
      onRefresh();
    } else {
      toast(json?.error || "Failed to update", "error");
    }
  }

  const inputCls =
    "w-full px-3 py-2 bg-bb-surface border border-bb-border rounded-md text-white placeholder:text-bb-dim text-sm focus:outline-none focus:ring-2 focus:ring-bb-orange/50";

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        if (e.dataTransfer.files?.length) uploadFiles(e.dataTransfer.files);
      }}
    >
      <div className="flex items-center justify-between gap-2 flex-wrap mb-4">
        <p className="text-xs text-bb-dim">
          Files the client handed over (Drive, email, etc.) — any file type
        </p>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowLinkForm((s) => !s)}
            className="text-bb-orange hover:text-bb-orange-light text-sm flex items-center gap-1"
          >
            <Link2 size={14} /> Save Drive link
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="text-bb-orange hover:text-bb-orange-light text-sm flex items-center gap-1"
          >
            <Plus size={14} /> Upload files
          </button>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) uploadFiles(e.target.files);
          e.target.value = "";
        }}
      />

      {/* Folder to file new uploads/links under */}
      <div className="flex items-center gap-2 mb-3">
        <input
          type="text"
          value={uploadFolder}
          onChange={(e) => setUploadFolder(e.target.value)}
          list="client-file-folders"
          placeholder="Folder for new uploads (optional) — e.g. Brand assets"
          className={cn(inputCls, "max-w-sm bg-bb-black")}
        />
        <datalist id="client-file-folders">
          {folders.map((f) => <option key={f} value={f} />)}
        </datalist>
      </div>

      {showLinkForm && (
        <form onSubmit={handleAddLink} className="mb-4 p-3 bg-bb-black border border-bb-border rounded-lg space-y-2">
          <input
            type="text"
            value={linkLabel}
            onChange={(e) => setLinkLabel(e.target.value)}
            placeholder='Label — e.g. "Their Drive folder — brand assets"'
            className={inputCls}
            autoFocus
          />
          <input
            type="url"
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            placeholder="https://drive.google.com/drive/folders/…"
            className={inputCls}
          />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setShowLinkForm(false)} className="px-3 py-1.5 text-xs text-bb-muted hover:text-white transition-colors">
              Cancel
            </button>
            <button
              type="submit"
              disabled={linkSaving || !linkUrl.trim()}
              className="px-3 py-1.5 bg-bb-orange hover:bg-bb-orange-light disabled:opacity-50 text-white text-xs font-medium rounded-md transition-colors"
            >
              {linkSaving ? "Saving…" : "Save link"}
            </button>
          </div>
        </form>
      )}

      {uploading && (
        <div className="mb-3 space-y-1.5">
          <div className="flex items-center gap-2 text-sm text-bb-muted">
            <Loader2 size={15} className="animate-spin text-bb-orange" />
            Uploading {Math.min(uploading.done + 1, uploading.total)} of {uploading.total} — {uploading.percent}%
          </div>
          <div className="h-1.5 bg-bb-black border border-bb-border rounded-full overflow-hidden max-w-sm">
            <div
              className="h-full bg-bb-orange transition-all duration-200"
              style={{ width: `${uploading.percent}%` }}
            />
          </div>
        </div>
      )}

      {dragOver && (
        <div className="mb-3 border-2 border-dashed border-bb-orange/60 rounded-lg p-6 text-center text-sm text-bb-orange bg-bb-orange/5">
          Drop to upload to this client
        </div>
      )}

      {files.length === 0 && !uploading ? (
        <div className="text-center py-8">
          <HardDrive size={24} className="mx-auto text-bb-dim mb-2" />
          <p className="text-sm text-bb-dim">Nothing handed over yet.</p>
          <p className="text-xs text-bb-dim mt-1">
            Drag files anywhere here, or save their Google Drive link so the access is never lost.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {grouped.map(([folder, items]) => (
            <div key={folder || "__ungrouped"}>
              {folder && (
                <p className="text-xs font-medium text-bb-muted mb-1.5">{folder}</p>
              )}
              <div className="space-y-1.5">
                {items.map((f) => (
                  <div key={f.id} className="p-3 rounded-lg bg-bb-black border border-bb-border">
                    <div className="flex items-center gap-2.5">
                      <span className="shrink-0">{iconFor(f)}</span>
                      <div className="min-w-0 flex-1">
                        <a
                          href={f.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-white hover:text-bb-orange transition-colors truncate block"
                          title={f.kind === "LINK" ? "Open link" : "Open / download"}
                        >
                          {f.filename}
                        </a>
                        <p className="text-[11px] text-bb-dim truncate">
                          {f.kind === "LINK" ? "external link" : formatBytes(f.fileSize)}
                          {" · "}{f.uploadedBy}
                          {" · "}{new Date(f.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                          {f.notes ? ` · ${f.notes}` : ""}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <a
                          href={f.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1 text-bb-dim hover:text-white transition-colors"
                          title="Open in new tab"
                        >
                          <ExternalLink size={13} />
                        </a>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(f.url);
                            toast("Link copied", "success");
                          }}
                          className="p-1 text-bb-dim hover:text-white transition-colors"
                          title="Copy link"
                        >
                          <Copy size={13} />
                        </button>
                        <button
                          onClick={() => startEdit(f)}
                          className="p-1 text-bb-dim hover:text-white transition-colors"
                          title="Rename / move / annotate"
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          onClick={() => handleDelete(f)}
                          className="p-1 text-bb-dim hover:text-red-400 transition-colors"
                          title="Remove"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>

                    {editing?.id === f.id && (
                      <form onSubmit={handleEdit} className="mt-2 space-y-2">
                        <input value={editName} onChange={(e) => setEditName(e.target.value)} className={inputCls} placeholder="Name" />
                        <div className="grid grid-cols-2 gap-2">
                          <input value={editFolder} onChange={(e) => setEditFolder(e.target.value)} list="client-file-folders" className={inputCls} placeholder="Folder" />
                          <input value={editNotes} onChange={(e) => setEditNotes(e.target.value)} className={inputCls} placeholder="Notes" />
                        </div>
                        <div className="flex justify-end gap-2">
                          <button type="button" onClick={() => setEditing(null)} className="px-3 py-1.5 text-xs text-bb-muted hover:text-white transition-colors">
                            Cancel
                          </button>
                          <button type="submit" className="px-3 py-1.5 bg-bb-orange hover:bg-bb-orange-light text-white text-xs font-medium rounded-md transition-colors">
                            Save
                          </button>
                        </div>
                      </form>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {files.length > 0 && (
        <p className="text-[11px] text-bb-dim mt-3 flex items-center gap-1">
          <Upload size={11} /> Drag files anywhere in this panel to upload
        </p>
      )}
    </div>
  );
}
