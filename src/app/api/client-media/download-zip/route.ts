import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { Zip, ZipPassThrough } from "fflate";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Zip entries are stored uncompressed (images/videos are already compressed),
// so the function just streams Blob bytes through — no buffering, no CPU spike.
const MAX_FILES = 500;

// fflate writes 32-bit sizes/offsets (no zip64), so past ~4GB the archive
// comes out unreadable. Refuse rather than emit a corrupt zip; the galleries
// pre-check this limit client-side so users normally see a toast instead.
const MAX_TOTAL_BYTES = 3.9 * 1024 * 1024 * 1024;

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
    select: { id: true, url: true, filename: true, fileSize: true },
  });
  if (files.length === 0) {
    return NextResponse.json({ error: "Files not found" }, { status: 404 });
  }

  const totalBytes = files.reduce((acc, f) => acc + (f.fileSize || 0), 0);
  if (totalBytes > MAX_TOTAL_BYTES) {
    return NextResponse.json(
      { error: "Selection exceeds the 4GB zip limit — download in smaller batches" },
      { status: 413 }
    );
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
      const fail = (err: unknown) => {
        if (closed) return;
        closed = true;
        controller.error(err);
      };
      const zip = new Zip((err, chunk, final) => {
        if (closed) return;
        if (err) {
          fail(err);
          return;
        }
        controller.enqueue(chunk);
        if (final) {
          closed = true;
          controller.close();
        }
      });

      for (const file of entries) {
        if (closed) return;
        let res: Response | null = null;
        for (let attempt = 0; attempt < 2 && !res; attempt++) {
          try {
            const r = await fetch(file.url, { cache: "no-store" });
            if (r.ok && r.body) res = r;
          } catch {
            // retry once, then fail below
          }
        }
        if (!res?.body) {
          // A zip silently missing files looks complete to the user — abort
          // the download instead so the browser reports it and they retry.
          fail(new Error(`Failed to fetch ${file.name}`));
          return;
        }

        const entry = new ZipPassThrough(file.name);
        zip.add(entry);
        try {
          const reader = res.body.getReader();
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            entry.push(value);
          }
        } catch (err) {
          // Finalizing a half-read entry would emit a valid-looking zip whose
          // CRC matches the truncated bytes — a silently damaged file. Abort.
          fail(err);
          return;
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
