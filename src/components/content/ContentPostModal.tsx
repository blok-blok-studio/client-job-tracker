"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import dynamic from "next/dynamic";
const EmojiPicker = dynamic(() => import("emoji-picker-react"), { ssr: false });
import Modal from "@/components/shared/Modal";
import PlatformIcon, { getPlatformLabel } from "./PlatformIcon";
import PostPreview from "./PostPreview";
import MediaLibrary from "./MediaLibrary";
import AudioPanel from "./AudioPanel";
import SendToDevice from "./SendToDevice";
import {
  X,
  Upload,
  Image as ImageIcon,
  Film,
  Loader2,
  Sparkles,
  MapPin,
  UserPlus,
  AtSign,
  MessageSquare,
  Settings2,
  ChevronDown,
  ChevronRight,
  ImagePlus,
  Globe,
  Lock,
  Eye as EyeIcon,
  BarChart3,
  ListPlus,
  Plus,
  Minus,
  Clock,
  FileText,
  Accessibility,
  Hash,
  Music,
  FolderOpen,
  Smartphone,
  Link2,
  Copy,
  Check,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

interface Client {
  id: string;
  name: string;
}

interface PlatformSettings {
  // Twitter
  threadPosts?: string[];
  pollOptions?: string[];
  pollDuration?: number;
  quoteTweetUrl?: string;
  // YouTube
  category?: string;
  playlist?: string;
  ytTags?: string[];
  privacyStatus?: string;
  madeForKids?: boolean;
  // TikTok
  allowDuet?: boolean;
  allowStitch?: boolean;
  privacyLevel?: string;
  // LinkedIn
  articleMode?: boolean;
  // Facebook
  feeling?: string;
  album?: string;
  // Instagram
  shareToFeed?: boolean;
  shareToStory?: boolean;
  // Document carousel
  documentTitle?: string;
}

interface CredentialOption {
  id: string;
  platform: string;
  label: string | null;
}

interface ContentPostData {
  id?: string;
  clientId: string;
  credentialId?: string | null;
  platform: string;
  status?: string;
  title: string;
  body: string;
  hashtags: string[];
  mediaUrls: string[];
  scheduledAt: string;
  location?: string | null;
  locationLat?: number | null;
  locationLng?: number | null;
  taggedUsers?: string[];
  collaborators?: string[];
  altText?: string | null;
  coverImageUrl?: string | null;
  thumbnailUrl?: string | null;
  firstComment?: string | null;
  platformSettings?: PlatformSettings | null;
  visibility?: string | null;
  enableComments?: boolean;
}

const PLATFORMS = ["INSTAGRAM", "TIKTOK", "TWITTER", "THREADS", "LINKEDIN", "YOUTUBE", "FACEBOOK"];
const STATUSES = ["DRAFT", "SCHEDULED"];
const ACCEPTED_TYPES = "image/jpeg,image/png,image/gif,image/webp,image/heic,image/heif,video/mp4,video/quicktime,video/webm,application/pdf";
const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500MB — Pro plan

const YOUTUBE_CATEGORIES = [
  "Film & Animation", "Autos & Vehicles", "Music", "Pets & Animals",
  "Sports", "Short Movies", "Travel & Events", "Gaming", "Videoblogging",
  "People & Blogs", "Comedy", "Entertainment", "News & Politics",
  "Howto & Style", "Education", "Science & Technology", "Nonprofits & Activism",
];

const FACEBOOK_FEELINGS = [
  "happy", "blessed", "excited", "loved", "grateful", "motivated",
  "proud", "relaxed", "inspired", "determined", "creative", "thoughtful",
];

function isVideo(url: string) {
  return /\.(mp4|mov|webm)$/i.test(url);
}

function isPdf(url: string) {
  return /\.pdf$/i.test(url);
}

// ─── Reusable section toggle ─────────────────────────────────────────────────

function Section({
  icon: Icon,
  label,
  defaultOpen = false,
  badge,
  children,
}: {
  icon: React.ElementType;
  label: string;
  defaultOpen?: boolean;
  badge?: string | number;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-bb-border rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center justify-between w-full px-3 py-2.5 bg-bb-elevated/50 hover:bg-bb-elevated transition-colors text-left"
      >
        <div className="flex items-center gap-2">
          <Icon size={14} className="text-bb-muted" />
          <span className="text-sm font-medium text-bb-muted">{label}</span>
          {badge !== undefined && badge !== 0 && badge !== "" && (
            <span className="text-[10px] bg-bb-orange/20 text-bb-orange px-1.5 py-0.5 rounded-full font-medium">
              {badge}
            </span>
          )}
        </div>
        {open ? <ChevronDown size={14} className="text-bb-dim" /> : <ChevronRight size={14} className="text-bb-dim" />}
      </button>
      {open && <div className="p-3 space-y-3 border-t border-bb-border">{children}</div>}
    </div>
  );
}

// ─── Tag input component ─────────────────────────────────────────────────────

function TagInput({
  values,
  onChange,
  placeholder,
  prefix = "@",
  searchPlatform,
}: {
  values: string[];
  onChange: (v: string[]) => void;
  placeholder: string;
  prefix?: string;
  searchPlatform?: string;
}) {
  const [input, setInput] = useState("");
  const [suggestions, setSuggestions] = useState<{ handle: string; clientName: string; clientAvatar: string | null; platform: string }[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState(-1);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const add = (val?: string) => {
    const v = (val || input).trim().replace(/^[@#]/, "");
    if (v && !values.includes(v)) {
      onChange([...values, v]);
    }
    setInput("");
    setSuggestions([]);
    setShowSuggestions(false);
    setHighlightIdx(-1);
  };

  // Search social links when typing
  useEffect(() => {
    if (!searchPlatform || input.trim().length < 1) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/social-links/search?q=${encodeURIComponent(input.trim())}&platform=${searchPlatform}`);
        if (res.ok) {
          const data = await res.json();
          setSuggestions(data);
          setShowSuggestions(data.length > 0);
          setHighlightIdx(-1);
        }
      } catch { /* ignore */ }
    }, 250);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [input, searchPlatform]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={wrapperRef}>
      {values.length > 0 && (
        <div className="flex gap-1.5 mb-2 flex-wrap">
          {values.map((v) => (
            <span
              key={v}
              className="inline-flex items-center gap-1 bg-bb-elevated border border-bb-border rounded-full px-2.5 py-0.5 text-xs text-bb-muted"
            >
              {prefix}{v}
              <button type="button" onClick={() => onChange(values.filter((t) => t !== v))}>
                <X size={10} />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="relative">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onFocus={() => { if (suggestions.length) setShowSuggestions(true); }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setHighlightIdx((i) => Math.min(i + 1, suggestions.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setHighlightIdx((i) => Math.max(i - 1, -1));
              } else if (e.key === "Enter") {
                e.preventDefault();
                if (highlightIdx >= 0 && suggestions[highlightIdx]) {
                  add(suggestions[highlightIdx].handle || suggestions[highlightIdx].clientName);
                } else {
                  add();
                }
              } else if (e.key === "Escape") {
                setShowSuggestions(false);
              }
            }}
            placeholder={placeholder}
            className="flex-1 bg-bb-elevated border border-bb-border rounded-lg px-3 py-1.5 text-white text-sm placeholder:text-bb-dim"
          />
          <button
            type="button"
            onClick={() => add()}
            className="px-3 py-1.5 bg-bb-elevated border border-bb-border rounded-lg text-sm text-bb-muted hover:text-white"
          >
            Add
          </button>
        </div>
        {showSuggestions && suggestions.length > 0 && (
          <div className="absolute z-50 left-0 right-12 mt-1 bg-bb-card border border-bb-border rounded-lg shadow-xl max-h-48 overflow-y-auto">
            {suggestions.map((s, i) => (
              <button
                key={s.handle || s.clientName + i}
                type="button"
                className={`w-full flex items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-bb-elevated transition-colors ${
                  i === highlightIdx ? "bg-bb-elevated" : ""
                }`}
                onMouseEnter={() => setHighlightIdx(i)}
                onClick={() => add(s.handle || s.clientName)}
              >
                {s.clientAvatar ? (
                  <img src={s.clientAvatar} alt="" className="w-6 h-6 rounded-full object-cover" />
                ) : (
                  <div className="w-6 h-6 rounded-full bg-bb-elevated border border-bb-border flex items-center justify-center text-[10px] text-bb-muted">
                    {(s.clientName || "?")[0]}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <span className="text-white truncate block">
                    {s.handle ? `@${s.handle}` : s.clientName}
                  </span>
                  {s.handle && (
                    <span className="text-[11px] text-bb-dim truncate block">{s.clientName}</span>
                  )}
                </div>
                <span className="text-[10px] text-bb-dim uppercase">{s.platform}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Character counter ───────────────────────────────────────────────────────

function CharCount({ current, max, label }: { current: number; max: number; label?: string }) {
  const pct = (current / max) * 100;
  const over = current > max;
  return (
    <div className="flex items-center gap-2 mt-1">
      <div className="flex-1 h-1 bg-bb-border rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${over ? "bg-red-500" : pct > 80 ? "bg-yellow-500" : "bg-bb-orange"}`}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
      <span className={`text-[10px] font-mono ${over ? "text-red-400" : "text-bb-dim"}`}>
        {current}/{max}{label ? ` ${label}` : ""}
      </span>
    </div>
  );
}

// ─── Platform-specific limits ────────────────────────────────────────────────

function getPlatformLimits(platform: string) {
  switch (platform) {
    case "TWITTER": return { body: 280, title: 0, media: 4, video: 1 };
    case "INSTAGRAM": return { body: 2200, title: 0, media: 10, video: 1 };
    case "LINKEDIN": return { body: 3000, title: 0, media: 20, video: 1 };
    case "FACEBOOK": return { body: 63206, title: 0, media: 10, video: 1 };
    case "TIKTOK": return { body: 2200, title: 0, media: 0, video: 1 };
    case "YOUTUBE": return { body: 5000, title: 100, media: 0, video: 1 };
    default: return { body: 5000, title: 100, media: 10, video: 1 };
  }
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function ContentPostModal({
  open,
  onClose,
  onSave,
  initialData,
  defaultScheduledAt,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (data: ContentPostData) => Promise<void>;
  initialData?: ContentPostData | null;
  defaultScheduledAt?: string;
}) {
  // Core fields
  const [clients, setClients] = useState<Client[]>([]);
  const [clientId, setClientId] = useState("");
  const [platform, setPlatform] = useState("INSTAGRAM");
  const [credentialId, setCredentialId] = useState<string | null>(null);
  const [credentials, setCredentials] = useState<CredentialOption[]>([]);
  const [status, setStatus] = useState("DRAFT");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const [hashtagInput, setHashtagInput] = useState("");
  const [hashtags, setHashtags] = useState<string[]>([]);
  const [mediaUrls, setMediaUrls] = useState<string[]>([]);
  const [scheduledAt, setScheduledAt] = useState("");

  // New fields
  const [location, setLocation] = useState("");
  const [taggedUsers, setTaggedUsers] = useState<string[]>([]);
  const [collaborators, setCollaborators] = useState<string[]>([]);
  const [altText, setAltText] = useState("");
  const [coverImageUrl, setCoverImageUrl] = useState("");
  const [thumbnailUrl, setThumbnailUrl] = useState("");
  const [firstComment, setFirstComment] = useState("");
  const [visibility, setVisibility] = useState("PUBLIC");
  const [enableComments, setEnableComments] = useState(true);
  const [platformSettings, setPlatformSettings] = useState<PlatformSettings>({});

  // UI state
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [uploadingThumb, setUploadingThumb] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [suggestingHashtags, setSuggestingHashtags] = useState(false);
  const [activeTab, setActiveTab] = useState<"compose" | "media" | "audio" | "settings" | "preview">("compose");
  const [uploadLinkCopied, setUploadLinkCopied] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const thumbInputRef = useRef<HTMLInputElement>(null);

  const limits = getPlatformLimits(platform);

  useEffect(() => {
    fetch("/api/clients")
      .then((r) => r.json())
      .then((d) => {
        if (d.success) setClients(d.data);
      });
  }, []);

  // Fetch credentials when client + platform change
  useEffect(() => {
    if (!clientId || !platform) {
      setCredentials([]);
      setCredentialId(null);
      return;
    }
    fetch(`/api/clients/${clientId}/credentials?platform=${platform.toLowerCase()}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.success) {
          setCredentials(d.data);
          if (d.data.length === 1) {
            setCredentialId(d.data[0].id);
          } else if (!d.data.find((c: CredentialOption) => c.id === credentialId)) {
            setCredentialId(null);
          }
        } else {
          setCredentials([]);
        }
      })
      .catch(() => setCredentials([]));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, platform]);

  useEffect(() => {
    if (initialData) {
      setClientId(initialData.clientId);
      setPlatform(initialData.platform);
      setCredentialId(initialData.credentialId || null);
      setStatus(initialData.status || "DRAFT");
      setTitle(initialData.title || "");
      setBody(initialData.body || "");
      setHashtags(initialData.hashtags || []);
      setMediaUrls(initialData.mediaUrls || []);
      setScheduledAt(initialData.scheduledAt || "");
      setLocation(initialData.location || "");
      setTaggedUsers(initialData.taggedUsers || []);
      setCollaborators(initialData.collaborators || []);
      setAltText(initialData.altText || "");
      setCoverImageUrl(initialData.coverImageUrl || "");
      setThumbnailUrl(initialData.thumbnailUrl || "");
      setFirstComment(initialData.firstComment || "");
      setVisibility(initialData.visibility || "PUBLIC");
      setEnableComments(initialData.enableComments ?? true);
      setPlatformSettings((initialData.platformSettings as PlatformSettings) || {});
    } else {
      setClientId("");
      setPlatform("INSTAGRAM");
      setCredentialId(null);
      setStatus("DRAFT");
      setTitle("");
      setBody("");
      setHashtags([]);
      setMediaUrls([]);
      setScheduledAt(defaultScheduledAt || "");
      setLocation("");
      setTaggedUsers([]);
      setCollaborators([]);
      setAltText("");
      setCoverImageUrl("");
      setThumbnailUrl("");
      setFirstComment("");
      setVisibility("PUBLIC");
      setEnableComments(true);
      setPlatformSettings({});
    }
    setUploadError(null);
    setActiveTab("compose");
  }, [initialData, open, defaultScheduledAt]);

  // ─── Handlers ────────────────────────────────────────────────────────────

  const addHashtag = () => {
    const raw = hashtagInput.trim();
    if (!raw) { setHashtagInput(""); return; }
    // Split by spaces, commas, or # to support pasting multiple hashtags at once
    const tags = raw.split(/[\s,#]+/).map((t) => t.trim()).filter(Boolean);
    const unique = tags.filter((t) => !hashtags.includes(t));
    if (unique.length) setHashtags([...hashtags, ...unique]);
    setHashtagInput("");
  };

  const removeHashtag = (tag: string) => {
    setHashtags(hashtags.filter((t) => t !== tag));
  };

  const uploadFiles = useCallback(async (files: FileList | File[]) => {
    setUploadError(null);
    const fileArray = Array.from(files);
    for (const file of fileArray) {
      if (file.size > MAX_FILE_SIZE) {
        setUploadError(`"${file.name}" exceeds the 500MB limit`);
        return;
      }
      const ext = file.name.toLowerCase().split(".").pop();
      const fileType = file.type || ({ pdf: "application/pdf", heic: "image/heic", heif: "image/heif" }[ext || ""] || "");
      if (!ACCEPTED_TYPES.split(",").includes(fileType)) {
        setUploadError(`"${file.name}" is not a supported file type`);
        return;
      }
    }
    setUploading(true);
    try {
      const urls: string[] = [];
      for (const file of fileArray) {
        const res = await new Promise<string>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.addEventListener("load", () => {
            try {
              const data = JSON.parse(xhr.responseText);
              if (data.success && data.urls?.[0]) resolve(data.urls[0]);
              else reject(new Error(data.error || "Upload failed"));
            } catch { reject(new Error("Upload failed")); }
          });
          xhr.addEventListener("error", () => reject(new Error("Upload failed")));
          const params = new URLSearchParams({ filename: file.name });
          xhr.open("PUT", `/api/uploads/stream?${params}`);
          xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
          xhr.send(file);
        });
        urls.push(res);
      }
      setMediaUrls((prev) => [...prev, ...urls]);
    } catch {
      setUploadError("Upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  }, []);

  const uploadSingleFile = useCallback(async (
    files: FileList | File[],
    setter: (url: string) => void,
    setLoading: (b: boolean) => void,
  ) => {
    const file = Array.from(files)[0];
    if (!file) return;
    setLoading(true);
    try {
      const url = await new Promise<string>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.addEventListener("load", () => {
          try {
            const data = JSON.parse(xhr.responseText);
            if (data.success && data.urls?.[0]) resolve(data.urls[0]);
            else reject(new Error(data.error || "Upload failed"));
          } catch { reject(new Error("Upload failed")); }
        });
        xhr.addEventListener("error", () => reject(new Error("Upload failed")));
        const params = new URLSearchParams({ filename: file.name });
        xhr.open("PUT", `/api/uploads/stream?${params}`);
        xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
        xhr.send(file);
      });
      setter(url);
    } catch { /* silent */ } finally {
      setLoading(false);
    }
  }, []);

  const removeMedia = (url: string) => {
    setMediaUrls((prev) => prev.filter((u) => u !== url));
  };

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      if (e.dataTransfer.files.length) uploadFiles(e.dataTransfer.files);
    },
    [uploadFiles]
  );

  const suggestHashtags = useCallback(async () => {
    if (!body && !title) return;
    setSuggestingHashtags(true);
    try {
      const res = await fetch("/api/content-posts/suggest-hashtags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform, title, body, existingHashtags: hashtags }),
      });
      const data = await res.json();
      if (data.success && data.hashtags?.length) {
        const newTags = data.hashtags.filter((t: string) => !hashtags.includes(t));
        setHashtags((prev) => [...prev, ...newTags]);
      }
    } catch { /* silent */ } finally {
      setSuggestingHashtags(false);
    }
  }, [body, title, platform, hashtags]);

  const updatePlatformSetting = <K extends keyof PlatformSettings>(key: K, value: PlatformSettings[K]) => {
    setPlatformSettings((prev) => ({ ...prev, [key]: value }));
  };

  // ─── Thread management (Twitter) ────────────────────────────────────────

  const threadPosts = platformSettings.threadPosts || [];

  const addThreadPost = () => {
    updatePlatformSetting("threadPosts", [...threadPosts, ""]);
  };

  const updateThreadPost = (idx: number, val: string) => {
    const updated = [...threadPosts];
    updated[idx] = val;
    updatePlatformSetting("threadPosts", updated);
  };

  const removeThreadPost = (idx: number) => {
    updatePlatformSetting("threadPosts", threadPosts.filter((_, i) => i !== idx));
  };

  // ─── Poll management (Twitter) ─────────────────────────────────────────

  const pollOptions = platformSettings.pollOptions || [];

  const addPollOption = () => {
    if (pollOptions.length < 4) {
      updatePlatformSetting("pollOptions", [...pollOptions, ""]);
    }
  };

  const updatePollOption = (idx: number, val: string) => {
    const updated = [...pollOptions];
    updated[idx] = val;
    updatePlatformSetting("pollOptions", updated);
  };

  const removePollOption = (idx: number) => {
    updatePlatformSetting("pollOptions", pollOptions.filter((_, i) => i !== idx));
  };

  // ─── Timezone helpers ────────────────────────────────────────────────────

  const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const userTzAbbr = new Date().toLocaleTimeString("en-US", { timeZoneName: "short" }).split(" ").pop() || "";

  /** Convert datetime-local value to proper ISO string with timezone offset */
  function localToISO(datetimeLocal: string): string {
    if (!datetimeLocal) return "";
    // datetime-local gives "2026-03-30T14:00" — create Date in local tz
    const d = new Date(datetimeLocal);
    return d.toISOString(); // converts to UTC ISO string
  }

  // ─── Submit ─────────────────────────────────────────────────────────────

  const handleSubmit = async () => {
    if (!clientId || !platform) return;
    setSaving(true);
    try {
      await onSave({
        id: initialData?.id,
        clientId,
        credentialId,
        platform,
        status: scheduledAt ? "SCHEDULED" : status,
        title,
        body,
        hashtags,
        mediaUrls,
        scheduledAt: localToISO(scheduledAt),
        location: location || null,
        taggedUsers,
        collaborators,
        altText: altText || null,
        coverImageUrl: coverImageUrl || null,
        thumbnailUrl: thumbnailUrl || null,
        firstComment: firstComment || null,
        platformSettings: Object.keys(platformSettings).length > 0 ? platformSettings : null,
        visibility,
        enableComments,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  // ─── Platform-specific features visibility ─────────────────────────────

  const showLocation = ["INSTAGRAM", "FACEBOOK", "TWITTER"].includes(platform);
  const showTagPeople = ["INSTAGRAM", "FACEBOOK", "TWITTER", "LINKEDIN"].includes(platform);
  const showCollaborators = ["INSTAGRAM", "LINKEDIN"].includes(platform);
  const showFirstComment = platform === "INSTAGRAM";
  const showAltText = ["INSTAGRAM", "TWITTER", "LINKEDIN", "FACEBOOK"].includes(platform);
  const showCoverImage = ["INSTAGRAM", "TIKTOK"].includes(platform);
  const showThumbnail = platform === "YOUTUBE";
  const showVisibility = ["YOUTUBE", "TIKTOK", "LINKEDIN"].includes(platform);
  const showThread = platform === "TWITTER";
  const showPoll = platform === "TWITTER";
  const showYouTubeSettings = platform === "YOUTUBE";
  const showTikTokSettings = platform === "TIKTOK";
  const showFacebookSettings = platform === "FACEBOOK";
  const showInstagramSettings = platform === "INSTAGRAM";

  // ─── Render ─────────────────────────────────────────────────────────────

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={initialData?.id ? "Edit Post" : "New Content Post"}
      className="max-w-2xl"
    >
      <div className="max-w-2xl w-full">
        {/* Tab Bar */}
        <div className="flex border-b border-bb-border mb-4 -mt-2 overflow-x-auto">
          {([
            { key: "compose" as const, label: "Compose", icon: Hash },
            { key: "media" as const, label: "Media", icon: FolderOpen },
            { key: "audio" as const, label: "Audio", icon: Music },
            { key: "settings" as const, label: "Settings", icon: Settings2 },
            { key: "preview" as const, label: "Preview", icon: EyeIcon },
          ]).map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                activeTab === tab.key
                  ? "border-bb-orange text-white"
                  : "border-transparent text-bb-dim hover:text-bb-muted"
              }`}
            >
              <tab.icon size={13} />
              {tab.label}
            </button>
          ))}
        </div>

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* COMPOSE TAB */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        {activeTab === "compose" && (
          <div className="space-y-4">
            {/* Client + Platform row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-bb-muted mb-1">Client</label>
                <select
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  className="w-full bg-bb-elevated border border-bb-border rounded-lg px-3 py-2 text-white text-sm"
                >
                  <option value="">Select client...</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-bb-muted mb-1">
                  Schedule <span className="text-bb-dim font-normal">({userTzAbbr})</span>
                </label>
                <input
                  type="datetime-local"
                  value={scheduledAt}
                  onChange={(e) => setScheduledAt(e.target.value)}
                  className="w-full bg-bb-elevated border border-bb-border rounded-lg px-3 py-2 text-white text-sm"
                />
                <p className="text-[10px] text-bb-dim mt-1">{userTimezone}</p>
              </div>
            </div>

            {/* Platform */}
            <div>
              <label className="block text-sm font-medium text-bb-muted mb-1">Platform</label>
              <div className="grid grid-cols-3 sm:grid-cols-7 gap-1.5">
                {PLATFORMS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPlatform(p)}
                    className={`flex flex-col items-center gap-1 px-2 py-2 rounded-lg text-xs transition-colors border ${
                      platform === p
                        ? "border-bb-orange bg-bb-orange/10 text-white"
                        : "border-bb-border bg-bb-elevated text-bb-dim hover:text-bb-muted"
                    }`}
                  >
                    <PlatformIcon platform={p} size={16} />
                    <span className="truncate w-full text-center">{getPlatformLabel(p)}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Account selector (when multiple credentials exist) */}
            {credentials.length > 1 && (
              <div>
                <label className="block text-sm font-medium text-bb-muted mb-1">Account</label>
                <select
                  value={credentialId || ""}
                  onChange={(e) => setCredentialId(e.target.value || null)}
                  className="w-full bg-bb-elevated border border-bb-border rounded-lg px-3 py-2 text-white text-sm"
                >
                  <option value="">Auto-select account</option>
                  {credentials.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label || `${c.platform} account`}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {credentials.length === 0 && clientId && (
              <p className="text-xs text-yellow-400/80">
                No {getPlatformLabel(platform)} credentials found for this client. Add them in the Vault to enable publishing.
              </p>
            )}

            {/* Title (shown for YouTube always, optional for others) */}
            {(platform === "YOUTUBE" || platform === "LINKEDIN") && (
              <div>
                <label className="block text-sm font-medium text-bb-muted mb-1">
                  Title {platform === "YOUTUBE" && <span className="text-red-400">*</span>}
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={platform === "YOUTUBE" ? "Video title..." : "Article title (optional)..."}
                  className="w-full bg-bb-elevated border border-bb-border rounded-lg px-3 py-2 text-white text-sm placeholder:text-bb-dim"
                />
                {limits.title > 0 && <CharCount current={title.length} max={limits.title} />}
              </div>
            )}

            {/* Body / Caption */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-sm font-medium text-bb-muted">
                  {platform === "YOUTUBE" ? "Description" : platform === "TWITTER" ? "Tweet" : "Caption"}
                </label>
                <button
                  type="button"
                  onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                  className={`text-lg px-2 py-0.5 rounded hover:bg-bb-elevated transition-colors ${showEmojiPicker ? "bg-bb-elevated" : ""}`}
                  title="Emoji picker"
                >
                  😊
                </button>
              </div>
              {showEmojiPicker && (
                <div className="mb-2">
                  <EmojiPicker
                    onEmojiClick={(emojiData) => {
                      const textarea = bodyRef.current;
                      if (textarea) {
                        const start = textarea.selectionStart;
                        const end = textarea.selectionEnd;
                        const newBody = body.slice(0, start) + emojiData.emoji + body.slice(end);
                        setBody(newBody);
                        requestAnimationFrame(() => {
                          textarea.focus();
                          const pos = start + emojiData.emoji.length;
                          textarea.setSelectionRange(pos, pos);
                        });
                      } else {
                        setBody(body + emojiData.emoji);
                      }
                    }}
                    width="100%"
                    height={300}
                    theme={"dark" as import("emoji-picker-react").Theme}
                    searchPlaceholder="Search emojis..."
                    previewConfig={{ showPreview: false }}
                  />
                </div>
              )}
              <textarea
                ref={bodyRef}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder={
                  platform === "TWITTER"
                    ? "What's happening?"
                    : platform === "YOUTUBE"
                    ? "Tell viewers about your video..."
                    : platform === "LINKEDIN"
                    ? "Share your thoughts..."
                    : "Write your caption..."
                }
                rows={platform === "TWITTER" ? 3 : 6}
                className="w-full bg-bb-elevated border border-bb-border rounded-lg px-3 py-2 text-white text-sm placeholder:text-bb-dim resize-y whitespace-pre-wrap"
              />
              <CharCount current={body.length} max={limits.body} />
            </div>

            {/* ─── Twitter Thread ─────────────────────────────────────── */}
            {showThread && (
              <Section icon={ListPlus} label="Thread" badge={threadPosts.length}>
                {threadPosts.map((post, idx) => (
                  <div key={idx} className="flex gap-2">
                    <div className="flex flex-col items-center pt-2">
                      <div className="w-6 h-6 rounded-full bg-bb-elevated border border-bb-border flex items-center justify-center text-[10px] text-bb-dim">
                        {idx + 2}
                      </div>
                      {idx < threadPosts.length - 1 && <div className="w-px flex-1 bg-bb-border mt-1" />}
                    </div>
                    <div className="flex-1">
                      <textarea
                        value={post}
                        onChange={(e) => updateThreadPost(idx, e.target.value)}
                        placeholder={`Thread post ${idx + 2}...`}
                        rows={2}
                        className="w-full bg-bb-elevated border border-bb-border rounded-lg px-3 py-2 text-white text-xs placeholder:text-bb-dim resize-none"
                      />
                      <div className="flex items-center justify-between mt-1">
                        <CharCount current={post.length} max={280} />
                        <button type="button" onClick={() => removeThreadPost(idx)} className="text-bb-dim hover:text-red-400">
                          <Minus size={12} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={addThreadPost}
                  className="flex items-center gap-1.5 text-xs text-bb-muted hover:text-white transition-colors"
                >
                  <Plus size={12} /> Add tweet to thread
                </button>
              </Section>
            )}

            {/* ─── Twitter Poll ──────────────────────────────────────── */}
            {showPoll && (
              <Section icon={BarChart3} label="Poll" badge={pollOptions.length > 0 ? "Active" : undefined}>
                {pollOptions.map((opt, idx) => (
                  <div key={idx} className="flex gap-2 items-center">
                    <input
                      type="text"
                      value={opt}
                      onChange={(e) => updatePollOption(idx, e.target.value)}
                      placeholder={`Option ${idx + 1}`}
                      maxLength={25}
                      className="flex-1 bg-bb-elevated border border-bb-border rounded-lg px-3 py-1.5 text-white text-sm placeholder:text-bb-dim"
                    />
                    <button type="button" onClick={() => removePollOption(idx)} className="text-bb-dim hover:text-red-400">
                      <X size={14} />
                    </button>
                  </div>
                ))}
                {pollOptions.length < 4 && (
                  <button
                    type="button"
                    onClick={addPollOption}
                    className="flex items-center gap-1.5 text-xs text-bb-muted hover:text-white"
                  >
                    <Plus size={12} /> Add option {pollOptions.length === 0 ? "(starts poll)" : ""}
                  </button>
                )}
                {pollOptions.length >= 2 && (
                  <div>
                    <label className="text-xs text-bb-dim mb-1 block">Duration</label>
                    <select
                      value={platformSettings.pollDuration || 1440}
                      onChange={(e) => updatePlatformSetting("pollDuration", Number(e.target.value))}
                      className="bg-bb-elevated border border-bb-border rounded-lg px-3 py-1.5 text-white text-sm"
                    >
                      <option value={5}>5 minutes</option>
                      <option value={30}>30 minutes</option>
                      <option value={60}>1 hour</option>
                      <option value={360}>6 hours</option>
                      <option value={720}>12 hours</option>
                      <option value={1440}>1 day</option>
                      <option value={4320}>3 days</option>
                      <option value={10080}>7 days</option>
                    </select>
                  </div>
                )}
              </Section>
            )}

            {/* Media Upload */}
            <div>
              <label className="block text-sm font-medium text-bb-muted mb-1">
                Media
                <span className="text-bb-dim font-normal ml-1.5">
                  {platform === "TIKTOK" || platform === "YOUTUBE"
                    ? "Video"
                    : `Up to ${limits.media} files`}
                </span>
              </label>

              {mediaUrls.length > 0 && (
                <div className="flex gap-2 mb-2 flex-wrap">
                  {mediaUrls.map((url, idx) => (
                    <div
                      key={url}
                      className="relative group w-20 h-20 rounded-lg overflow-hidden border border-bb-border bg-bb-elevated shrink-0"
                    >
                      {isPdf(url) ? (
                        <div className="w-full h-full flex flex-col items-center justify-center bg-bb-surface gap-1">
                          <FileText size={20} className="text-red-400" />
                          <span className="text-[8px] text-bb-dim font-medium">PDF</span>
                        </div>
                      ) : isVideo(url) ? (
                        <div className="w-full h-full flex items-center justify-center bg-bb-surface">
                          <Film size={24} className="text-bb-muted" />
                        </div>
                      ) : (
                        <img src={url} alt="" className="w-full h-full object-cover" />
                      )}
                      <div className="absolute top-0.5 left-0.5 bg-black/70 px-1 py-0.5 rounded text-[9px] text-white/70">
                        {idx + 1}
                      </div>
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

              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`flex flex-col items-center justify-center gap-2 py-5 rounded-lg border-2 border-dashed cursor-pointer transition-colors ${
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
                      <Upload size={16} />
                      <ImageIcon size={16} />
                      <Film size={16} />
                    </div>
                    <p className="text-xs text-bb-dim text-center px-4">
                      Drag & drop or click to upload<br />
                      <span className="text-bb-dim/70">JPEG, PNG, GIF, WebP, HEIC, MP4, MOV, WebM, PDF &middot; Max 500MB</span>
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
                  if (e.target.files?.length) { uploadFiles(e.target.files); e.target.value = ""; }
                }}
              />

              {uploadError && <p className="text-xs text-red-400 mt-1.5">{uploadError}</p>}
            </div>

            {/* Hashtags */}
            <div>
              <label className="block text-sm font-medium text-bb-muted mb-1">
                <Hash size={12} className="inline mr-1" />
                Hashtags
              </label>
              <div className="flex gap-1.5 mb-2 flex-wrap">
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
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addHashtag(); } }}
                  placeholder="Add hashtag..."
                  className="flex-1 bg-bb-elevated border border-bb-border rounded-lg px-3 py-1.5 text-white text-sm placeholder:text-bb-dim"
                />
                <button
                  type="button"
                  onClick={addHashtag}
                  className="px-3 py-1.5 bg-bb-elevated border border-bb-border rounded-lg text-sm text-bb-muted hover:text-white"
                >
                  Add
                </button>
                <button
                  type="button"
                  onClick={suggestHashtags}
                  disabled={suggestingHashtags || (!body && !title)}
                  className="flex items-center gap-1 px-3 py-1.5 bg-bb-elevated border border-bb-border rounded-lg text-sm text-bb-muted hover:text-white disabled:opacity-40 transition-colors"
                  title="Auto-suggest hashtags"
                >
                  {suggestingHashtags ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                </button>
              </div>
            </div>

            {/* ─── Location ──────────────────────────────────────────── */}
            {showLocation && (
              <Section icon={MapPin} label="Location" badge={location ? "Set" : undefined}>
                <input
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="Search location..."
                  className="w-full bg-bb-elevated border border-bb-border rounded-lg px-3 py-1.5 text-white text-sm placeholder:text-bb-dim"
                />
                <p className="text-[10px] text-bb-dim">
                  {platform === "INSTAGRAM"
                    ? "Location appears above your caption in the post"
                    : platform === "TWITTER"
                    ? "Location is added to tweet metadata"
                    : "Location appears on your post"}
                </p>
              </Section>
            )}

            {/* ─── Tag People ────────────────────────────────────────── */}
            {showTagPeople && (
              <Section icon={AtSign} label="Tag People" badge={taggedUsers.length || undefined}>
                <TagInput
                  values={taggedUsers}
                  onChange={setTaggedUsers}
                  searchPlatform={platform}
                  placeholder={
                    platform === "INSTAGRAM"
                      ? "Tag in photo (username)..."
                      : platform === "TWITTER"
                      ? "Mention @username..."
                      : platform === "LINKEDIN"
                      ? "Mention a connection..."
                      : "Tag a person..."
                  }
                />
                <p className="text-[10px] text-bb-dim">
                  {platform === "INSTAGRAM"
                    ? "Tagged users will be notified and your post appears on their tagged page"
                    : platform === "TWITTER"
                    ? "Mentioned users will be notified"
                    : platform === "LINKEDIN"
                    ? "Tagged connections will be notified and may increase reach"
                    : "Tagged people will be notified"}
                </p>
              </Section>
            )}

            {/* ─── Invite Collaborator ───────────────────────────────── */}
            {showCollaborators && (
              <Section icon={UserPlus} label="Invite Collaborators" badge={collaborators.length || undefined}>
                <TagInput
                  values={collaborators}
                  onChange={setCollaborators}
                  searchPlatform={platform}
                  placeholder={
                    platform === "INSTAGRAM"
                      ? "Invite collaborator (username)..."
                      : "Add co-author..."
                  }
                />
                <p className="text-[10px] text-bb-dim">
                  {platform === "INSTAGRAM"
                    ? "Collaborators share the post on both profiles. They must accept the invite."
                    : "Co-authored posts appear on both profiles and reach combined audiences."}
                </p>
              </Section>
            )}

            {/* ─── First Comment (Instagram) ─────────────────────────── */}
            {showFirstComment && (
              <Section icon={MessageSquare} label="First Comment" badge={firstComment ? "Set" : undefined}>
                <textarea
                  value={firstComment}
                  onChange={(e) => setFirstComment(e.target.value)}
                  placeholder="Auto-post this as the first comment (great for extra hashtags)..."
                  rows={2}
                  className="w-full bg-bb-elevated border border-bb-border rounded-lg px-3 py-1.5 text-white text-xs placeholder:text-bb-dim resize-none"
                />
                <p className="text-[10px] text-bb-dim">
                  Pro tip: Move excess hashtags here to keep your caption clean. This comment is auto-posted immediately after publishing.
                </p>
              </Section>
            )}

            {/* ─── Alt Text ──────────────────────────────────────────── */}
            {showAltText && mediaUrls.length > 0 && (
              <Section icon={Accessibility} label="Alt Text" badge={altText ? "Set" : undefined}>
                <textarea
                  value={altText}
                  onChange={(e) => setAltText(e.target.value)}
                  placeholder="Describe your image for accessibility..."
                  rows={2}
                  className="w-full bg-bb-elevated border border-bb-border rounded-lg px-3 py-1.5 text-white text-xs placeholder:text-bb-dim resize-none"
                />
                <p className="text-[10px] text-bb-dim">
                  Alt text helps visually impaired users understand your content. It also improves SEO and discoverability.
                </p>
              </Section>
            )}
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* MEDIA LIBRARY TAB */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        {activeTab === "media" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-medium text-white">Client Media Library</h3>
                <p className="text-[10px] text-bb-dim mt-0.5">
                  Files uploaded by your client or by you. Select files to add to this post.
                </p>
              </div>
              {clientId && (
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      const res = await fetch(`/api/clients/${clientId}/upload-token`, { method: "POST" });
                      const data = await res.json();
                      if (data.success && data.data.uploadToken) {
                        const link = `${window.location.origin}/upload/${data.data.uploadToken}`;
                        await navigator.clipboard.writeText(link);
                        setUploadLinkCopied(true);
                        setTimeout(() => setUploadLinkCopied(false), 3000);
                      }
                    } catch { /* silent */ }
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-bb-elevated border border-bb-border rounded-lg text-xs text-bb-muted hover:text-white transition-colors"
                >
                  {uploadLinkCopied ? (
                    <><Copy size={12} className="text-green-400" /> Copied!</>
                  ) : (
                    <><Link2 size={12} /> Copy Upload Link</>
                  )}
                </button>
              )}
            </div>

            <MediaLibrary
              clientId={clientId}
              selectedUrls={mediaUrls}
              onSelect={(urls) => setMediaUrls(urls)}
              allowedTypes={["IMAGE", "VIDEO", "AUDIO"]}
            />

            {/* Send to phone */}
            {mediaUrls.some((u) => /\.(mp4|mov|webm)$/i.test(u)) && (
              <Section icon={Smartphone} label="Send to Phone for Editing" badge="Beta">
                <p className="text-xs text-bb-dim">
                  Need to add music via Instagram&apos;s Edits app? Send video files directly to your phone.
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      // Generate QR / deep link for AirDrop/sharing
                      const videoUrls = mediaUrls.filter((u) => /\.(mp4|mov|webm)$/i.test(u));
                      if (videoUrls[0]) window.open(videoUrls[0], "_blank");
                    }}
                    className="flex items-center justify-center gap-1.5 px-3 py-2.5 bg-bb-elevated border border-bb-border rounded-lg text-xs text-bb-muted hover:text-white"
                  >
                    <Smartphone size={14} /> Open Video Link
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      const videoUrls = mediaUrls.filter((u) => /\.(mp4|mov|webm)$/i.test(u));
                      await navigator.clipboard.writeText(videoUrls.join("\n"));
                    }}
                    className="flex items-center justify-center gap-1.5 px-3 py-2.5 bg-bb-elevated border border-bb-border rounded-lg text-xs text-bb-muted hover:text-white"
                  >
                    <Copy size={14} /> Copy Video URLs
                  </button>
                </div>
                <p className="text-[10px] text-bb-dim">
                  Open the link on your phone to download, edit in Edits/CapCut, then re-upload the final version.
                </p>
              </Section>
            )}
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* AUDIO TAB */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        {activeTab === "audio" && (
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-medium text-white">Audio & Music</h3>
              <p className="text-[10px] text-bb-dim mt-0.5">
                Browse royalty-free music, upload your own audio, or mix audio into video before publishing.
              </p>
            </div>

            <AudioPanel
              videoUrl={mediaUrls.find((u) => /\.(mp4|mov|webm)$/i.test(u))}
              onAudioSelected={(url) => {
                // Add audio to media URLs if not already there
                if (!mediaUrls.includes(url)) {
                  setMediaUrls((prev) => [...prev, url]);
                }
              }}
              onMixComplete={(mixedUrl) => {
                // Replace the original video with the mixed version
                setMediaUrls((prev) => {
                  const videoIdx = prev.findIndex((u) => /\.(mp4|mov|webm)$/i.test(u));
                  if (videoIdx >= 0) {
                    const updated = [...prev];
                    updated[videoIdx] = mixedUrl;
                    return updated;
                  }
                  return [...prev, mixedUrl];
                });
              }}
            />
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* SETTINGS TAB */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        {activeTab === "settings" && (
          <div className="space-y-4">
            {/* Status */}
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

            {/* Visibility */}
            {showVisibility && (
              <div>
                <label className="block text-sm font-medium text-bb-muted mb-1">
                  <Globe size={12} className="inline mr-1" />
                  Visibility
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { value: "PUBLIC", icon: Globe, label: "Public" },
                    { value: "UNLISTED", icon: EyeIcon, label: "Unlisted" },
                    { value: "PRIVATE", icon: Lock, label: "Private" },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setVisibility(opt.value)}
                      className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm border transition-colors ${
                        visibility === opt.value
                          ? "border-bb-orange bg-bb-orange/10 text-white"
                          : "border-bb-border bg-bb-elevated text-bb-dim hover:text-bb-muted"
                      }`}
                    >
                      <opt.icon size={14} />
                      {opt.label}
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-bb-dim mt-1">
                  {platform === "YOUTUBE"
                    ? "Public videos are visible to everyone. Unlisted = link only. Private = only you."
                    : platform === "TIKTOK"
                    ? "Controls who can view your TikTok."
                    : "Controls post visibility."}
                </p>
              </div>
            )}

            {/* Comments toggle */}
            <div className="flex items-center justify-between py-2">
              <div className="flex items-center gap-2">
                <MessageSquare size={14} className="text-bb-muted" />
                <span className="text-sm text-bb-muted">Allow Comments</span>
              </div>
              <button
                type="button"
                onClick={() => setEnableComments(!enableComments)}
                className={`relative w-10 h-5 rounded-full transition-colors ${
                  enableComments ? "bg-bb-orange" : "bg-bb-border"
                }`}
              >
                <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                  enableComments ? "left-5" : "left-0.5"
                }`} />
              </button>
            </div>

            {/* ─── Cover Image (Instagram Reels / TikTok) ────────── */}
            {showCoverImage && (
              <div>
                <label className="block text-sm font-medium text-bb-muted mb-1">
                  <ImagePlus size={12} className="inline mr-1" />
                  Cover Image
                </label>
                {coverImageUrl ? (
                  <div className="relative inline-block">
                    <img src={coverImageUrl} alt="" className="w-24 h-24 object-cover rounded-lg border border-bb-border" />
                    <button
                      type="button"
                      onClick={() => setCoverImageUrl("")}
                      className="absolute -top-1 -right-1 p-0.5 rounded-full bg-red-500 text-white"
                    >
                      <X size={10} />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => coverInputRef.current?.click()}
                    className="flex items-center gap-2 px-4 py-3 bg-bb-elevated border border-bb-border border-dashed rounded-lg text-sm text-bb-dim hover:text-bb-muted"
                  >
                    {uploadingCover ? <Loader2 size={14} className="animate-spin" /> : <ImagePlus size={14} />}
                    Choose cover image
                  </button>
                )}
                <input
                  ref={coverInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files?.length) {
                      uploadSingleFile(e.target.files, setCoverImageUrl, setUploadingCover);
                      e.target.value = "";
                    }
                  }}
                />
                <p className="text-[10px] text-bb-dim mt-1">
                  {platform === "INSTAGRAM"
                    ? "Cover image shown on your profile grid for Reels"
                    : "Cover frame shown before video plays"}
                </p>
              </div>
            )}

            {/* ─── YouTube Thumbnail ─────────────────────────────── */}
            {showThumbnail && (
              <div>
                <label className="block text-sm font-medium text-bb-muted mb-1">
                  <ImagePlus size={12} className="inline mr-1" />
                  Custom Thumbnail
                </label>
                {thumbnailUrl ? (
                  <div className="relative inline-block">
                    <img src={thumbnailUrl} alt="" className="w-40 h-24 object-cover rounded-lg border border-bb-border" />
                    <button
                      type="button"
                      onClick={() => setThumbnailUrl("")}
                      className="absolute -top-1 -right-1 p-0.5 rounded-full bg-red-500 text-white"
                    >
                      <X size={10} />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => thumbInputRef.current?.click()}
                    className="flex items-center gap-2 px-4 py-3 bg-bb-elevated border border-bb-border border-dashed rounded-lg text-sm text-bb-dim hover:text-bb-muted"
                  >
                    {uploadingThumb ? <Loader2 size={14} className="animate-spin" /> : <ImagePlus size={14} />}
                    Upload thumbnail (1280x720 recommended)
                  </button>
                )}
                <input
                  ref={thumbInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files?.length) {
                      uploadSingleFile(e.target.files, setThumbnailUrl, setUploadingThumb);
                      e.target.value = "";
                    }
                  }}
                />
              </div>
            )}

            {/* ─── YouTube-specific Settings ─────────────────────── */}
            {showYouTubeSettings && (
              <Section icon={Settings2} label="YouTube Settings" defaultOpen>
                <div>
                  <label className="text-xs text-bb-dim mb-1 block">Category</label>
                  <select
                    value={platformSettings.category || ""}
                    onChange={(e) => updatePlatformSetting("category", e.target.value)}
                    className="w-full bg-bb-elevated border border-bb-border rounded-lg px-3 py-1.5 text-white text-sm"
                  >
                    <option value="">Select category...</option>
                    {YOUTUBE_CATEGORIES.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs text-bb-dim mb-1 block">Playlist</label>
                  <input
                    type="text"
                    value={platformSettings.playlist || ""}
                    onChange={(e) => updatePlatformSetting("playlist", e.target.value)}
                    placeholder="Add to playlist..."
                    className="w-full bg-bb-elevated border border-bb-border rounded-lg px-3 py-1.5 text-white text-sm placeholder:text-bb-dim"
                  />
                </div>

                <div>
                  <label className="text-xs text-bb-dim mb-1 block">Tags (comma-separated)</label>
                  <input
                    type="text"
                    value={(platformSettings.ytTags || []).join(", ")}
                    onChange={(e) =>
                      updatePlatformSetting(
                        "ytTags",
                        e.target.value.split(",").map((t) => t.trim()).filter(Boolean)
                      )
                    }
                    placeholder="tag1, tag2, tag3..."
                    className="w-full bg-bb-elevated border border-bb-border rounded-lg px-3 py-1.5 text-white text-sm placeholder:text-bb-dim"
                  />
                  <p className="text-[10px] text-bb-dim mt-1">YouTube tags help with search discovery. Max 500 chars total.</p>
                </div>

                <div className="flex items-center justify-between py-1">
                  <span className="text-xs text-bb-muted">Made for Kids</span>
                  <button
                    type="button"
                    onClick={() => updatePlatformSetting("madeForKids", !platformSettings.madeForKids)}
                    className={`relative w-10 h-5 rounded-full transition-colors ${
                      platformSettings.madeForKids ? "bg-bb-orange" : "bg-bb-border"
                    }`}
                  >
                    <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                      platformSettings.madeForKids ? "left-5" : "left-0.5"
                    }`} />
                  </button>
                </div>
              </Section>
            )}

            {/* ─── TikTok-specific Settings ──────────────────────── */}
            {showTikTokSettings && (
              <Section icon={Settings2} label="TikTok Settings" defaultOpen>
                {[
                  { key: "allowDuet" as const, label: "Allow Duet", default: true },
                  { key: "allowStitch" as const, label: "Allow Stitch", default: true },
                ].map((setting) => (
                  <div key={setting.key} className="flex items-center justify-between py-1">
                    <span className="text-xs text-bb-muted">{setting.label}</span>
                    <button
                      type="button"
                      onClick={() =>
                        updatePlatformSetting(setting.key, !(platformSettings[setting.key] ?? setting.default))
                      }
                      className={`relative w-10 h-5 rounded-full transition-colors ${
                        (platformSettings[setting.key] ?? setting.default) ? "bg-bb-orange" : "bg-bb-border"
                      }`}
                    >
                      <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                        (platformSettings[setting.key] ?? setting.default) ? "left-5" : "left-0.5"
                      }`} />
                    </button>
                  </div>
                ))}
              </Section>
            )}

            {/* ─── Instagram-specific Settings ───────────────────── */}
            {showInstagramSettings && (
              <Section icon={Settings2} label="Instagram Settings" defaultOpen>
                <div className="flex items-center justify-between py-1">
                  <span className="text-xs text-bb-muted">Also share to Feed</span>
                  <button
                    type="button"
                    onClick={() => updatePlatformSetting("shareToFeed", !(platformSettings.shareToFeed ?? true))}
                    className={`relative w-10 h-5 rounded-full transition-colors ${
                      (platformSettings.shareToFeed ?? true) ? "bg-bb-orange" : "bg-bb-border"
                    }`}
                  >
                    <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                      (platformSettings.shareToFeed ?? true) ? "left-5" : "left-0.5"
                    }`} />
                  </button>
                </div>
                <div className="flex items-center justify-between py-1">
                  <span className="text-xs text-bb-muted">Share to Story</span>
                  <button
                    type="button"
                    onClick={() => updatePlatformSetting("shareToStory", !platformSettings.shareToStory)}
                    className={`relative w-10 h-5 rounded-full transition-colors ${
                      platformSettings.shareToStory ? "bg-bb-orange" : "bg-bb-border"
                    }`}
                  >
                    <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                      platformSettings.shareToStory ? "left-5" : "left-0.5"
                    }`} />
                  </button>
                </div>
              </Section>
            )}

            {/* ─── Facebook-specific Settings ────────────────────── */}
            {showFacebookSettings && (
              <Section icon={Settings2} label="Facebook Settings">
                <div>
                  <label className="text-xs text-bb-dim mb-1 block">Feeling / Activity</label>
                  <select
                    value={platformSettings.feeling || ""}
                    onChange={(e) => updatePlatformSetting("feeling", e.target.value)}
                    className="w-full bg-bb-elevated border border-bb-border rounded-lg px-3 py-1.5 text-white text-sm"
                  >
                    <option value="">None</option>
                    {FACEBOOK_FEELINGS.map((f) => (
                      <option key={f} value={f}>feeling {f}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-bb-dim mb-1 block">Album</label>
                  <input
                    type="text"
                    value={platformSettings.album || ""}
                    onChange={(e) => updatePlatformSetting("album", e.target.value)}
                    placeholder="Add photos to album..."
                    className="w-full bg-bb-elevated border border-bb-border rounded-lg px-3 py-1.5 text-white text-sm placeholder:text-bb-dim"
                  />
                </div>
              </Section>
            )}

            {/* ─── LinkedIn Article Mode ─────────────────────────── */}
            {platform === "LINKEDIN" && (
              <>
                <div className="flex items-center justify-between py-2">
                  <div className="flex items-center gap-2">
                    <FileText size={14} className="text-bb-muted" />
                    <div>
                      <span className="text-sm text-bb-muted">Article Mode</span>
                      <p className="text-[10px] text-bb-dim">Publish as a LinkedIn article instead of a post</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => updatePlatformSetting("articleMode", !platformSettings.articleMode)}
                    className={`relative w-10 h-5 rounded-full transition-colors ${
                      platformSettings.articleMode ? "bg-bb-orange" : "bg-bb-border"
                    }`}
                  >
                    <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                      platformSettings.articleMode ? "left-5" : "left-0.5"
                    }`} />
                  </button>
                </div>
                {mediaUrls.some(isPdf) && (
                  <div>
                    <label className="block text-sm font-medium text-bb-muted mb-1">
                      <FileText size={12} className="inline mr-1" />
                      Document Title
                      <span className="text-bb-dim font-normal ml-1.5">Carousel slide deck name</span>
                    </label>
                    <input
                      type="text"
                      value={platformSettings.documentTitle || ""}
                      onChange={(e) => updatePlatformSetting("documentTitle", e.target.value)}
                      placeholder="e.g. 10 Tips for Social Media Growth"
                      className="w-full bg-bb-elevated border border-bb-border rounded-lg px-3 py-1.5 text-white text-sm placeholder:text-bb-dim"
                    />
                  </div>
                )}
              </>
            )}

            {/* Quote tweet URL */}
            {platform === "TWITTER" && (
              <div>
                <label className="block text-sm font-medium text-bb-muted mb-1">Quote Tweet URL</label>
                <input
                  type="url"
                  value={platformSettings.quoteTweetUrl || ""}
                  onChange={(e) => updatePlatformSetting("quoteTweetUrl", e.target.value)}
                  placeholder="https://x.com/user/status/..."
                  className="w-full bg-bb-elevated border border-bb-border rounded-lg px-3 py-1.5 text-white text-sm placeholder:text-bb-dim"
                />
              </div>
            )}
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* PREVIEW TAB */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        {activeTab === "preview" && (
          <div className="py-2">
            <PostPreview
              platform={platform}
              title={title}
              body={body}
              hashtags={hashtags}
              mediaUrls={mediaUrls}
            />

            {/* Summary of settings */}
            <div className="mt-4 p-3 bg-bb-elevated rounded-lg space-y-1.5">
              <p className="text-xs font-medium text-bb-muted mb-2">Post Details</p>
              {location && (
                <div className="flex items-center gap-1.5 text-xs text-bb-dim">
                  <MapPin size={10} /> {location}
                </div>
              )}
              {taggedUsers.length > 0 && (
                <div className="flex items-center gap-1.5 text-xs text-bb-dim">
                  <AtSign size={10} /> {taggedUsers.map((u) => `@${u}`).join(", ")}
                </div>
              )}
              {collaborators.length > 0 && (
                <div className="flex items-center gap-1.5 text-xs text-bb-dim">
                  <UserPlus size={10} /> Collaborators: {collaborators.map((u) => `@${u}`).join(", ")}
                </div>
              )}
              {firstComment && (
                <div className="flex items-center gap-1.5 text-xs text-bb-dim">
                  <MessageSquare size={10} /> First comment set
                </div>
              )}
              {altText && (
                <div className="flex items-center gap-1.5 text-xs text-bb-dim">
                  <Accessibility size={10} /> Alt text set
                </div>
              )}
              <div className="flex items-center gap-1.5 text-xs text-bb-dim">
                <Globe size={10} /> {visibility}
              </div>
              <div className="flex items-center gap-1.5 text-xs text-bb-dim">
                <MessageSquare size={10} /> Comments {enableComments ? "on" : "off"}
              </div>
              {scheduledAt && (
                <div className="flex items-center gap-1.5 text-xs text-bb-dim">
                  <Clock size={10} /> Scheduled: {new Date(scheduledAt).toLocaleString()}
                </div>
              )}
              {platformSettings.threadPosts && platformSettings.threadPosts.length > 0 && (
                <div className="flex items-center gap-1.5 text-xs text-bb-dim">
                  <ListPlus size={10} /> Thread: {platformSettings.threadPosts.length + 1} tweets
                </div>
              )}
              {platformSettings.pollOptions && platformSettings.pollOptions.length >= 2 && (
                <div className="flex items-center gap-1.5 text-xs text-bb-dim">
                  <BarChart3 size={10} /> Poll: {platformSettings.pollOptions.length} options
                </div>
              )}
            </div>

            {/* Send-to-Device for video platforms (IG, TikTok) */}
            {(platform === "INSTAGRAM" || platform === "TIKTOK") && mediaUrls.length > 0 && (
              <div className="mt-4">
                <SendToDevice
                  platform={platform}
                  caption={[body, hashtags.map((t) => (t.startsWith("#") ? t : `#${t}`)).join(" ")].filter(Boolean).join("\n\n")}
                  mediaUrls={mediaUrls}
                  firstComment={firstComment}
                  taggedUsers={taggedUsers}
                  location={location}
                />
              </div>
            )}

            {/* Direct publish note for API platforms */}
            {(platform === "TWITTER" || platform === "LINKEDIN" || platform === "FACEBOOK" || platform === "YOUTUBE") && (
              <div className="mt-4 p-3 bg-green-500/5 border border-green-500/20 rounded-lg">
                <p className="text-xs text-green-300 flex items-center gap-1.5">
                  <Check size={12} />
                  <span>
                    <strong>{getPlatformLabel(platform)}</strong> publishes directly via API.
                    {scheduledAt ? " Your post will auto-publish at the scheduled time." : " Hit Create Post to publish now."}
                  </span>
                </p>
              </div>
            )}
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* ACTIONS */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        <div className="flex items-center justify-between gap-3 mt-6 pt-4 border-t border-bb-border">
          <div className="flex items-center gap-1 text-[10px] text-bb-dim">
            <PlatformIcon platform={platform} size={12} />
            {getPlatformLabel(platform)}
            {mediaUrls.length > 0 && <span>· {mediaUrls.length} media</span>}
            {hashtags.length > 0 && <span>· {hashtags.length} tags</span>}
          </div>
          <div className="flex items-center gap-3">
            {(platform === "INSTAGRAM" || platform === "TIKTOK") && mediaUrls.some((u) => /\.(mp4|mov|webm)$/i.test(u)) && (
              <span className="text-[10px] text-purple-400 flex items-center gap-1">
                <Smartphone size={10} /> Post via app
              </span>
            )}
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
              className="px-5 py-2 bg-bb-orange text-white rounded-lg text-sm font-medium hover:bg-bb-orange/90 transition-colors disabled:opacity-50"
            >
              {saving ? "Saving..." : initialData?.id ? "Update" : "Create Post"}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
