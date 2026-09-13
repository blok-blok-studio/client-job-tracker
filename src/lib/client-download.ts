/**
 * Browser-side file downloads that never take over the app.
 *
 * On iPhone/iPad (and most of all the home-screen app) a download link swaps
 * the whole app for a file viewer with no back button, so the only way out was
 * closing and reopening the app. There, files open in Safari's viewer instead:
 * Done returns to the app, Share saves the file.
 */

export interface DownloadableMedia {
  id: string;
  url: string;
  filename: string;
}

/** iPhone or iPad, including iPadOS, which reports itself as a Mac. */
export function isIOSDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function clickLink(href: string, opts: { download?: string; newWindow?: boolean }) {
  const a = document.createElement("a");
  a.href = href;
  if (opts.download) a.download = opts.download;
  if (opts.newWindow) a.target = "_blank";
  a.rel = "noopener noreferrer";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/**
 * Download one client media file. Elsewhere the download endpoint streams it
 * straight to disk (from / via the Blob CDN) with its original filename.
 */
export function downloadMediaFile(media: DownloadableMedia) {
  if (isIOSDevice()) {
    // The Blob URL is public, so Safari can open it without the app's login
    clickLink(media.url, { newWindow: true });
    return;
  }
  clickLink(`/api/client-media/${media.id}/download`, { download: media.filename });
}

/** Desktop/Android: submit a hidden form so the browser streams the zip natively. */
export function submitZipForm(ids: string[], name: string) {
  const form = document.createElement("form");
  form.method = "POST";
  form.action = "/api/client-media/download-zip";
  form.style.display = "none";
  for (const [key, value] of [
    ["ids", JSON.stringify(ids)],
    ["name", name],
  ]) {
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = key;
    input.value = value;
    form.appendChild(input);
  }
  document.body.appendChild(form);
  form.submit();
  form.remove();
}

/** iPhone/iPad: store the selection and get a short-lived link Safari can open. */
export async function createZipLink(ids: string[], name: string): Promise<string> {
  const res = await fetch("/api/client-media/download-zip/link", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids, name }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || typeof data.url !== "string") throw new Error(data.error || "Couldn't prepare the zip");
  return data.url;
}
