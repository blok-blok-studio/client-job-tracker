import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requirePitchUser, canEdit, pitchError, notFound, notYours } from "@/lib/pitches/access";
import { normaliseLogo, readUpload } from "@/lib/pitches/images";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { denied } = await requirePitchUser();
  if (denied) return denied;
  const { id } = await params;
  const row = await prisma.pitch.findUnique({ where: { id }, select: { logo: true } });
  if (!row?.logo) return notFound();
  return new NextResponse(Buffer.from(row.logo), { headers: { "Content-Type": "image/png", "Cache-Control": "private, max-age=60" } });
}

export async function PUT(request: NextRequest, { params }: Ctx) {
  const { user, denied } = await requirePitchUser();
  if (denied) return denied;
  const { id } = await params;
  try {
    const existing = await prisma.pitch.findUnique({ where: { id }, select: { authorId: true } });
    if (!existing) return notFound();
    if (!canEdit(user, existing)) return notYours();
    const up = await readUpload(request, id);
    if ("error" in up) return NextResponse.json({ success: false, error: up.error }, { status: 400 });
    const png = await normaliseLogo(up.buf).catch(() => null);
    if (!png) return NextResponse.json({ success: false, error: "Could not read that image" }, { status: 400 });
    await prisma.pitch.update({ where: { id }, data: { logo: new Uint8Array(png) } });
    return NextResponse.json({ success: true });
  } catch (err) {
    return pitchError(err, "Could not save the logo");
  }
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const { user, denied } = await requirePitchUser();
  if (denied) return denied;
  const { id } = await params;
  const existing = await prisma.pitch.findUnique({ where: { id }, select: { authorId: true } });
  if (!existing) return notFound();
  if (!canEdit(user, existing)) return notYours();
  await prisma.pitch.update({ where: { id }, data: { logo: null } });
  return NextResponse.json({ success: true });
}
