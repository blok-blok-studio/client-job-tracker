// Server-side fetch of a browser-uploaded blob, hardened against the two ways a
// client-supplied URL can bite back: (1) memory DoS from an oversized object,
// (2) SSRF via redirects to an internal target.
//
// - The host must be a Vercel Blob public store. If BLOB_STORE_HOST is set we
//   pin to that exact store; otherwise we fall back to the shared suffix (still
//   blocks non-Vercel hosts and @/path tricks).
// - Redirects are NOT followed (redirect: "manual").
// - Content-Length is checked before the body is read, and the stream is
//   aborted if it exceeds the cap even when the header lies.

const STORE_HOST = process.env.BLOB_STORE_HOST; // e.g. "abc123.public.blob.vercel-storage.com"
const SUFFIX_RE = /^https:\/\/[\w-]+\.public\.blob\.vercel-storage\.com\//;

export function isAllowedBlobUrl(url: string): boolean {
  if (!SUFFIX_RE.test(url)) return false;
  if (STORE_HOST) {
    try {
      return new URL(url).host === STORE_HOST;
    } catch {
      return false;
    }
  }
  return true;
}

export class BlobFetchError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function fetchBlobBounded(url: string, maxBytes: number): Promise<Buffer> {
  if (!isAllowedBlobUrl(url)) throw new BlobFetchError("Invalid file URL", 400);

  const res = await fetch(url, { redirect: "manual" });
  // A redirect (3xx) or any non-2xx from the blob store is treated as invalid —
  // stored objects return 200, so a redirect means something is off.
  if (res.status < 200 || res.status >= 300 || !res.body) {
    throw new BlobFetchError("Uploaded file not found", 400);
  }

  const declared = res.headers.get("content-length");
  if (declared && parseInt(declared, 10) > maxBytes) {
    throw new BlobFetchError("File too large", 400);
  }

  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      throw new BlobFetchError("File too large", 400);
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}
