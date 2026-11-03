import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requirePitchUser, canEdit, pitchError, notFound, notYours } from "@/lib/pitches/access";
import { MAX_IMAGES, normaliseShot, readUpload } from "@/lib/pitches/images";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

// POST: add one research screenshot (multipart file + caption, or JSON { blobUrl, caption } for big files)
export async function POST(request: NextRequest, { params }: Ctx) {
  const { user, denied } = await requirePitchUser();
  if (denied) return denied;
  const { id } = await params;
  try {
    const existing = await prisma.pitch.findUnique({ where: { id }, select: { authorId: true, _count: { select: { images: true } } } });
    if (!existing) return notFound();
    if (!canEdit(user, existing)) return notYours();
    if (existing._count.images >= MAX_IMAGES) return NextResponse.json({ success: false, error: `Up to ${MAX_IMAGES} screenshots per pitch` }, { status: 400 });
    const up = await readUpload(request, id);
    if ("error" in up) return NextResponse.json({ success: false, error: up.error }, { status: 400 });
    const shot = await normaliseShot(up.buf).catch(() => null);
    if (!shot) return NextResponse.json({ success: false, error: "Could not read that image" }, { status: 400 });
    const caption = up.caption;
    const img = await prisma.pitchImage.create({
      data: { pitchId: id, caption, data: new Uint8Array(shot.data), width: shot.width, height: shot.height, order: existing._count.images },
      select: { id: true, caption: true, width: true, height: true, order: true },
    });
    await prisma.pitch.update({ where: { id }, data: { updatedAt: new Date() } });
    return NextResponse.json({ success: true, data: img });
  } catch (err) {
    return pitchError(err, "Could not add the screenshot");
  }
}
