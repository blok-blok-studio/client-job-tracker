import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { Zip, ZipPassThrough } from "fflate";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Zip entries are stored uncompressed (images/videos are already compressed),
// so the function just streams Blob bytes through — no buffering, no CPU spike.
const MAX_FILES = 500;

function sanitizeZipName(name: string) {
  const clean = name.replace(/[^a-zA-Z0-9 _.-]/g, "").trim().slice(0, 60);
  return clean || "media";
}

// Accepts a hidden-form POST (so the browser handles the download natively —
// no fetch()->blob() buffering, which crashes tabs on big galleries) or JSON.
export async function POST(request: NextRequest) {
  let ids: string[] = [];
  let zipName = "media";

  const contentType = request.headers.get("content-type") || "";
  try {
    if (contentType.includes("application/json")) {
      const body = await request.json();
      ids = Array.isArray(body?.ids) ? body.ids : [];
      if (typeof body?.name === "string") zipName = body.name;
    } else {
      const form = await request.formData();
      ids = JSON.parse(String(form.get("ids") || "[]"));
      const name = form.get("name");
      if (typeof name === "string" && name) zipName = name;
    }
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: "No files requested" }, { status: 400 });
  }
  ids = ids.filter((id) => typeof id === "string").slice(0, MAX_FILES);

  const files = await prisma.clientMedia.findMany({
    where: { id: { in: ids } },
    select: { id: true, url: true, filename: true },
  });
  if (files.length === 0) {
    return NextResponse.json({ error: "Files not found" }, { status: 404 });
  }

  // Dedupe entry names — a zip with two "IMG_0001.jpg" silently drops one
  const used = new Set<string>();
  const entries = files.map((f) => {
    let name = f.filename || `file-${f.id}`;
    if (used.has(name)) {
      const dot = name.lastIndexOf(".");
      const base = dot > 0 ? name.slice(0, dot) : name;
      const ext = dot > 0 ? name.slice(dot) : "";
      let n = 2;
      while (used.has(`${base} (${n})${ext}`)) n++;
      name = `${base} (${n})${ext}`;
    }
    used.add(name);
    return { url: f.url, name };
  });

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const zip = new Zip((err, chunk, final) => {
        if (closed) return;
        if (err) {
          closed = true;
          controller.error(err);
          return;
        }
        controller.enqueue(chunk);
        if (final) {
          closed = true;
          controller.close();
        }
      });

      for (const file of entries) {
        if (closed) break;
        let res: Response;
        try {
          res = await fetch(file.url, { cache: "no-store" });
        } catch {
          continue;
        }
        if (!res.ok || !res.body) continue;

        const entry = new ZipPassThrough(file.name);
        zip.add(entry);
        try {
          const reader = res.body.getReader();
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            entry.push(value);
          }
        } catch {
          // fall through — terminate the entry so the zip stays valid
        }
        entry.push(new Uint8Array(0), true);
      }
      zip.end();
    },
  });

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${sanitizeZipName(zipName)}.zip"`,
      "Cache-Control": "no-store",
    },
  });
}
