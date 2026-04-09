import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";
import crypto from "crypto";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const heicConvert = require("heic-convert");
import { getClientIp, rateLimit } from "@/lib/rate-limit";

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const MAX_FILES_PER_REQUEST = 10;

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
  "video/mp4": [
    [0x00, 0x00, 0x00], // ftyp box (variable offset)
  ],
  "video/quicktime": [
    [0x00, 0x00, 0x00], // moov/ftyp box
  ],
  "video/webm": [[0x1a, 0x45, 0xdf, 0xa3]], // EBML header
  "audio/mpeg": [[0xff, 0xfb], [0xff, 0xf3], [0xff, 0xf2], [0x49, 0x44, 0x33]], // MP3 + ID3
  "audio/wav": [[0x52, 0x49, 0x46, 0x46]], // RIFF header
  "audio/ogg": [[0x4f, 0x67, 0x67, 0x53]], // OggS
  "audio/mp4": [[0x00, 0x00, 0x00]], // ftyp box (M4A)
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
  "video/mp4": ".mp4",
  "video/quicktime": ".mov",
  "video/webm": ".webm",
  "audio/mpeg": ".mp3",
  "audio/wav": ".wav",
  "audio/ogg": ".ogg",
  "audio/mp4": ".m4a",
  "audio/webm": ".weba",
  "application/pdf": ".pdf",
};

function validateMagicBytes(buffer: Buffer, mimeType: string): boolean {
  const signatures = MAGIC_BYTES[mimeType];
  if (!signatures) return false;

  // Video containers have variable headers — check that the buffer starts with
  // a plausible box/atom structure rather than a strict magic-byte match
  if (mimeType === "video/mp4" || mimeType === "video/quicktime" || mimeType === "audio/mp4" || mimeType === "image/heic" || mimeType === "image/heif") {
    // ftyp atom: bytes 4-7 should be "ftyp"
    if (buffer.length >= 8) {
      const ftypTag = buffer.slice(4, 8).toString("ascii");
      if (ftypTag === "ftyp") return true;
    }
    // moov/mdat/free atoms are also valid starting points
    if (buffer.length >= 8) {
      const tag = buffer.slice(4, 8).toString("ascii");
      if (["moov", "mdat", "free", "wide", "skip"].includes(tag)) return true;
    }
    return false;
  }

  return signatures.some((sig) => {
    if (buffer.length < sig.length) return false;
    return sig.every((byte, i) => buffer[i] === byte);
  });
}

function sanitizeFilename(filename: string): string {
  // Strip path separators and null bytes to prevent path traversal
  return filename.replace(/[/\\:\0]/g, "_");
}

export async function POST(request: NextRequest) {
  // Rate limit: 20 uploads per minute per IP
  const ip = getClientIp(request);
  const rl = rateLimit(ip, { max: 20, windowMs: 60_000, prefix: "upload" });
  if (!rl.allowed) {
    return NextResponse.json(
      { success: false, error: "Upload rate limit exceeded. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } }
    );
  }

  try {
    const contentLength = request.headers.get("content-length");
    if (contentLength && parseInt(contentLength) > MAX_FILE_SIZE * MAX_FILES_PER_REQUEST) {
      return NextResponse.json(
        { success: false, error: "Request too large" },
        { status: 413 }
      );
    }

    const formData = await request.formData();
    const files = formData.getAll("files") as File[];

    if (!files.length) {
      return NextResponse.json(
        { success: false, error: "No files provided" },
        { status: 400 }
      );
    }

    if (files.length > MAX_FILES_PER_REQUEST) {
      return NextResponse.json(
        { success: false, error: `Maximum ${MAX_FILES_PER_REQUEST} files per upload` },
        { status: 400 }
      );
    }

    const urls: string[] = [];

    for (const file of files) {
      if (file.size > MAX_FILE_SIZE) {
        return NextResponse.json(
          { success: false, error: `File "${sanitizeFilename(file.name)}" exceeds 50MB limit` },
          { status: 400 }
        );
      }

      if (file.size === 0) {
        return NextResponse.json(
          { success: false, error: "Empty files are not allowed" },
          { status: 400 }
        );
      }

      const ext = ALLOWED_EXTENSIONS[file.type];
      if (!ext) {
        return NextResponse.json(
          {
            success: false,
            error: `File type "${file.type}" is not allowed. Supported: JPEG, PNG, GIF, WebP, HEIC, MP4, MOV, WebM, PDF`,
          },
          { status: 400 }
        );
      }

      const buffer = Buffer.from(await file.arrayBuffer());

      // Validate magic bytes to prevent MIME type spoofing
      if (!validateMagicBytes(buffer, file.type)) {
        return NextResponse.json(
          { success: false, error: `File "${sanitizeFilename(file.name)}" content doesn't match its declared type` },
          { status: 400 }
        );
      }

      // Convert HEIC/HEIF to JPEG for browser preview compatibility + LinkedIn support
      let uploadBuffer: Buffer = buffer;
      let uploadExt = ext;
      let uploadContentType = file.type;
      if (file.type === "image/heic" || file.type === "image/heif") {
        const converted = await heicConvert({ buffer, format: "JPEG", quality: 0.9 });
        uploadBuffer = Buffer.from(converted);
        uploadExt = ".jpg";
        uploadContentType = "image/jpeg";
      }

      const id = crypto.randomUUID();
      const filename = `media/${id}${uploadExt}`;

      // Upload to Vercel Blob for persistent storage
      const blob = await put(filename, uploadBuffer, {
        access: "public",
        contentType: uploadContentType,
      });

      urls.push(blob.url);
    }

    return NextResponse.json({ success: true, urls });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upload failed";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
