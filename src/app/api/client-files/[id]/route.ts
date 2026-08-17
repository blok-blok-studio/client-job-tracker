import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { requestMeta } from "@/lib/request-meta";

const patchSchema = z.object({
  filename: z.string().min(1).max(300).optional(),
  folder: z.string().max(120).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

// PATCH /api/client-files/[id] — rename / regroup / annotate
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const parsed = patchSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message || "Invalid input" },
        { status: 400 }
      );
    }

    const data: Record<string, unknown> = {};
    if (parsed.data.filename !== undefined) data.filename = parsed.data.filename;
    if (parsed.data.folder !== undefined) data.folder = parsed.data.folder || null;
    if (parsed.data.notes !== undefined) data.notes = parsed.data.notes || null;

    const file = await prisma.clientFile.update({ where: { id }, data });
    return NextResponse.json({ success: true, data: file });
  } catch {
    return NextResponse.json({ success: false, error: "Failed to update file" }, { status: 500 });
  }
}

// DELETE /api/client-files/[id] — remove the record (blob stays in storage;
// files clients handed over are treated as work records, so removal is
// deliberate, confirmed in the UI, and activity-logged)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const file = await prisma.clientFile.findUnique({
      where: { id },
      select: { id: true, filename: true, kind: true, clientId: true },
    });
    if (!file) {
      return NextResponse.json({ success: false, error: "File not found" }, { status: 404 });
    }

    await prisma.clientFile.delete({ where: { id } });

    await prisma.activityLog.create({
      data: {
        clientId: file.clientId,
        actor: session.name,
        action: file.kind === "LINK" ? "removed_client_link" : "removed_client_file",
        details: `Removed ${file.kind === "LINK" ? "link" : "client file"}: ${file.filename}`,
        ...requestMeta(request),
      },
    });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ success: false, error: "Failed to delete file" }, { status: 500 });
  }
}
