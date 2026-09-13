import crypto from "crypto";
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { Zip, ZipPassThrough } from "fflate";

// Zip entries are stored uncompressed (images/videos are already compressed),
// so the function just streams Blob bytes through — no buffering, no CPU spike.
export const MAX_ZIP_FILES = 500;

// fflate writes 32-bit sizes/offsets (no zip64), so past ~4GB the archive
// comes out unreadable. Refuse rather than emit a corrupt zip; the galleries
// pre-check this limit client-side so users normally see a toast instead.
const MAX_TOTAL_BYTES = 3.9 * 1024 * 1024 * 1024;

function sanitizeZipName(name: string) {
  const clean = name.replace(/[^a-zA-Z0-9 _.-]/g, "").trim().slice(0, 60);
  return clean || "media";
}

/** Stream the given client media files back as one zip download. */
export async function zipResponse(ids: string[], zipName: string): Promise<NextResponse> {
  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: "No files requested" }, { status: 400 });
  }
  ids = ids.filter((id) => typeof id === "string").slice(0, MAX_ZIP_FILES);

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

// ─── One-time zip links (iPhone / iPad) ──────────────────────────────────
// On iOS a download can't start from inside the home-screen app without the
// file replacing the whole app, and Safari's viewer doesn't share the app's
// login. So the app first stores the selection under a random id, then opens
// /api/client-media/zip-link/<id> in Safari, which streams the zip.

const LINK_TTL_MS = 15 * 60 * 1000;
const linkKey = (id: string) => `zip_link:${id}`;

export async function createZipLink(ids: string[], zipName: string): Promise<string> {
  const id = crypto.randomBytes(24).toString("base64url");
  await prisma.setting.create({
    data: {
      key: linkKey(id),
      value: { ids: ids.slice(0, MAX_ZIP_FILES), name: zipName, expiresAt: new Date(Date.now() + LINK_TTL_MS).toISOString() },
    },
  });
  await prisma.setting
    .deleteMany({ where: { key: { startsWith: "zip_link:" }, updatedAt: { lt: new Date(Date.now() - LINK_TTL_MS) } } })
    .catch(() => {});
  return id;
}

export async function readZipLink(id: string): Promise<{ ids: string[]; name: string } | null> {
  if (!/^[\w-]{20,64}$/.test(id)) return null;
  const row = await prisma.setting.findUnique({ where: { key: linkKey(id) } });
  const value = row?.value as { ids?: unknown; name?: unknown; expiresAt?: string } | undefined;
  if (!value || !Array.isArray(value.ids) || !value.expiresAt || new Date(value.expiresAt).getTime() < Date.now()) return null;
  return { ids: value.ids.filter((x): x is string => typeof x === "string"), name: typeof value.name === "string" ? value.name : "media" };
}
