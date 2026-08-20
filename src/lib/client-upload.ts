/**
 * Client-side file upload utility.
 *
 * Uploads go straight from the browser to Vercel Blob. Sending the bytes to
 * one of our API routes instead would cap every upload at Vercel's 4.5MB
 * request-body limit — the platform rejects anything larger with a plain-text
 * 413 before our code ever runs, which is not survivable for deliverables,
 * video, or design sources. `/api/uploads/blob` only mints the upload token
 * (session-authenticated by middleware); the file itself never passes through it.
 */

import { upload as vercelBlobUpload } from "@vercel/blob/client";
import { safeUuid } from "@/lib/safe-uuid";
import { friendlyError } from "@/lib/fetch-json";

interface UploadOptions {
  onProgress?: (loaded: number, total: number) => void;
}

interface UploadResult {
  url: string;
}

/** Upload a single file. Any size, original bytes, never recompressed. */
export async function uploadFile(file: File, options?: UploadOptions): Promise<UploadResult> {
  const ext = file.name.includes(".") ? "." + file.name.split(".").pop() : "";
  try {
    const blob = await vercelBlobUpload(`media/${safeUuid()}${ext}`, file, {
      access: "public",
      handleUploadUrl: "/api/uploads/blob",
      // Multipart only pays off on big files; its extra round trips slow
      // a batch of small ones down
      multipart: file.size > 8 * 1024 * 1024,
      onUploadProgress: options?.onProgress
        ? ({ loaded, total }) => options.onProgress!(loaded, total)
        : undefined,
    });
    return { url: blob.url };
  } catch (err) {
    throw new Error(friendlyError(err, `Couldn't upload ${file.name}. Please try again.`));
  }
}

/**
 * Upload multiple files, returning all URLs.
 */
export async function uploadFiles(
  files: File[],
  options?: { onProgress?: (fileIndex: number, loaded: number, total: number) => void }
): Promise<string[]> {
  const urls: string[] = [];
  for (let i = 0; i < files.length; i++) {
    const result = await uploadFile(files[i], {
      onProgress: options?.onProgress
        ? (loaded, total) => options.onProgress!(i, loaded, total)
        : undefined,
    });
    urls.push(result.url);
  }
  return urls;
}
