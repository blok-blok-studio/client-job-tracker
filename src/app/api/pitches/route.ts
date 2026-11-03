import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requirePitchUser, pitchError } from "@/lib/pitches/access";
import { pitchInputSchema } from "@/lib/pitches/types";

export const dynamic = "force-dynamic";

// GET: every pitch, newest first (no logo or image bytes)
export async function GET() {
  const { user, denied } = await requirePitchUser();
  if (denied) return denied;
  const rows = await prisma.pitch.findMany({
    orderBy: { updatedAt: "desc" },
    select: {
      id: true, kind: true, status: true, title: true, brandName: true, brandWebsite: true,
      authorId: true, authorName: true, updatedAt: true, createdAt: true,
      _count: { select: { images: true } },
    },
    take: 300,
  });
  return NextResponse.json({
    success: true,
    data: rows.map((r) => ({ ...r, mine: r.authorId === user.id, canEdit: user.isOwner || r.authorId === user.id })),
  });
}

// POST: new pitch. Only kind + brand + title are needed to start.
export async function POST(request: NextRequest) {
  const { user, denied } = await requirePitchUser();
  if (denied) return denied;
  try {
    const input = pitchInputSchema.parse(await request.json());
    if (!input.brandName) return NextResponse.json({ success: false, error: "Add the brand name" }, { status: 400 });
    const pitch = await prisma.pitch.create({
      data: {
        kind: input.kind || "BRAND",
        title: input.title || (input.kind === "INTERNAL" ? `Pitch: ${input.brandName}` : `A pitch for ${input.brandName}`),
        brandName: input.brandName,
        brandWebsite: input.brandWebsite || null,
        brandIndustry: input.brandIndustry || null,
        recipient: input.recipient || null,
        authorId: user.id,
        authorName: user.name,
        authorEmail: user.email,
        sections: input.sections || {},
        stats: input.stats || [],
        proof: input.proof || [],
      },
      select: { id: true },
    });
    return NextResponse.json({ success: true, data: pitch });
  } catch (err) {
    return pitchError(err, "Could not create the pitch");
  }
}
