import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { requestMeta } from "@/lib/request-meta";

const noteSchema = z.object({
  body: z.string().min(1, "Note is required").max(5000),
});

// POST /api/contractors/hours/[id]/notes — timestamped team note on an hours entry
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getSession();
    const actor = session?.name || "team";
    const body = await request.json();
    const parsed = noteSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: "Note is required" }, { status: 400 });
    }

    const entry = await prisma.contractorHoursEntry.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!entry) {
      return NextResponse.json({ success: false, error: "Entry not found" }, { status: 404 });
    }

    const { ipAddress, userAgent } = requestMeta(request);

    const note = await prisma.contractorHoursNote.create({
      data: { entryId: id, author: actor, body: parsed.data.body.trim() },
    });

    await prisma.contractorHoursAudit.create({
      data: {
        entryId: id,
        event: "note_added",
        actor,
        ipAddress,
        userAgent,
        metadata: JSON.stringify({ noteId: note.id }),
      },
    });

    return NextResponse.json({ success: true, data: note });
  } catch {
    return NextResponse.json({ success: false, error: "Failed to add note" }, { status: 500 });
  }
}
