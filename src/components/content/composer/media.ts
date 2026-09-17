import type { MediaMeta } from "./types";

const VIDEO_RE = /\.(mp4|mov|m4v|webm)(\?|#|$)/i;
const IMAGE_RE = /\.(jpe?g|png|gif|webp|heic|heif|avif)(\?|#|$)/i;
const AUDIO_RE = /\.(mp3|wav|ogg|m4a|aac|weba)(\?|#|$)/i;

export function kindFromMime(mime: string | null | undefined, url: string): MediaMeta["kind"] {
  if (mime?.startsWith("image/")) return "image";
  if (mime?.startsWith("video/")) return "video";
  if (mime?.startsWith("audio/")) return "audio";
  if (VIDEO_RE.test(url)) return "video";
  if (IMAGE_RE.test(url)) return "image";
  if (AUDIO_RE.test(url)) return "audio";
  return "document";
}

interface ClientMediaRow {
  id?: string;
  url: string;
  filename?: string;
  fileType?: string;
  mimeType?: string | null;
  fileSize?: number | null;
  width?: number | null;
  height?: number | null;
  duration?: number | null;
  thumbnailUrl?: string | null;
}

export function metaFromClientMedia(row: ClientMediaRow): MediaMeta {
  const kind =
    row.fileType === "IMAGE" ? "image" : row.fileType === "VIDEO" ? "video" : row.fileType === "AUDIO" ? "audio" : kindFromMime(row.mimeType, row.url);
  return {
    url: row.url,
    ...(row.id ? { id: row.id } : {}),
    kind,
    filename: row.filename,
    mimeType: row.mimeType ?? null,
    size: row.fileSize ?? null,
    width: row.width ?? null,
    height: row.height ?? null,
    duration: row.duration ?? null,
    thumbnailUrl: row.thumbnailUrl ?? null,
  };
}

/** Read width/height (and duration for video) in the browser. Resolves to {} if it can't. */
export function probeMedia(url: string, kind: MediaMeta["kind"]): Promise<Partial<MediaMeta>> {
  return new Promise((resolve) => {
    const done = (v: Partial<MediaMeta>) => resolve(v);
    const timer = setTimeout(() => done({}), 15000);
    if (kind === "image") {
      const img = new Image();
      img.onload = () => {
        clearTimeout(timer);
        done({ width: img.naturalWidth || null, height: img.naturalHeight || null });
      };
      img.onerror = () => {
        clearTimeout(timer);
        done({});
      };
      img.src = url;
    } else if (kind === "video") {
      const video = document.createElement("video");
      video.preload = "metadata";
      video.muted = true;
      video.onloadedmetadata = () => {
        clearTimeout(timer);
        done({
          width: video.videoWidth || null,
          height: video.videoHeight || null,
          duration: Number.isFinite(video.duration) ? video.duration : null,
        });
        video.removeAttribute("src");
        video.load();
      };
      video.onerror = () => {
        clearTimeout(timer);
        done({});
      };
      video.src = url;
    } else {
      clearTimeout(timer);
      done({});
    }
  });
}

/** Probe a local File before upload (same fields). */
export function probeFile(file: File): Promise<Partial<MediaMeta>> {
  const kind = kindFromMime(file.type, file.name);
  if (kind !== "image" && kind !== "video") return Promise.resolve({});
  const objectUrl = URL.createObjectURL(file);
  return probeMedia(objectUrl, kind).finally(() => URL.revokeObjectURL(objectUrl));
}

export function formatDuration(seconds?: number | null): string {
  if (!seconds && seconds !== 0) return "";
  const s = Math.round(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function formatBytes(bytes?: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function aspectLabel(w?: number | null, h?: number | null): string {
  if (!w || !h) return "";
  const r = w / h;
  const known: [number, string][] = [
    [9 / 16, "9:16"],
    [4 / 5, "4:5"],
    [1, "1:1"],
    [16 / 9, "16:9"],
    [1.91, "1.91:1"],
    [3 / 4, "3:4"],
    [4 / 3, "4:3"],
  ];
  const hit = known.find(([k]) => Math.abs(k - r) < 0.02);
  return hit ? hit[1] : r.toFixed(2);
}
