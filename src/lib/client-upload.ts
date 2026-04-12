/**
 * Client-side file upload utility.
 * Uses streaming PUT to bypass Vercel's 4.5MB serverless body size limit.
 * Files are sent as raw binary and streamed directly to Vercel Blob on the server.
 */

interface UploadOptions {
  onProgress?: (loaded: number, total: number) => void;
}

interface UploadResult {
  url: string;
}

/**
 * Upload a single file via streaming PUT to /api/uploads/stream.
 * Works for any file size — bypasses serverless body parsing limits.
 */
export function uploadFile(file: File, options?: UploadOptions): Promise<UploadResult> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    if (options?.onProgress) {
      xhr.upload.addEventListener("progress", (e) => {
        if (e.lengthComputable) {
          options.onProgress!(e.loaded, e.total);
        }
      });
    }

    xhr.addEventListener("load", () => {
      try {
        const data = JSON.parse(xhr.responseText);
        if (data.success && data.urls?.[0]) {
          resolve({ url: data.urls[0] });
        } else {
          reject(new Error(data.error || "Upload failed"));
        }
      } catch {
        reject(new Error("Upload failed"));
      }
    });

    xhr.addEventListener("error", () => {
      reject(new Error("Upload failed. Please try again."));
    });

    const params = new URLSearchParams({ filename: file.name });
    xhr.open("PUT", `/api/uploads/stream?${params}`);
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    xhr.send(file);
  });
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
