import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requirePitchUser, notFound, pitchError } from "@/lib/pitches/access";
import { renderPitchPdf } from "@/lib/pitches/pitch-pdf";
import type { PitchSections, PitchStat } from "@/lib/pitches/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: Ctx) {
  const { denied } = await requirePitchUser();
  if (denied) return denied;
  const { id } = await params;
  try {
    const p = await prisma.pitch.findUnique({
      where: { id },
      select: {
        kind: true, title: true, brandName: true, brandWebsite: true, brandIndustry: true, brandColor: true, recipient: true,
        authorName: true, authorEmail: true, sections: true, stats: true, proof: true, logo: true, updatedAt: true,
      },
    });
    if (!p) return notFound();
    const list = await prisma.pitchImage.findMany({
      where: { pitchId: id },
      select: { id: true, caption: true, width: true, height: true },
      orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    });
    // One image per query: Accelerate caps a response at 5 MB
    const images = [];
    for (const im of list) {
      const row = await prisma.pitchImage.findUnique({ where: { id: im.id }, select: { data: true } });
      if (row) images.push({ data: new Uint8Array(row.data), width: im.width, height: im.height, caption: im.caption });
    }
    const pdf = await renderPitchPdf({
      kind: p.kind,
      title: p.title,
      brandName: p.brandName,
      brandWebsite: p.brandWebsite,
      brandIndustry: p.brandIndustry,
      brandColor: p.brandColor,
      recipient: p.recipient,
      authorName: p.authorName,
      authorEmail: p.authorEmail,
      sections: (p.sections || {}) as PitchSections,
      stats: (Array.isArray(p.stats) ? p.stats : []) as unknown as PitchStat[],
      proof: p.proof,
      logo: p.logo ? new Uint8Array(p.logo) : null,
      images,
      date: p.updatedAt,
    });
    const name = `${p.brandName} - ${p.kind === "INTERNAL" ? "internal pitch" : "Blok Blok pitch"}.pdf`.replace(/[^\w .,()-]+/g, "");
    const download = request.nextUrl.searchParams.get("download") === "1";
    // Streamed: a deck with many screenshots can pass the 4.5 MB cap on buffered responses
    const CHUNK = 256 * 1024;
    let at = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (at >= pdf.length) return controller.close();
        controller.enqueue(pdf.subarray(at, at + CHUNK));
        at += CHUNK;
      },
    });
    return new NextResponse(body, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${name}"`,
        "Cache-Control": "private, no-store",
        "Content-Length": String(pdf.length),
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err) {
    return pitchError(err, "Could not build the PDF");
  }
}
