"use client";

import { useRef, useState } from "react";
import {
  Plus, X, Copy, ExternalLink, Loader2, Trash2, Upload, FileText,
  Check, Pencil, Clock, Send, Package, FolderUp,
} from "lucide-react";
import { uploadFile } from "@/lib/client-upload";
import ConfirmDialog from "@/components/shared/ConfirmDialog";

export interface DeliverableItem {
  id: string;
  token: string;
  title: string;
  message: string | null;
  content: string | null;
  status: string; // PENDING_REVIEW | APPROVED | REVISION_REQUESTED
  revisionNotes: string | null;
  respondedBy: string | null;
  respondedAt: string | null;
  revisionCount: number;
  createdBy: string | null;
  createdAt: string;
  files: Array<{ id: string; url: string; filename: string; fileSize: number; mimeType: string; folder?: string | null }>;
}

interface PendingFile {
  url: string;
  filename: string;
  fileSize: number;
  mimeType: string;
  folder: string | null;
}

interface PickedFile {
  file: File;
  folder: string | null;
}

interface Props {
  clientId: string;
  deliverables: DeliverableItem[];
  onRefresh: () => void;
  toast: (msg: string, type: "success" | "error") => void;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const MAX_FILES = 100;

/** OS junk that comes along when a whole folder is picked or dropped. */
function isJunkFile(name: string): boolean {
  return name.startsWith(".") || name === "Thumbs.db" || name === "desktop.ini";
}

/** Directory part of a relative path ("Carousel 1/img.jpg" → "Carousel 1"), null for root. */
function folderOf(relativePath: string | undefined): string | null {
  if (!relativePath) return null;
  const idx = relativePath.lastIndexOf("/");
  return idx > 0 ? relativePath.slice(0, idx) : null;
}

/** Collect files from a drop, walking folders recursively and keeping their paths. */
async function filesFromDataTransfer(dt: DataTransfer): Promise<PickedFile[]> {
  const out: PickedFile[] = [];

  async function walk(entry: FileSystemEntry, folder: string | null): Promise<void> {
    if (entry.isFile) {
      const file = await new Promise<File>((resolve, reject) =>
        (entry as FileSystemFileEntry).file(resolve, reject)
      );
      if (!isJunkFile(file.name)) out.push({ file, folder });
    } else if (entry.isDirectory) {
      const dirPath = folder ? `${folder}/${entry.name}` : entry.name;
      const reader = (entry as FileSystemDirectoryEntry).createReader();
      // readEntries returns batches (≤100); keep reading until empty
      let batch: FileSystemEntry[];
      do {
        batch = await new Promise<FileSystemEntry[]>((resolve, reject) =>
          reader.readEntries(resolve, reject)
        );
        for (const e of batch) await walk(e, dirPath);
      } while (batch.length > 0);
    }
  }

  const entries = Array.from(dt.items)
    .map((i) => i.webkitGetAsEntry?.())
    .filter(Boolean) as FileSystemEntry[];

  if (entries.length > 0) {
    for (const e of entries) await walk(e, null);
    return out;
  }
  return Array.from(dt.files)
    .filter((f) => !isJunkFile(f.name))
    .map((file) => ({ file, folder: null }));
}

const STATUS_META: Record<string, { label: string; classes: string; icon: React.ReactNode }> = {
  PENDING_REVIEW: {
    label: "Awaiting review",
    classes: "bg-yellow-500/10 text-yellow-400 border-yellow-500/30",
    icon: <Clock size={11} />,
  },
  APPROVED: {
    label: "Approved",
    classes: "bg-green-500/10 text-green-400 border-green-500/30",
    icon: <Check size={11} />,
  },
  REVISION_REQUESTED: {
    label: "Revision requested",
    classes: "bg-bb-orange/10 text-bb-orange border-bb-orange/30",
    icon: <Pencil size={11} />,
  },
};

export default function DeliverablesPanel({ clientId, deliverables, onRefresh, toast }: Props) {
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [content, setContent] = useState("");
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [resubmittingId, setResubmittingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeliverableItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  async function handleFilesSelected(list: FileList | PickedFile[] | null) {
    if (!list || list.length === 0) return;
    // FileList comes from the pickers — folder picker files carry webkitRelativePath
    const picked: PickedFile[] = Array.isArray(list)
      ? list
      : Array.from(list).map((file) => ({
          file,
          folder: folderOf((file as File & { webkitRelativePath?: string }).webkitRelativePath),
        }));
    const files = picked.filter((p) => !isJunkFile(p.file.name));
    if (files.length === 0) return;
    if (pendingFiles.length + files.length > MAX_FILES) {
      toast(`Max ${MAX_FILES} files per deliverable — trim the selection`, "error");
      return;
    }
    setUploading(true);
    try {
      for (let i = 0; i < files.length; i++) {
        const { file: f, folder } = files[i];
        setUploadProgress(`Uploading ${f.name} (${i + 1}/${files.length})…`);
        const { url } = await uploadFile(f);
        setPendingFiles((prev) => [
          ...prev,
          { url, filename: f.name, fileSize: f.size, mimeType: f.type || "application/octet-stream", folder },
        ]);
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : "Upload failed", "error");
    } finally {
      setUploading(false);
      setUploadProgress(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      if (folderInputRef.current) folderInputRef.current.value = "";
    }
  }

  async function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    if (uploading) return;
    try {
      const files = await filesFromDataTransfer(e.dataTransfer);
      await handleFilesSelected(files);
    } catch {
      toast("Couldn't read the dropped items", "error");
    }
  }

  function resetForm() {
    setShowForm(false);
    setTitle("");
    setMessage("");
    setContent("");
    setPendingFiles([]);
  }

  async function handleCreate() {
    if (!title.trim()) return;
    setSaving(true);
    try {
      // Deterministic order: by folder, then numeric-aware filename (2.png < 10.png),
      // so carousel slides always land in sequence no matter how the browser read them
      const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
      const orderedFiles = [...pendingFiles].sort((a, b) => {
        const fa = a.folder ?? "";
        const fb = b.folder ?? "";
        if (fa !== fb) return collator.compare(fa, fb);
        return collator.compare(a.filename, b.filename);
      });
      const res = await fetch("/api/deliverables", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId,
          title: title.trim(),
          message: message.trim() || null,
          content: content.trim() || null,
          files: orderedFiles,
        }),
      });
      const data = await res.json();
      if (data.success) {
        toast(
          data.emailed
            ? "Deliverable created — review link emailed to the client"
            : "Created — no email on file for this client, copy the link to send it",
          "success"
        );
        resetForm();
        onRefresh();
      } else {
        toast(data.error || "Failed to create deliverable", "error");
      }
    } catch {
      toast("Failed to create deliverable", "error");
    } finally {
      setSaving(false);
    }
  }

  function copyLink(d: DeliverableItem) {
    navigator.clipboard.writeText(`${window.location.origin}/review/${d.token}`);
    setCopiedId(d.id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  async function handleResubmit(d: DeliverableItem) {
    setResubmittingId(d.id);
    try {
      const res = await fetch(`/api/deliverables/${d.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resubmit: true }),
      });
      const data = await res.json();
      if (data.success) {
        toast(
          data.emailed
            ? "Reopened & emailed the client — same link works"
            : "Reopened for review (no email on file) — same link works",
          "success"
        );
        onRefresh();
      } else {
        toast(data.error || "Failed to reopen", "error");
      }
    } catch {
      toast("Failed to reopen", "error");
    } finally {
      setResubmittingId(null);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/deliverables/${deleteTarget.id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        toast("Deliverable deleted", "success");
        onRefresh();
      } else {
        toast(data.error || "Failed to delete", "error");
      }
    } catch {
      toast("Failed to delete", "error");
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  }

  const inputClass =
    "w-full px-3 py-1.5 bg-bb-surface border border-bb-border rounded text-sm text-white placeholder:text-bb-dim focus:outline-none focus:border-bb-orange";

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs text-bb-dim">
          Finished work your team uploads here gets a review link — the client approves or requests changes.
        </p>
        <button
          onClick={() => setShowForm(!showForm)}
          className="text-bb-orange hover:text-bb-orange-light text-sm flex items-center gap-1 shrink-0"
        >
          <Plus size={14} /> New
        </button>
      </div>

      {/* Create form */}
      {showForm && (
        <div className="mb-4 p-3 bg-bb-black rounded-lg space-y-2">
          <input
            placeholder="Title (e.g. Homepage copy — final)"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className={inputClass}
          />
          <textarea
            placeholder="Note to the client (optional)"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={2}
            className={inputClass}
          />
          <textarea
            placeholder="Finalized content — copy, captions, anything they should read (optional)"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={5}
            className={inputClass}
          />

          {/* File upload: multi-select pickers + drag & drop (files or folders) */}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => handleFilesSelected(e.target.files)}
          />
          <input
            ref={folderInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => handleFilesSelected(e.target.files)}
            {...({ webkitdirectory: "" } as React.InputHTMLAttributes<HTMLInputElement>)}
          />
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            className={`rounded border border-dashed p-3 space-y-2 transition-colors ${
              dragOver ? "border-bb-orange bg-bb-orange/5" : "border-bb-border"
            }`}
          >
            {uploading ? (
              <div className="flex items-center justify-center gap-2 py-1.5 text-sm text-bb-muted">
                <Loader2 size={14} className="animate-spin" />
                {uploadProgress || "Uploading…"}
              </div>
            ) : (
              <>
                <div className="flex gap-2">
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="flex-1 flex items-center justify-center gap-2 py-2 bg-bb-surface hover:bg-bb-elevated border border-bb-border hover:border-bb-orange rounded text-sm text-bb-muted hover:text-white transition-colors"
                  >
                    <Upload size={14} /> Upload files
                  </button>
                  <button
                    onClick={() => folderInputRef.current?.click()}
                    className="flex-1 flex items-center justify-center gap-2 py-2 bg-bb-surface hover:bg-bb-elevated border border-bb-border hover:border-bb-orange rounded text-sm text-bb-muted hover:text-white transition-colors"
                  >
                    <FolderUp size={14} /> Upload folder
                  </button>
                </div>
                <p className="text-center text-[11px] text-bb-dim">
                  Select multiple files at once, or drag &amp; drop files/folders here
                </p>
              </>
            )}
          </div>

          {pendingFiles.length > 0 && (
            <div className="space-y-1">
              {pendingFiles.map((f, i) => (
                <div key={i} className="flex items-center justify-between gap-2 px-2 py-1.5 bg-bb-surface rounded text-xs">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <FileText size={11} className="text-bb-orange shrink-0" />
                    <span className="text-white truncate">
                      {f.folder && <span className="text-bb-dim">{f.folder}/</span>}
                      {f.filename}
                    </span>
                    <span className="text-bb-dim shrink-0">{formatBytes(f.fileSize)}</span>
                  </div>
                  <button
                    onClick={() => setPendingFiles((prev) => prev.filter((_, idx) => idx !== i))}
                    className="text-bb-dim hover:text-red-400 shrink-0"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex gap-2 justify-end pt-1">
            <button onClick={resetForm} className="p-1 text-bb-dim hover:text-white">
              <X size={16} />
            </button>
            <button
              onClick={handleCreate}
              disabled={saving || uploading || !title.trim()}
              className="p-1 text-bb-orange hover:text-bb-orange-light disabled:opacity-50"
            >
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
            </button>
          </div>
        </div>
      )}

      {/* List */}
      <div className="space-y-2">
        {deliverables.map((d) => {
          const meta = STATUS_META[d.status] || STATUS_META.PENDING_REVIEW;
          return (
            <div key={d.id} className="p-3 rounded-lg bg-bb-black border border-bb-border space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Package size={13} className="text-bb-orange shrink-0" />
                  <span className="text-sm font-medium text-white truncate">{d.title}</span>
                  <span
                    className={`flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full border shrink-0 ${meta.classes}`}
                  >
                    {meta.icon} {meta.label}
                  </span>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => copyLink(d)}
                    className="p-1 text-bb-dim hover:text-bb-orange transition-colors"
                    title="Copy review link"
                  >
                    {copiedId === d.id ? <Check size={13} className="text-green-400" /> : <Copy size={13} />}
                  </button>
                  <a
                    href={`/review/${d.token}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1 text-bb-dim hover:text-bb-orange transition-colors"
                    title="Open review page"
                  >
                    <ExternalLink size={13} />
                  </a>
                  <button
                    onClick={() => setDeleteTarget(d)}
                    className="p-1 text-bb-dim hover:text-red-400 transition-colors"
                    title="Delete"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-3 text-xs text-bb-dim">
                <span>{new Date(d.createdAt).toLocaleDateString()}</span>
                {d.createdBy && <span>by {d.createdBy}</span>}
                {d.files.length > 0 && (
                  <span>{d.files.length} file{d.files.length !== 1 ? "s" : ""}</span>
                )}
                {d.revisionCount > 0 && (
                  <span>{d.revisionCount} revision{d.revisionCount !== 1 ? "s" : ""}</span>
                )}
                {d.respondedAt && (
                  <span>
                    responded {new Date(d.respondedAt).toLocaleDateString()}
                    {d.respondedBy ? ` by ${d.respondedBy}` : ""}
                  </span>
                )}
              </div>

              {d.status === "REVISION_REQUESTED" && d.revisionNotes && (
                <div className="p-2.5 bg-bb-orange/5 border border-bb-orange/20 rounded space-y-2">
                  <p className="text-xs text-bb-orange font-medium">Client requested:</p>
                  <p className="text-xs text-bb-muted whitespace-pre-wrap">{d.revisionNotes}</p>
                  <button
                    onClick={() => handleResubmit(d)}
                    disabled={resubmittingId === d.id}
                    className="flex items-center gap-1.5 text-xs text-bb-orange hover:text-bb-orange-light disabled:opacity-50"
                  >
                    {resubmittingId === d.id ? (
                      <Loader2 size={11} className="animate-spin" />
                    ) : (
                      <Send size={11} />
                    )}
                    Changes made — reopen for review
                  </button>
                </div>
              )}
            </div>
          );
        })}

        {deliverables.length === 0 && !showForm && (
          <div className="text-center py-6">
            <Package size={24} className="mx-auto text-bb-dim mb-2" />
            <p className="text-sm text-bb-dim">No deliverables yet</p>
            <button
              onClick={() => setShowForm(true)}
              className="text-xs text-bb-orange hover:text-bb-orange-light mt-1"
            >
              Send your first deliverable for review
            </button>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete deliverable?"
        message={`"${deleteTarget?.title}" and its review link will stop working. Files already sent to the client stay in Vercel Blob.`}
        confirmLabel={deleting ? "Deleting…" : "Delete"}
        onConfirm={handleDelete}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  );
}
