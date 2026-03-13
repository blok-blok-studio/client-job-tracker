"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Modal from "@/components/shared/Modal";
import PlatformIcon, { getPlatformLabel } from "./PlatformIcon";
import { X, Upload, Image, Film, Loader2 } from "lucide-react";

interface Client {
  id: string;
  name: string;
}

interface ContentPostData {
  id?: string;
  clientId: string;
  platform: string;
  status?: string;
  title: string;
  body: string;
  hashtags: string[];
  mediaUrls: string[];
  scheduledAt: string;
}

const PLATFORMS = ["INSTAGRAM", "TIKTOK", "TWITTER", "LINKEDIN", "YOUTUBE", "FACEBOOK"];
const STATUSES = ["DRAFT", "SCHEDULED"];
const ACCEPTED_TYPES = "image/jpeg,image/png,image/gif,image/webp,video/mp4,video/quicktime,video/webm";
const MAX_FILE_SIZE = 50 * 1024 * 1024;

function isVideo(url: string) {
  return /\.(mp4|mov|webm)$/i.test(url);
}

export default function ContentPostModal({
  open,
  onClose,
  onSave,
  initialData,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (data: ContentPostData) => Promise<void>;
  initialData?: ContentPostData | null;
}) {
  const [clients, setClients] = useState<Client[]>([]);
  const [clientId, setClientId] = useState("");
  const [platform, setPlatform] = useState("INSTAGRAM");
  const [status, setStatus] = useState("DRAFT");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [hashtagInput, setHashtagInput] = useState("");
  const [hashtags, setHashtags] = useState<string[]>([]);
  const [mediaUrls, setMediaUrls] = useState<string[]>([]);
  const [scheduledAt, setScheduledAt] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/clients")
      .then((r) => r.json())
      .then((d) => {
        if (d.success) setClients(d.data);
      });
  }, []);

  useEffect(() => {
    if (initialData) {
      setClientId(initialData.clientId);
      setPlatform(initialData.platform);
      setStatus(initialData.status || "DRAFT");
      setTitle(initialData.title || "");
      setBody(initialData.body || "");
      setHashtags(initialData.hashtags || []);
      setMediaUrls(initialData.mediaUrls || []);
      setScheduledAt(initialData.scheduledAt || "");
    } else {
      setClientId("");
      setPlatform("INSTAGRAM");
      setStatus("DRAFT");
      setTitle("");
      setBody("");
      setHashtags([]);
      setMediaUrls([]);
      setScheduledAt("");
    }
    setUploadError(null);
  }, [initialData, open]);

  const addHashtag = () => {
    const tag = hashtagInput.trim().replace(/^#/, "");
    if (tag && !hashtags.includes(tag)) {
      setHashtags([...hashtags, tag]);
    }
    setHashtagInput("");
  };

  const removeHashtag = (tag: string) => {
    setHashtags(hashtags.filter((t) => t !== tag));
  };

  const uploadFiles = useCallback(async (files: FileList | File[]) => {
    setUploadError(null);
    const fileArray = Array.from(files);

    // Validate before uploading
    for (const file of fileArray) {
      if (file.size > MAX_FILE_SIZE) {
        setUploadError(`"${file.name}" exceeds the 50MB limit`);
        return;
      }
      if (!ACCEPTED_TYPES.split(",").includes(file.type)) {
        setUploadError(`"${file.name}" is not a supported file type`);
        return;
      }
    }

    setUploading(true);
    try {
      const formData = new FormData();
      fileArray.forEach((f) => formData.append("files", f));

      const res = await fetch("/api/uploads", { method: "POST", body: formData });
      const data = await res.json();

      if (!data.success) {
        setUploadError(data.error || "Upload failed");
        return;
      }

      setMediaUrls((prev) => [...prev, ...data.urls]);
    } catch {
      setUploadError("Upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  }, []);

  const removeMedia = (url: string) => {
    setMediaUrls((prev) => prev.filter((u) => u !== url));
  };

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      if (e.dataTransfer.files.length) {
        uploadFiles(e.dataTransfer.files);
      }
    },
    [uploadFiles]
  );

  const handleSubmit = async () => {
    if (!clientId || !platform) return;
    setSaving(true);
    try {
      await onSave({
        id: initialData?.id,
        clientId,
        platform,
        status: scheduledAt ? "SCHEDULED" : status,
        title,
        body,
        hashtags,
        mediaUrls,
        scheduledAt,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={initialData?.id ? "Edit Post" : "New Content Post"}>
      <div className="p-6 max-w-lg w-full">

        <div className="space-y-4">
          {/* Client */}
          <div>
            <label className="block text-sm font-medium text-bb-muted mb-1">Client</label>
            <select
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              className="w-full bg-bb-elevated border border-bb-border rounded-lg px-3 py-2 text-white text-sm"
            >
              <option value="">Select client...</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          {/* Platform */}
          <div>
            <label className="block text-sm font-medium text-bb-muted mb-1">Platform</label>
            <div className="grid grid-cols-3 gap-2">
              {PLATFORMS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPlatform(p)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors border ${
                    platform === p
                      ? "border-bb-orange bg-bb-orange/10 text-white"
                      : "border-bb-border bg-bb-elevated text-bb-muted hover:text-white"
                  }`}
                >
                  <PlatformIcon platform={p} size={14} />
                  {getPlatformLabel(p)}
                </button>
              ))}
            </div>
          </div>

          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-bb-muted mb-1">Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Post title or headline..."
              className="w-full bg-bb-elevated border border-bb-border rounded-lg px-3 py-2 text-white text-sm placeholder:text-bb-dim"
            />
          </div>

          {/* Body / Caption */}
          <div>
            <label className="block text-sm font-medium text-bb-muted mb-1">Caption / Body</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Write your post content..."
              rows={4}
              className="w-full bg-bb-elevated border border-bb-border rounded-lg px-3 py-2 text-white text-sm placeholder:text-bb-dim resize-none"
            />
          </div>

          {/* Media Upload */}
          <div>
            <label className="block text-sm font-medium text-bb-muted mb-1">
              Media
              <span className="text-bb-dim font-normal ml-1.5">Images &amp; Videos</span>
            </label>

            {/* Thumbnails */}
            {mediaUrls.length > 0 && (
              <div className="flex gap-2 mb-2 flex-wrap">
                {mediaUrls.map((url) => (
                  <div
                    key={url}
                    className="relative group w-20 h-20 rounded-lg overflow-hidden border border-bb-border bg-bb-elevated shrink-0"
                  >
                    {isVideo(url) ? (
                      <div className="w-full h-full flex items-center justify-center bg-bb-surface">
                        <Film size={24} className="text-bb-muted" />
                      </div>
                    ) : (
                      <img
                        src={url}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    )}
                    <button
                      type="button"
                      onClick={() => removeMedia(url)}
                      className="absolute top-0.5 right-0.5 p-0.5 rounded-full bg-black/70 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Drop zone */}
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`flex flex-col items-center justify-center gap-2 py-6 rounded-lg border-2 border-dashed cursor-pointer transition-colors ${
                dragOver
                  ? "border-bb-orange bg-bb-orange/5"
                  : "border-bb-border hover:border-bb-muted bg-bb-elevated/50"
              }`}
            >
              {uploading ? (
                <Loader2 size={24} className="text-bb-orange animate-spin" />
              ) : (
                <>
                  <div className="flex items-center gap-2 text-bb-muted">
                    <Upload size={18} />
                    <Image size={18} />
                    <Film size={18} />
                  </div>
                  <p className="text-xs text-bb-dim text-center px-4">
                    Drag &amp; drop or click to upload<br />
                    <span className="text-bb-dim/70">JPEG, PNG, GIF, WebP, MP4, MOV, WebM &middot; Max 50MB</span>
                  </p>
                </>
              )}
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED_TYPES}
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.length) {
                  uploadFiles(e.target.files);
                  e.target.value = "";
                }
              }}
            />

            {uploadError && (
              <p className="text-xs text-red-400 mt-1.5">{uploadError}</p>
            )}
          </div>

          {/* Hashtags */}
          <div>
            <label className="block text-sm font-medium text-bb-muted mb-1">Hashtags</label>
            <div className="flex gap-2 mb-2 flex-wrap">
              {hashtags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 bg-bb-elevated border border-bb-border rounded-full px-2.5 py-0.5 text-xs text-bb-muted"
                >
                  #{tag}
                  <button type="button" onClick={() => removeHashtag(tag)}>
                    <X size={10} />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={hashtagInput}
                onChange={(e) => setHashtagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addHashtag();
                  }
                }}
                placeholder="Add hashtag..."
                className="flex-1 bg-bb-elevated border border-bb-border rounded-lg px-3 py-2 text-white text-sm placeholder:text-bb-dim"
              />
              <button
                type="button"
                onClick={addHashtag}
                className="px-3 py-2 bg-bb-elevated border border-bb-border rounded-lg text-sm text-bb-muted hover:text-white"
              >
                Add
              </button>
            </div>
          </div>

          {/* Schedule */}
          <div>
            <label className="block text-sm font-medium text-bb-muted mb-1">Schedule</label>
            <input
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
              className="w-full bg-bb-elevated border border-bb-border rounded-lg px-3 py-2 text-white text-sm"
            />
          </div>

          {/* Status (only if not scheduled) */}
          {!scheduledAt && (
            <div>
              <label className="block text-sm font-medium text-bb-muted mb-1">Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full bg-bb-elevated border border-bb-border rounded-lg px-3 py-2 text-white text-sm"
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 mt-6">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-bb-muted hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!clientId || saving || uploading}
            className="px-4 py-2 bg-bb-orange text-white rounded-lg text-sm font-medium hover:bg-bb-orange/90 transition-colors disabled:opacity-50"
          >
            {saving ? "Saving..." : initialData?.id ? "Update" : "Create Post"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
