export type PitchStatusKey = "DRAFT" | "READY" | "SENT" | "WON" | "LOST";

export const STATUS_STYLE: Record<PitchStatusKey, string> = {
  DRAFT: "bg-bb-elevated text-bb-muted",
  READY: "bg-blue-500/15 text-blue-300",
  SENT: "bg-amber-500/15 text-amber-300",
  WON: "bg-emerald-500/15 text-emerald-300",
  LOST: "bg-red-500/15 text-red-300",
};

export const STATUS_LABEL: Record<PitchStatusKey, string> = { DRAFT: "Draft", READY: "Ready", SENT: "Sent", WON: "Won", LOST: "Lost" };

export const inputClass =
  "w-full px-3 py-2 bg-bb-black border border-bb-border rounded-lg text-sm text-white placeholder:text-bb-dim focus:outline-none focus:ring-2 focus:ring-bb-blue/50 disabled:opacity-60";

/**
 * Shrink big phone screenshots in the browser before upload so they stay under
 * the 4 MB request cap. Formats the browser can't decode (HEIC in Chrome) go up
 * as they are and the server converts them.
 */
export async function shrinkForUpload(file: File, maxSide = 2000): Promise<Blob> {
  if (file.size < 1.5 * 1024 * 1024 || file.type === "image/svg+xml") return file;
  try {
    const bmp = await createImageBitmap(file);
    const s = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * s);
    canvas.height = Math.round(bmp.height * s);
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.85));
    return blob || file;
  } catch {
    return file;
  }
}
