import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { requirePitchUser, canEdit, pitchError, notFound, notYours } from "@/lib/pitches/access";
import { pitchInputSchema } from "@/lib/pitches/types";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

const detail = {
  id: true, kind: true, status: true, title: true, brandName: true, brandWebsite: true, brandIndustry: true,
  brandColor: true, recipient: true, clientId: true, notes: true, authorId: true, authorName: true, authorEmail: true,
  sections: true, stats: true, proof: true, createdAt: true, updatedAt: true,
  images: { select: { id: true, caption: true, width: true, height: true, order: true }, orderBy: [{ order: "asc" }, { createdAt: "asc" }] },
} satisfies Prisma.PitchSelect;

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { user, denied } = await requirePitchUser();
  if (denied) return denied;
  const { id } = await params;
  const pitch = await prisma.pitch.findUnique({ where: { id }, select: detail });
  if (!pitch) return notFound();
  const logo = await prisma.pitch.count({ where: { id, logo: { not: null } } });
  return NextResponse.json({ success: true, data: { ...pitch, hasLogo: logo > 0, canEdit: canEdit(user, pitch) } });
}

export async function PATCH(request: NextRequest, { params }: Ctx) {
  const { user, denied } = await requirePitchUser();
  if (denied) return denied;
  const { id } = await params;
  try {
    const existing = await prisma.pitch.findUnique({ where: { id }, select: { authorId: true } });
    if (!existing) return notFound();
    if (!canEdit(user, existing)) return notYours();
    const input = pitchInputSchema.parse(await request.json());
    const pitch = await prisma.pitch.update({
      where: { id },
      data: {
        ...(input.kind !== undefined && { kind: input.kind }),
        ...(input.status !== undefined && { status: input.status }),
        ...(input.title !== undefined && { title: input.title }),
        ...(input.brandName !== undefined && { brandName: input.brandName }),
        ...(input.brandWebsite !== undefined && { brandWebsite: input.brandWebsite || null }),
        ...(input.brandIndustry !== undefined && { brandIndustry: input.brandIndustry || null }),
        ...(input.brandColor !== undefined && { brandColor: input.brandColor }),
        ...(input.recipient !== undefined && { recipient: input.recipient || null }),
        ...(input.clientId !== undefined && { clientId: input.clientId }),
        ...(input.sections !== undefined && { sections: input.sections }),
        ...(input.stats !== undefined && { stats: input.stats }),
        ...(input.proof !== undefined && { proof: input.proof }),
      },
      select: { id: true, updatedAt: true },
    });
    return NextResponse.json({ success: true, data: pitch });
  } catch (err) {
    return pitchError(err, "Could not save the pitch");
  }
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const { user, denied } = await requirePitchUser();
  if (denied) return denied;
  const { id } = await params;
  const existing = await prisma.pitch.findUnique({ where: { id }, select: { authorId: true, brandName: true, title: true } });
  if (!existing) return notFound();
  if (!canEdit(user, existing)) return notYours();
  await prisma.pitch.delete({ where: { id } });
  await prisma.activityLog
    .create({ data: { actor: `user:${user.id}`, action: "pitch_deleted", details: `${user.name} deleted the pitch "${existing.title}" (${existing.brandName})` } })
    .catch(() => {});
  return NextResponse.json({ success: true });
}
