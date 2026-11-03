import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requirePitchUser, canEdit, pitchError, notFound, notYours } from "@/lib/pitches/access";
import { draftPitch, MAX_NOTES_CHARS } from "@/lib/pitches/pitch-ai";
import { requestMeta } from "@/lib/request-meta";

export const dynamic = "force-dynamic";
export const maxDuration = 120;
type Ctx = { params: Promise<{ id: string }> };

// Per person, so one stuck tab can't run up the AI bill
const PER_HOUR = 10;
const PER_DAY = 40;

// POST { notes }: save the notes, have the AI fill the sections from them
export async function POST(request: NextRequest, { params }: Ctx) {
  const { user, denied } = await requirePitchUser();
  if (denied) return denied;
  const { id } = await params;
  try {
    const pitch = await prisma.pitch.findUnique({ where: { id }, select: { authorId: true, kind: true, brandName: true, brandWebsite: true, brandIndustry: true } });
    if (!pitch) return notFound();
    if (!canEdit(user, pitch)) return notYours();
    const { notes } = z.object({ notes: z.string().trim().min(40, "Add a bit more research first (a few sentences at least)").max(MAX_NOTES_CHARS) }).parse(await request.json());

    const actor = `user:${user.id}`;
    const now = Date.now();
    const [hour, day] = await Promise.all([
      prisma.activityLog.count({ where: { actor, action: "pitch_ai_draft", createdAt: { gte: new Date(now - 3600_000) } } }),
      prisma.activityLog.count({ where: { actor, action: "pitch_ai_draft", createdAt: { gte: new Date(now - 86400_000) } } }),
    ]);
    if (hour >= PER_HOUR || day >= PER_DAY) {
      return NextResponse.json({ success: false, error: `AI draft limit reached (${PER_HOUR} an hour, ${PER_DAY} a day). Edit by hand or try later.` }, { status: 429 });
    }
    await prisma.pitch.update({ where: { id }, data: { notes } });
    const { ipAddress, userAgent } = requestMeta(request);
    await prisma.activityLog.create({ data: { actor, action: "pitch_ai_draft", details: `AI draft for pitch ${id} (${pitch.brandName})`, ipAddress, userAgent } });

    const result = await draftPitch({ kind: pitch.kind, brandName: pitch.brandName, brandWebsite: pitch.brandWebsite, brandIndustry: pitch.brandIndustry, notes });
    if (!result.ok) return NextResponse.json({ success: false, error: result.error }, { status: result.status });
    await prisma.pitch.update({ where: { id }, data: { title: result.title, sections: result.sections, stats: result.stats, proof: result.proof } });
    return NextResponse.json({ success: true, data: { title: result.title, sections: result.sections, stats: result.stats, proof: result.proof } });
  } catch (err) {
    return pitchError(err, "Could not draft the pitch");
  }
}
