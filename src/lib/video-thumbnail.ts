/**
 * Client-side video thumbnail extraction.
 * Creates a thumbnail from a local File object using a hidden video + canvas.
 * Works reliably because the file is loaded from a local blob URL (no CORS/content-type issues).
 */
export function extractThumbnailFromFile(file: File): Promise<Blob | null> {
  return new Promise((resolve) => {
    // Only process video files
    if (!file.type.startsWith("video/")) {
      resolve(null);
      return;
    }

    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";

    const timer = setTimeout(() => {
      cleanup();
      resolve(null);
    }, 15000);

    const cleanup = () => {
      clearTimeout(timer);
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("error", onError);
      video.removeEventListener("loadeddata", onLoaded);
      video.pause();
      video.src = "";
      video.load();
      URL.revokeObjectURL(url);
    };

    const onSeeked = () => {
      try {
        const canvas = document.createElement("canvas");
        // Cap at 640px width
        const scale = Math.min(1, 640 / (video.videoWidth || 640));
        canvas.width = Math.round((video.videoWidth || 640) * scale);
        canvas.height = Math.round((video.videoHeight || 360) * scale);
        const ctx = canvas.getContext("2d");
        if (!ctx) { cleanup(); resolve(null); return; }

        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        canvas.toBlob(
          (blob) => {
            cleanup();
            resolve(blob && blob.size > 500 ? blob : null);
          },
          "image/jpeg",
          0.75
        );
      } catch {
        cleanup();
        resolve(null);
      }
    };

    const onLoaded = () => {
      video.currentTime = Math.min(0.5, video.duration * 0.1 || 0.5);
    };

    const onError = () => {
      cleanup();
      resolve(null);
    };

    video.addEventListener("loadeddata", onLoaded);
    video.addEventListener("seeked", onSeeked);
    video.addEventListener("error", onError);
    video.src = url;
    video.load();
  });
}
