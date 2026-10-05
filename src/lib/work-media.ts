import prisma from "@/lib/prisma";
import { generateVideoThumbnail, transcodeToWebMp4, needsPlaybackTranscode } from "@/lib/server-video-thumbnail";
import { isHeicImage, generateHeicPreview } from "@/lib/heic-preview";

// Finished work uploaded through the Work tab or a contractor's Submit Work
// tab lands in the client's Files tab (ClientFile). Videos, photos and audio
// are ALSO listed in the media gallery (ClientMedia: the Files page and the
// client's media tab), because that is where the team looks for content.
// All three rows point at the same stored original; nothing is copied or
// re-encoded.

type MediaKind = "IMAGE" | "VIDEO" | "AUDIO";

// Safari reports an empty type for HEIC photos and iCloud files, so fall back
// to the extension.
const KIND_BY_EXTENSION: Record<string, { kind: MediaKind; mime: string }> = {
  jpg: { kind: "IMAGE", mime: "image/jpeg" },
  jpeg: { kind: "IMAGE", mime: "image/jpeg" },
  png: { kind: "IMAGE", mime: "image/png" },
  webp: { kind: "IMAGE", mime: "image/webp" },
  gif: { kind: "IMAGE", mime: "image/gif" },
  heic: { kind: "IMAGE", mime: "image/heic" },
  heif: { kind: "IMAGE", mime: "image/heic" },
  mp4: { kind: "VIDEO", mime: "video/mp4" },
  m4v: { kind: "VIDEO", mime: "video/x-m4v" },
  mov: { kind: "VIDEO", mime: "video/quicktime" },
  webm: { kind: "VIDEO", mime: "video/webm" },
  mp3: { kind: "AUDIO", mime: "audio/mpeg" },
  m4a: { kind: "AUDIO", mime: "audio/mp4" },
  wav: { kind: "AUDIO", mime: "audio/wav" },
};

/** Gallery type for a file, or null when it is not a photo, video or audio. */
export function galleryMediaType(
  mimeType: string | null | undefined,
  filename: string
): { kind: MediaKind; mime: string } | null {
  const mime = (mimeType || "").toLowerCase();
  if (mime.startsWith("image/")) return { kind: "IMAGE", mime };
  if (mime.startsWith("video/")) return { kind: "VIDEO", mime };
  if (mime.startsWith("audio/")) return { kind: "AUDIO", mime };
  const ext = filename.split(".").pop()?.toLowerCase();
  return (ext && KIND_BY_EXTENSION[ext]) || null;
}

export interface MirroredMedia {
  id: string;
  url: string;
  filename: string;
  kind: MediaKind;
  mime: string;
  fileSize: number;
}

/**
 * List a client-tagged work file in the media gallery. Returns null when the
 * file is not media or the gallery already has this stored file.
 */
export async function mirrorWorkFileToMedia(file: {
  clientId: string;
  url: string;
  filename: string;
  mimeType?: string | null;
  fileSize?: number | null;
  folder?: string | null;
  notes?: string | null;
  createdAt?: Date;
}): Promise<MirroredMedia | null> {
  const type = galleryMediaType(file.mimeType, file.filename);
  if (!type) return null;

  const existing = await prisma.clientMedia.findFirst({
    where: { url: file.url },
    select: { id: true },
  });
  if (existing) return null;

  const fileSize = file.fileSize ?? 0;
  const record = await prisma.clientMedia.create({
    data: {
      clientId: file.clientId,
      url: file.url,
      filename: file.filename,
      fileType: type.kind,
      fileSize,
      mimeType: type.mime,
      folder: file.folder || null,
      notes: file.notes || null,
      uploadedBy: "manager",
      ...(file.createdAt && { createdAt: file.createdAt }),
    },
    select: { id: true },
  });

  return { id: record.id, url: file.url, filename: file.filename, kind: type.kind, mime: type.mime, fileSize };
}

/**
 * Thumbnails, web playback copies and HEIC previews for freshly mirrored
 * media. Slow (ffmpeg), so call it from `after()`. Originals are untouched.
 */
export async function prepareMirroredMedia(items: MirroredMedia[]): Promise<void> {
  for (const m of items) {
    if (m.kind === "VIDEO") {
      const thumbUrl = await generateVideoThumbnail(m.url, m.id).catch(() => null);
      if (thumbUrl) {
        await prisma.clientMedia
          .updateMany({ where: { id: m.id, thumbnailUrl: null }, data: { thumbnailUrl: thumbUrl } })
          .catch(() => {});
      }
      if (needsPlaybackTranscode(m.mime, m.fileSize)) {
        const playbackUrl = await transcodeToWebMp4(m.url, m.id).catch(() => null);
        if (playbackUrl) {
          await prisma.clientMedia
            .updateMany({ where: { id: m.id }, data: { playbackUrl } })
            .catch(() => {});
        }
      }
    } else if (m.kind === "IMAGE" && isHeicImage(m.mime, m.filename)) {
      await generateHeicPreview(m.url, m.id);
    }
  }
}

/**
 * Of the given stored-file URLs, the ones a Files-tab row or a Work record
 * still points at. Removing such a file from the media gallery must only
 * remove the gallery row: deleting the stored file would break the finished
 * work record.
 */
export async function urlsKeptByWorkRecords(urls: string[]): Promise<Set<string>> {
  if (urls.length === 0) return new Set();
  const [files, work] = await Promise.all([
    prisma.clientFile.findMany({ where: { url: { in: urls } }, select: { url: true } }),
    prisma.contractorWorkFile.findMany({ where: { url: { in: urls } }, select: { url: true } }),
  ]);
  return new Set([...files, ...work].map((r) => r.url));
}
