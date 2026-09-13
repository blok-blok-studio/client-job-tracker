/**
 * Instagram's publishing API only accepts JPEG images up to 8 MB.
 *
 * When a post's image is PNG, WebP, GIF or HEIC (or a JPEG over the limit), a
 * high-quality JPEG derivative is rendered at publish time and stored as a
 * separate Blob. The original upload is never touched (Chase's rule: no quality
 * loss on stored media); the derivative only exists so Instagram can fetch it.
 */

import { fetchWithRetry } from "./http";
import { put } from "@vercel/blob";
import { fetchBlobBounded } from "@/lib/blob-fetch";
import { PublishValidationError } from "./types";

const IG_MAX_IMAGE_BYTES = 8 * 1024 * 1024;
/** Largest source we'll pull into memory to convert */
const MAX_SOURCE_BYTES = 60 * 1024 * 1024;

const JPEG_EXT = /\.jpe?g(\?|#|$)/i;
const HEIC_EXT = /\.(heic|heif)(\?|#|$)/i;

async function headInfo(url: string): Promise<{ type: string; size: number }> {
  const res = await fetchWithRetry(url, { method: "HEAD" });
  return {
    type: (res.headers.get("content-type") || "").toLowerCase(),
    size: Number(res.headers.get("content-length")) || 0,
  };
}

async function loadSharp() {
  try {
    return (await import("sharp")).default;
  } catch {
    throw new PublishValidationError(
      "Instagram only accepts JPEG images and this image couldn't be converted on the server. Upload a JPEG version and try again."
    );
  }
}

/**
 * Returns a URL Instagram can ingest for this image: the original when it's
 * already a JPEG within limits, otherwise a JPEG derivative Blob.
 */
export async function ensureInstagramJpeg(url: string, postId: string, index: number): Promise<string> {
  const { type, size } = await headInfo(url);
  const isJpeg = type === "image/jpeg" || (!type && JPEG_EXT.test(url));
  if (isJpeg && size > 0 && size <= IG_MAX_IMAGE_BYTES) return url;

  const source = await fetchBlobBounded(url, MAX_SOURCE_BYTES).catch(() => {
    throw new PublishValidationError(
      "Couldn't read an image to convert it for Instagram. Use a JPEG under 8 MB, or re-upload the image."
    );
  });

  const isHeic = type.includes("heic") || type.includes("heif") || HEIC_EXT.test(url);
  let jpeg: Buffer = source;
  if (isHeic) {
    // sharp's prebuilt libvips can't decode HEIC, so heic-convert goes first
    const heicConvert = (await import("heic-convert")).default;
    jpeg = Buffer.from(await heicConvert({ buffer: source, format: "JPEG", quality: 0.95 }));
  }
  // What sharp re-encodes from: the decoded HEIC, or the original bytes
  const input = jpeg;

  // Non-JPEG sources, or anything still over the size cap, go through sharp.
  // Step quality down only as far as needed to fit Instagram's 8 MB limit.
  if (!(isJpeg || isHeic) || jpeg.length > IG_MAX_IMAGE_BYTES) {
    const sharp = await loadSharp();
    for (const quality of [95, 90, 85, 80]) {
      jpeg = await sharp(input, { failOn: "none" })
        .rotate()
        .flatten({ background: "#ffffff" })
        .toColorspace("srgb")
        .jpeg({ quality, chromaSubsampling: "4:4:4", mozjpeg: true })
        .toBuffer();
      if (jpeg.length <= IG_MAX_IMAGE_BYTES) break;
    }
  }

  if (jpeg.length > IG_MAX_IMAGE_BYTES) {
    throw new PublishValidationError("This image is too large for Instagram even after conversion. Use an image under 8 MB.");
  }

  const blob = await put(`social/instagram/${postId}/${index}.jpg`, jpeg, {
    access: "public",
    allowOverwrite: true,
    contentType: "image/jpeg",
  });
  return blob.url;
}
