"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  FolderUp,
  Search,
  FileText,
  HardHat,
  X,
  Loader2,
  Upload,
  Users,
  CalendarDays,
  Download,
} from "lucide-react";
import TopBar from "@/components/layout/TopBar";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/shared/Toast";

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

export default function WorkPage() {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<WorkRow[]>([]);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [search, setSearch] = useState("");
  const [clientFilter, setClientFilter] = useState("");
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
    setUploading(true);
    setProgress(0);
    try {
      const uploaded = [];
      for (let i = 0; i < pending.length; i++) {
        const f = pending[i];
        const res = await fetch(
          `/api/uploads/stream?filename=${encodeURIComponent(f.name)}`,
          {
            method: "PUT",
            headers: { "Content-Type": f.type || "application/octet-stream" },
            body: f,
          }
        );
        const json = await res.json();
        if (!res.ok || !json.success || !json.urls?.[0]) {
          throw new Error(json?.error || `Failed to upload ${f.name}`);
        }
        uploaded.push({
          blobUrl: json.urls[0] as string,
          filename: f.name,
          contentType: f.type || undefined,
          size: f.size,
        });
        setProgress(Math.round(((i + 1) / pending.length) * 100));
      }

      const res = await fetch("/api/work", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: uploadClientId || null,
          note: note.trim(),
          files: uploaded,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json?.error || "Failed to submit work");

      setPending([]);
      setNote("");
      toast(
        uploadClientId
          ? "Work uploaded — it's in the client's Files tab too"
          : "Work uploaded",
        "success"
      );
      fetchRows();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Upload failed", "error");
    } finally {
      setUploading(false);
      setProgress(0);
    }
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
              <span className="text-bb-dim"> · any type</span>
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
                  className="px-3 py-2 bg-bb-black border border-bb-border rounded-md text-white text-sm focus:outline-none focus:ring-2 focus:ring-bb-orange/50 sm:w-56 [color-scheme:dark]"
                >
                  <option value="">General / internal</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
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
                  disabled={uploading}
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
            filtered.map((r) => (
              <div
                key={r.id}
                className="bg-bb-surface border border-bb-border rounded-lg p-3 flex items-center gap-3"
              >
                <FileText size={16} className="text-bb-orange shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white truncate">
                    {r.filename}
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
                <a
                  href={r.url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-bb-black border border-bb-border text-bb-muted hover:text-white text-xs font-medium rounded-md transition-colors shrink-0"
                >
                  <Download size={12} />
                  Open
                </a>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
