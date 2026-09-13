/**
 * Helpers for moving stored media (Vercel Blob URLs) to platforms without
 * holding whole files in memory: size probing and ranged reads for chunked
 * uploads, plus media-type sniffing from the URL.
 */

const VIDEO_EXT = /\.(mp4|mov|m4v|webm)(\?|#|$)/i;
const IMAGE_EXT = /\.(jpe?g|png|gif|webp|heic|heif)(\?|#|$)/i;

export function isVideoUrl(url: string): boolean {
  return VIDEO_EXT.test(url);
}

export function isImageUrl(url: string): boolean {
  return IMAGE_EXT.test(url);
}

export function guessVideoContentType(url: string): string {
  if (/\.mov(\?|#|$)/i.test(url)) return "video/quicktime";
  if (/\.webm(\?|#|$)/i.test(url)) return "video/webm";
  return "video/mp4";
}

/** Total byte size of a remote file (HEAD, falling back to a 1-byte ranged GET). */
export async function getRemoteSize(url: string): Promise<number> {
  const head = await fetch(url, { method: "HEAD" });
  const len = Number(head.headers.get("content-length"));
  if (head.ok && len > 0) return len;

  const probe = await fetch(url, { headers: { Range: "bytes=0-0" } });
  const range = probe.headers.get("content-range"); // "bytes 0-0/12345"
  await probe.body?.cancel();
  const total = range ? Number(range.split("/")[1]) : NaN;
  if (!Number.isFinite(total) || total <= 0) {
    throw new Error("Couldn't read the media file size. Re-upload the file and try again.");
  }
  return total;
}

/** Bytes [start, endInclusive] of a remote file. */
export async function fetchRange(url: string, start: number, endInclusive: number): Promise<Buffer> {
  const res = await fetch(url, { headers: { Range: `bytes=${start}-${endInclusive}` } });
  if (res.status !== 206 && !(res.ok && start === 0)) {
    throw new Error(`Media read failed (${res.status}) for bytes ${start}-${endInclusive}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  // A server that ignored Range returns the whole file; slice defensively
  return res.status === 206 ? buf : buf.subarray(start, endInclusive + 1);
}
