import sharp from "sharp";

export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024; // under Vercel's 4.5MB request cap
const ACCEPT = /^image\/(png|jpe?g|webp|gif|svg\+xml|avif|heic|heif)$/;

export function checkUpload(file: File | null): string | null {
  if (!file || typeof file === "string") return "Pick an image";
  if (!ACCEPT.test(file.type)) return "Use a PNG, JPG, WebP or SVG image";
  if (file.size > MAX_UPLOAD_BYTES) return "That image is over 4 MB. Export a smaller one.";
  return null;
}

/** Logo: keep transparency, trim empty margins, max 800px on the long side, PNG. */
export async function normaliseLogo(buf: Buffer): Promise<Buffer> {
  const img = sharp(buf, { density: 300 }).rotate();
  const trimmed = await img.png().toBuffer().then((b) => sharp(b).trim().toBuffer()).catch(() => img.png().toBuffer());
  return sharp(trimmed).resize({ width: 800, height: 800, fit: "inside", withoutEnlargement: true }).png().toBuffer();
}

/** Screenshot: flatten onto white, max 1600px wide, JPEG. */
export async function normaliseShot(buf: Buffer): Promise<{ data: Buffer; width: number; height: number }> {
  const { data, info } = await sharp(buf, { density: 200 })
    .rotate()
    .flatten({ background: "#ffffff" })
    .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}
