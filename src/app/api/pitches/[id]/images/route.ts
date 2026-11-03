import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requirePitchUser, canEdit, pitchError, notFound, notYours } from "@/lib/pitches/access";
import { checkUpload, normaliseShot } from "@/lib/pitches/images";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };
const MAX_IMAGES = 8;

// POST: add one research screenshot (multipart: file, caption)
export async function POST(request: NextRequest, { params }: Ctx) {
  const { user, denied } = await requirePitchUser();
  if (denied) return denied;
  const { id } = await params;
  try {
    const existing = await prisma.pitch.findUnique({ where: { id }, select: { authorId: true, _count: { select: { images: true } } } });
    if (!existing) return notFound();
    if (!canEdit(user, existing)) return notYours();
    if (existing._count.images >= MAX_IMAGES) return NextResponse.json({ success: false, error: `Up to ${MAX_IMAGES} screenshots per pitch` }, { status: 400 });
    const form = await request.formData();
    const file = form.get("file") as File | null;
    const bad = checkUpload(file);
    if (bad) return NextResponse.json({ success: false, error: bad }, { status: 400 });
    const shot = await normaliseShot(Buffer.from(await file!.arrayBuffer())).catch(() => null);
    if (!shot) return NextResponse.json({ success: false, error: "Could not read that image" }, { status: 400 });
    const caption = String(form.get("caption") || "").trim().slice(0, 200) || null;
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
