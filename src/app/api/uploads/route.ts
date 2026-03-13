import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import crypto from "crypto";

const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads");

const ALLOWED_TYPES: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/gif": ".gif",
  "image/webp": ".webp",
  "video/mp4": ".mp4",
  "video/quicktime": ".mov",
  "video/webm": ".webm",
};

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const files = formData.getAll("files") as File[];

    if (!files.length) {
      return NextResponse.json(
        { success: false, error: "No files provided" },
        { status: 400 }
      );
    }

    await mkdir(UPLOAD_DIR, { recursive: true });

    const urls: string[] = [];

    for (const file of files) {
      if (file.size > MAX_FILE_SIZE) {
        return NextResponse.json(
          { success: false, error: `File "${file.name}" exceeds 50MB limit` },
          { status: 400 }
        );
      }

      const ext = ALLOWED_TYPES[file.type];
      if (!ext) {
        return NextResponse.json(
          {
            success: false,
            error: `File type "${file.type}" is not allowed. Supported: JPEG, PNG, GIF, WebP, MP4, MOV, WebM`,
          },
          { status: 400 }
        );
      }

      const id = crypto.randomUUID();
      const filename = `${id}${ext}`;
      const buffer = Buffer.from(await file.arrayBuffer());

      await writeFile(path.join(UPLOAD_DIR, filename), buffer);
      urls.push(`/uploads/${filename}`);
    }

    return NextResponse.json({ success: true, urls });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Upload failed";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
