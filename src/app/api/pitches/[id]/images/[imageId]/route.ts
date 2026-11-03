import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requirePitchUser, canEdit, pitchError, notFound, notYours } from "@/lib/pitches/access";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string; imageId: string }> };

async function load(id: string, imageId: string) {
  return prisma.pitchImage.findFirst({ where: { id: imageId, pitchId: id }, select: { id: true, pitch: { select: { authorId: true } } } });
}

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { denied } = await requirePitchUser();
  if (denied) return denied;
  const { id, imageId } = await params;
  const img = await prisma.pitchImage.findFirst({ where: { id: imageId, pitchId: id }, select: { data: true } });
  if (!img) return notFound();
  return new NextResponse(Buffer.from(img.data), { headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=3600" } });
}

export async function PATCH(request: NextRequest, { params }: Ctx) {
  const { user, denied } = await requirePitchUser();
  if (denied) return denied;
  const { id, imageId } = await params;
  try {
    const img = await load(id, imageId);
    if (!img) return notFound();
    if (!canEdit(user, img.pitch)) return notYours();
    const { caption } = z.object({ caption: z.string().max(200).nullable() }).parse(await request.json());
    await prisma.pitchImage.update({ where: { id: imageId }, data: { caption: caption?.trim() || null } });
    return NextResponse.json({ success: true });
  } catch (err) {
    return pitchError(err, "Could not save the caption");
  }
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const { user, denied } = await requirePitchUser();
  if (denied) return denied;
  const { id, imageId } = await params;
  const img = await load(id, imageId);
  if (!img) return notFound();
  if (!canEdit(user, img.pitch)) return notYours();
  await prisma.pitchImage.delete({ where: { id: imageId } });
  return NextResponse.json({ success: true });
}
