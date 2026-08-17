/**
 * Build a Next.js image-optimizer URL for media grid thumbnails.
 *
 * Grid cells were loading full-resolution originals (often 5–15 MB each);
 * routing them through /_next/image serves resized WebP a fraction of the
 * size, cached at the edge. Falls back to the original URL for anything the
 * optimizer can't handle (SVG, GIF animation preservation, non-blob hosts).
 *
 * Widths must be part of Next's default deviceSizes/imageSizes whitelist.
 */

const BLOB_HOST = /\.public\.blob\.vercel-storage\.com/;
const SKIP_EXT = /\.(svg|gif)(\?|$)/i;

export type ThumbWidth = 256 | 384 | 640 | 1080;

export function optimizedThumb(url: string | null | undefined, width: ThumbWidth = 384): string {
  if (!url) return "";
  if (!BLOB_HOST.test(url) || SKIP_EXT.test(url)) return url;
  return `/_next/image?url=${encodeURIComponent(url)}&w=${width}&q=75`;
}

/**
 * Display source for an IMAGE row. HEIC originals are stored untouched but
 * most browsers can't render them, so uploads generate a JPEG preview saved
 * on thumbnailUrl — prefer it for display when present. Downloads and copy
 * links still use the original url.
 */
export function imageThumb(
  media: { url: string; thumbnailUrl?: string | null },
  width: ThumbWidth = 384
): string {
  return optimizedThumb(media.thumbnailUrl || media.url, width);
}
