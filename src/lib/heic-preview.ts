import { put } from "@vercel/blob";
import prisma from "@/lib/prisma";
import { fetchBlobBounded } from "@/lib/blob-fetch";

/**
 * HEIC/HEIF display previews.
 *
 * Browsers other than Safari can't render HEIC, and the Next image optimizer
 * can't decode it either. Originals are NEVER converted or replaced — the
 * stored file stays byte-for-byte what was uploaded. Instead a JPEG preview is
 * generated as a separate derivative (same pattern as video thumbnails) and
 * saved on ClientMedia.thumbnailUrl for the galleries to display.
 */

const MAX_HEIC_BYTES = 100 * 1024 * 1024;

export function isHeicImage(mimeType?: string | null, filename?: string | null): boolean {
  if (mimeType === "image/heic" || mimeType === "image/heif") return true;
  return /\.(heic|heif)$/i.test(filename || "");
}

export async function heicToJpegPreview(buffer: Buffer): Promise<Buffer> {
  const heicConvert = (await import("heic-convert")).default;
  const converted = await heicConvert({ buffer, format: "JPEG", quality: 0.95 });
  return Buffer.from(converted);
}

/**
 * Fetch a stored HEIC original, render a JPEG preview blob, and stamp it on
 * the media record. Returns the preview URL, or null on any failure (the
 * gallery then falls back to the original URL, exactly as before).
 */
export async function generateHeicPreview(url: string, mediaId: string): Promise<string | null> {
  try {
    const buffer = await fetchBlobBounded(url, MAX_HEIC_BYTES);
    const jpeg = await heicToJpegPreview(buffer);
    const blob = await put(`client-media/previews/${mediaId}.jpg`, jpeg, {
      access: "public",
      allowOverwrite: true,
      contentType: "image/jpeg",
    });
    await prisma.clientMedia.update({
      where: { id: mediaId },
      data: { thumbnailUrl: blob.url },
    });
    return blob.url;
  } catch (err) {
    console.error("[heic-preview] failed for", mediaId, err);
    return null;
  }
}
