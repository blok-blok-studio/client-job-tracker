import { put } from "@vercel/blob";
import crypto from "crypto";

async function convertHeicToJpeg(buffer: Buffer): Promise<Buffer> {
  const heicConvert = (await import("heic-convert")).default;
  const converted = await heicConvert({ buffer, format: "JPEG", quality: 0.9 });
  return Buffer.from(converted);
}

// No artificial file size limit — Vercel Blob handles up to 5GB
// Vercel serverless functions can handle ~4.5GB request bodies on Pro plan

// Magic bytes for file type validation (prevents MIME spoofing)
const MAGIC_BYTES: Record<string, number[][]> = {
  "image/jpeg": [[0xff, 0xd8, 0xff]],
  "image/png": [[0x89, 0x50, 0x4e, 0x47]],
  "image/gif": [
    [0x47, 0x49, 0x46, 0x38, 0x37], // GIF87a
    [0x47, 0x49, 0x46, 0x38, 0x39], // GIF89a
  ],
  "image/webp": [[0x52, 0x49, 0x46, 0x46]], // RIFF header
  "image/heic": [[0x00, 0x00, 0x00]], // ftyp heic container
  "image/heif": [[0x00, 0x00, 0x00]], // ftyp heif container
  "image/avif": [[0x00, 0x00, 0x00]], // ftyp avif container
  "image/bmp": [[0x42, 0x4d]], // BM
  "image/tiff": [
    [0x49, 0x49, 0x2a, 0x00], // little-endian
    [0x4d, 0x4d, 0x00, 0x2a], // big-endian
  ],
  "video/mp4": [[0x00, 0x00, 0x00]],
  "video/quicktime": [[0x00, 0x00, 0x00]],
  "video/x-m4v": [[0x00, 0x00, 0x00]],
  "video/3gpp": [[0x00, 0x00, 0x00]],
  "video/3gpp2": [[0x00, 0x00, 0x00]],
  "video/webm": [[0x1a, 0x45, 0xdf, 0xa3]], // EBML header
  "video/x-matroska": [[0x1a, 0x45, 0xdf, 0xa3]], // EBML header (same as WebM)
  "video/x-msvideo": [[0x52, 0x49, 0x46, 0x46]], // RIFF header (AVI)
  "video/x-ms-wmv": [[0x30, 0x26, 0xb2, 0x75]], // ASF header
  "video/x-flv": [[0x46, 0x4c, 0x56]], // FLV
  "video/mp2t": [[0x47]], // MPEG-TS sync byte
  "video/ogg": [[0x4f, 0x67, 0x67, 0x53]], // OggS
  "audio/mpeg": [[0xff, 0xfb], [0xff, 0xf3], [0xff, 0xf2], [0x49, 0x44, 0x33]], // MP3 + ID3
  "audio/wav": [[0x52, 0x49, 0x46, 0x46]], // RIFF header
  "audio/ogg": [[0x4f, 0x67, 0x67, 0x53]], // OggS
  "audio/mp4": [[0x00, 0x00, 0x00]], // ftyp box (M4A)
  "audio/x-m4a": [[0x00, 0x00, 0x00]], // ftyp box (M4A alternate)
  "audio/aac": [[0xff, 0xf1], [0xff, 0xf9]], // ADTS header
  "audio/flac": [[0x66, 0x4c, 0x61, 0x43]], // fLaC
  "audio/x-aiff": [[0x46, 0x4f, 0x52, 0x4d]], // FORM
  "audio/webm": [[0x1a, 0x45, 0xdf, 0xa3]], // EBML header
  "application/pdf": [[0x25, 0x50, 0x44, 0x46]], // %PDF
};

const ALLOWED_EXTENSIONS: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/gif": ".gif",
  "image/webp": ".webp",
  "image/heic": ".heic",
  "image/heif": ".heif",
  "image/avif": ".avif",
  "image/bmp": ".bmp",
  "image/tiff": ".tiff",
  "image/svg+xml": ".svg",
  "video/mp4": ".mp4",
  "video/quicktime": ".mov",
  "video/webm": ".webm",
  "video/x-msvideo": ".avi",
  "video/x-matroska": ".mkv",
  "video/x-ms-wmv": ".wmv",
  "video/x-flv": ".flv",
  "video/3gpp": ".3gp",
  "video/3gpp2": ".3g2",
  "video/x-m4v": ".m4v",
  "video/mp2t": ".ts",
  "video/ogg": ".ogv",
  "audio/mpeg": ".mp3",
  "audio/wav": ".wav",
  "audio/ogg": ".ogg",
  "audio/mp4": ".m4a",
  "audio/x-m4a": ".m4a",
  "audio/aac": ".aac",
  "audio/flac": ".flac",
  "audio/x-aiff": ".aiff",
  "audio/webm": ".weba",
  "application/pdf": ".pdf",
};

// MIME types that use ISO Base Media File Format (ftyp box)
const FTYP_TYPES = new Set([
  "video/mp4", "video/quicktime", "video/x-m4v", "video/3gpp", "video/3gpp2",
  "audio/mp4", "audio/x-m4a",
  "image/heic", "image/heif", "image/avif",
]);

// MIME types that use EBML container (Matroska/WebM)
const EBML_TYPES = new Set([
  "video/webm", "video/x-matroska", "audio/webm",
]);

// MIME types that use RIFF container
const RIFF_TYPES = new Set([
  "image/webp", "audio/wav", "video/x-msvideo",
]);

function validateMagicBytes(buffer: Buffer, mimeType: string): boolean {
  // SVG is XML-based text, no magic bytes — validate by checking for XML/SVG markers
  if (mimeType === "image/svg+xml") {
    const head = buffer.slice(0, 1024).toString("utf-8").trim();
    return head.startsWith("<?xml") || head.startsWith("<svg") || head.includes("<svg");
  }

  // ftyp-based containers: bytes 4-7 should be "ftyp"
  if (FTYP_TYPES.has(mimeType)) {
    if (buffer.length >= 8) {
      const tag = buffer.slice(4, 8).toString("ascii");
      if (tag === "ftyp") return true;
      // moov/mdat/free atoms are also valid starting points for MP4/MOV
      if (["moov", "mdat", "free", "wide", "skip"].includes(tag)) return true;
    }
    return false;
  }

  // EBML-based containers (WebM, MKV)
  if (EBML_TYPES.has(mimeType)) {
    return buffer.length >= 4 &&
      buffer[0] === 0x1a && buffer[1] === 0x45 && buffer[2] === 0xdf && buffer[3] === 0xa3;
  }

  // RIFF-based containers: check RIFF header
  if (RIFF_TYPES.has(mimeType)) {
    return buffer.length >= 4 &&
      buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46;
  }

  // MPEG-TS: sync byte 0x47 repeats at 188-byte intervals
  if (mimeType === "video/mp2t") {
    if (buffer.length >= 189) {
      return buffer[0] === 0x47 && buffer[188] === 0x47;
    }
    return buffer.length >= 1 && buffer[0] === 0x47;
  }

  const signatures = MAGIC_BYTES[mimeType];
  if (!signatures) return false;

  return signatures.some((sig) => {
    if (buffer.length < sig.length) return false;
    return sig.every((byte, i) => buffer[i] === byte);
  });
}

function sanitizeFilename(filename: string): string {
  return filename.replace(/[/\\:\0]/g, "_");
}

export interface UploadResult {
  url: string;
  contentType: string;
  originalName: string;
}

export interface UploadError {
  error: string;
}

/**
 * Upload a single file to Vercel Blob with validation and optional HEIC conversion.
 * Returns the blob URL on success, or throws with a descriptive message.
 */
export async function uploadFileToBlob(
  file: File,
  options?: { pathPrefix?: string }
): Promise<UploadResult> {
  const pathPrefix = options?.pathPrefix ?? "media";

  if (file.size === 0) {
    throw new Error("Empty files are not allowed");
  }

  const ext = ALLOWED_EXTENSIONS[file.type];
  if (!ext) {
    throw new Error(
      `File type "${file.type}" is not allowed. Supported: images, videos, audio, PDF`
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  if (!validateMagicBytes(buffer, file.type)) {
    throw new Error(
      `File "${sanitizeFilename(file.name)}" content doesn't match its declared type (${file.type})`
    );
  }

  // Convert HEIC/HEIF to JPEG for browser compatibility
  let uploadBuffer: Buffer = buffer;
  let uploadExt = ext;
  let uploadContentType = file.type;
  if (file.type === "image/heic" || file.type === "image/heif") {
    uploadBuffer = await convertHeicToJpeg(buffer);
    uploadExt = ".jpg";
    uploadContentType = "image/jpeg";
  }

  const id = crypto.randomUUID();
  const filename = `${pathPrefix}/${id}${uploadExt}`;

  const blob = await put(filename, uploadBuffer, {
    access: "public",
    contentType: uploadContentType,
  });

  return {
    url: blob.url,
    contentType: uploadContentType,
    originalName: file.name,
  };
}

/**
 * Upload multiple files, returning results for each.
 * Does not stop on individual file failures.
 */
export async function uploadFilesToBlob(
  files: File[],
  options?: { pathPrefix?: string }
): Promise<(UploadResult | UploadError)[]> {
  const results: (UploadResult | UploadError)[] = [];
  for (const file of files) {
    try {
      results.push(await uploadFileToBlob(file, options));
    } catch (err) {
      results.push({ error: err instanceof Error ? err.message : "Upload failed" });
    }
  }
  return results;
}
