"use client";

import { useState, useEffect } from "react";
import Modal from "@/components/shared/Modal";
import PlatformIcon, { getPlatformLabel } from "./PlatformIcon";
import { X } from "lucide-react";

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
  scheduledAt: string;
}

const PLATFORMS = ["INSTAGRAM", "TIKTOK", "TWITTER", "LINKEDIN", "YOUTUBE", "FACEBOOK"];
const STATUSES = ["DRAFT", "SCHEDULED"];

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
  const [scheduledAt, setScheduledAt] = useState("");
  const [saving, setSaving] = useState(false);

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
      setScheduledAt(initialData.scheduledAt || "");
    } else {
      setClientId("");
      setPlatform("INSTAGRAM");
      setStatus("DRAFT");
      setTitle("");
      setBody("");
      setHashtags([]);
      setScheduledAt("");
    }
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
            disabled={!clientId || saving}
            className="px-4 py-2 bg-bb-orange text-white rounded-lg text-sm font-medium hover:bg-bb-orange/90 transition-colors disabled:opacity-50"
          >
            {saving ? "Saving..." : initialData?.id ? "Update" : "Create Post"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
