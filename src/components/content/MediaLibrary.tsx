"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Image as ImageIcon,
  Film,
  Music,
  Search,
  Loader2,
  Check,
  FolderOpen,
  X,
} from "lucide-react";

interface MediaFile {
  id: string;
  url: string;
  filename: string;
  fileType: "IMAGE" | "VIDEO" | "AUDIO";
  fileSize: number;
  mimeType: string;
  createdAt: string;
  label?: string;
  uploadedBy: string;
}

interface MediaLibraryProps {
  clientId: string;
  onSelect: (urls: string[]) => void;
  selectedUrls: string[];
  allowedTypes?: ("IMAGE" | "VIDEO" | "AUDIO")[];
}

function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getIcon(type: string) {
  if (type === "IMAGE") return <ImageIcon size={14} className="text-blue-400" />;
  if (type === "VIDEO") return <Film size={14} className="text-purple-400" />;
  if (type === "AUDIO") return <Music size={14} className="text-green-400" />;
  return <ImageIcon size={14} className="text-gray-400" />;
}

export default function MediaLibrary({ clientId, onSelect, selectedUrls, allowedTypes }: MediaLibraryProps) {
  const [files, setFiles] = useState<MediaFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<string>("");

  const fetchFiles = useCallback(async () => {
    if (!clientId) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ clientId });
      if (filterType) params.set("fileType", filterType);
      if (search) params.set("search", search);

      const res = await fetch(`/api/client-media?${params}`);
      const data = await res.json();
      if (data.success) setFiles(data.data);
    } catch { /* silent */ } finally {
      setLoading(false);
    }
  }, [clientId, filterType, search]);

  useEffect(() => {
    fetchFiles();
  }, [fetchFiles]);

  const toggleSelect = (url: string) => {
    if (selectedUrls.includes(url)) {
      onSelect(selectedUrls.filter((u) => u !== url));
    } else {
      onSelect([...selectedUrls, url]);
    }
  };

  const filteredFiles = allowedTypes
    ? files.filter((f) => allowedTypes.includes(f.fileType))
    : files;

  if (!clientId) {
    return (
      <div className="text-center py-8 text-bb-dim text-sm">
        Select a client first to browse their media library.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Search + Filter */}
      <div className="flex gap-2">
        <div className="flex-1 relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-bb-dim" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search files..."
            className="w-full bg-bb-elevated border border-bb-border rounded-lg pl-8 pr-3 py-1.5 text-white text-sm placeholder:text-bb-dim"
          />
        </div>
        <div className="flex gap-1">
          {[
            { value: "", label: "All", icon: FolderOpen },
            { value: "IMAGE", label: "Photo", icon: ImageIcon },
            { value: "VIDEO", label: "Video", icon: Film },
            { value: "AUDIO", label: "Audio", icon: Music },
          ].map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setFilterType(opt.value)}
              className={`p-1.5 rounded-lg border text-xs transition-colors ${
                filterType === opt.value
                  ? "border-bb-orange bg-bb-orange/10 text-white"
                  : "border-bb-border bg-bb-elevated text-bb-dim hover:text-bb-muted"
              }`}
              title={opt.label}
            >
              <opt.icon size={14} />
            </button>
          ))}
        </div>
      </div>

      {/* File grid */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 size={20} className="text-bb-orange animate-spin" />
        </div>
      ) : filteredFiles.length === 0 ? (
        <div className="text-center py-12">
          <FolderOpen size={32} className="text-bb-dim mx-auto mb-2" />
          <p className="text-sm text-bb-dim">No files yet</p>
          <p className="text-xs text-bb-dim/60 mt-1">
            Upload files or share the client upload link
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-4 gap-2 max-h-[280px] overflow-y-auto pr-1">
          {filteredFiles.map((file) => {
            const selected = selectedUrls.includes(file.url);
            return (
              <button
                key={file.id}
                type="button"
                onClick={() => toggleSelect(file.url)}
                className={`relative group rounded-lg overflow-hidden border-2 transition-all aspect-square ${
                  selected
                    ? "border-bb-orange ring-1 ring-bb-orange/50"
                    : "border-transparent hover:border-bb-border"
                }`}
              >
                {file.fileType === "IMAGE" ? (
                  <img src={file.url} alt={file.filename} className="w-full h-full object-cover" />
                ) : file.fileType === "VIDEO" ? (
                  <div className="w-full h-full bg-bb-elevated flex flex-col items-center justify-center gap-1">
                    <Film size={20} className="text-purple-400" />
                    <span className="text-[8px] text-bb-dim truncate px-1 w-full text-center">{file.filename}</span>
                  </div>
                ) : (
                  <div className="w-full h-full bg-bb-elevated flex flex-col items-center justify-center gap-1">
                    <Music size={20} className="text-green-400" />
                    <span className="text-[8px] text-bb-dim truncate px-1 w-full text-center">{file.filename}</span>
                  </div>
                )}

                {/* Selection badge */}
                {selected && (
                  <div className="absolute top-1 right-1 w-5 h-5 rounded-full bg-bb-orange flex items-center justify-center">
                    <Check size={12} className="text-white" />
                  </div>
                )}

                {/* Info overlay */}
                <div className="absolute bottom-0 left-0 right-0 bg-black/70 px-1.5 py-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <p className="text-[8px] text-white truncate">{file.filename}</p>
                  <div className="flex items-center gap-1">
                    {getIcon(file.fileType)}
                    <span className="text-[8px] text-gray-400">{formatSize(file.fileSize)}</span>
                    <span className="text-[8px] text-gray-500 ml-auto">
                      {file.uploadedBy === "client" ? "Client" : "You"}
                    </span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Selected count */}
      {selectedUrls.length > 0 && (
        <div className="flex items-center justify-between text-xs text-bb-muted pt-1">
          <span>{selectedUrls.length} selected</span>
          <button
            type="button"
            onClick={() => onSelect([])}
            className="text-bb-dim hover:text-white transition-colors flex items-center gap-1"
          >
            <X size={10} /> Clear
          </button>
        </div>
      )}
    </div>
  );
}
