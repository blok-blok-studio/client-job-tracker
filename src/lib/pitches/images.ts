import sharp from "sharp";
import { del } from "@vercel/blob";

export const MAX_UPLOAD_MB = 25;
export const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024;
export const MAX_IMAGES = 20;
export const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif", "image/svg+xml", "image/avif", "image/heic", "image/heif"];
// Direct multipart posts are capped by Vercel's 4.5 MB request limit; bigger files go through Blob
const DIRECT_MAX = 4 * 1024 * 1024;

/** Where the browser may put a temporary upload for this pitch. */
export const uploadPrefix = (pitchId: string) => `pitch-uploads/${pitchId}/`;

export function checkUpload(file: File | null): string | null {
  if (!file || typeof file === "string") return "Pick an image";
  if (!IMAGE_TYPES.includes(file.type)) return "Use a PNG, JPG, WebP, HEIC or SVG image";
  if (file.size > DIRECT_MAX) return "That image is too big to send directly. Reload the page and try again.";
  return null;
}

/**
 * Read a temporary Blob upload made for this pitch. Only our own Blob store and
 * only this pitch's upload folder are accepted, so the server can't be pointed
 * at any other URL. The temporary file is deleted afterwards.
 */
export async function takeBlobUpload(pitchId: string, rawUrl: string): Promise<Buffer | string> {
  let url: URL;
  try { url = new URL(rawUrl); } catch { return "Bad upload link"; }
  if (url.protocol !== "https:" || !/^[a-z0-9]+\.public\.blob\.vercel-storage\.com$/i.test(url.hostname)) return "Bad upload link";
  if (!decodeURIComponent(url.pathname).startsWith(`/${uploadPrefix(pitchId)}`)) return "Bad upload link";
  try {
    const res = await fetch(url, { redirect: "error" });
    if (!res.ok) return "Upload not found. Try again.";
    const len = Number(res.headers.get("content-length") || 0);
    if (len > MAX_UPLOAD_BYTES) return `That image is over ${MAX_UPLOAD_MB} MB`;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > MAX_UPLOAD_BYTES) return `That image is over ${MAX_UPLOAD_MB} MB`;
    return buf;
  } finally {
    await del(url.toString()).catch(() => {});
  }
}

/** SVGs are code: refuse ones that pull in other files, entities or scripts. */
function unsafeSvg(buf: Buffer): boolean {
  const head = buf.subarray(0, 512).toString("utf8").trimStart();
  if (!head.startsWith("<svg") && !head.startsWith("<?xml") && !head.startsWith("<!--")) return false;
  const text = buf.toString("utf8");
  return /<!DOCTYPE|<!ENTITY|<script|<foreignObject|(?:xlink:)?href\s*=\s*["'](?!#|data:image\/)/i.test(text);
}

const opts = { density: 300, limitInputPixels: 100_000_000, failOn: "error" as const };

/** Logo: keep transparency, trim empty margins, max 800px on the long side, PNG. */
export async function normaliseLogo(buf: Buffer): Promise<Buffer> {
  if (unsafeSvg(buf)) throw new Error("unsafe svg");
  const png = await sharp(buf, opts).rotate().png().toBuffer();
  const trimmed = await sharp(png).trim().toBuffer().catch(() => png);
  return sharp(trimmed).resize({ width: 800, height: 800, fit: "inside", withoutEnlargement: true }).png().toBuffer();
}

/** Screenshot: flatten onto white, max 1600px on the long side, JPEG. */
export async function normaliseShot(buf: Buffer): Promise<{ data: Buffer; width: number; height: number }> {
  if (unsafeSvg(buf)) throw new Error("unsafe svg");
  const { data, info } = await sharp(buf, { ...opts, density: 200 })
    .rotate()
    .flatten({ background: "#ffffff" })
    .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 80, mozjpeg: true })
    .toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

/** Body of a logo/screenshot upload: multipart file (small) or { blobUrl } (large). */
export async function readUpload(request: Request, pitchId: string): Promise<{ buf: Buffer; caption: string | null } | { error: string }> {
  const type = request.headers.get("content-type") || "";
  if (type.includes("application/json")) {
    const body = (await request.json().catch(() => null)) as { blobUrl?: unknown; caption?: unknown } | null;
    if (!body || typeof body.blobUrl !== "string") return { error: "Pick an image" };
    const got = await takeBlobUpload(pitchId, body.blobUrl);
    if (typeof got === "string") return { error: got };
    return { buf: got, caption: typeof body.caption === "string" ? body.caption.trim().slice(0, 200) || null : null };
  }
  const form = await request.formData();
  const file = form.get("file") as File | null;
  const bad = checkUpload(file);
  if (bad) return { error: bad };
  return { buf: Buffer.from(await file!.arrayBuffer()), caption: String(form.get("caption") || "").trim().slice(0, 200) || null };
}
