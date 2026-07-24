import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";

const fileSchema = z.object({
  url: z.string().url(),
  filename: z.string().min(1).max(255),
  fileSize: z.number().int().nonnegative(),
  mimeType: z.string().min(1).max(100),
});

const updateSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  message: z.string().max(5000).nullable().optional(),
  content: z.string().max(200_000).nullable().optional(),
  addFiles: z.array(fileSchema).max(100).optional(),
  removeFileIds: z.array(z.string()).max(100).optional(),
  // Re-open review after making requested changes
  resubmit: z.boolean().optional(),
});

// PATCH /api/deliverables/[id] — edit fields, manage files, resubmit for review
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: "Invalid input" }, { status: 400 });
    }
    const { title, message, content, addFiles, removeFileIds, resubmit } = parsed.data;

    const existing = await prisma.deliverable.findUnique({ where: { id }, select: { id: true } });
    if (!existing) {
      return NextResponse.json({ success: false, error: "Deliverable not found" }, { status: 404 });
    }

    if (removeFileIds?.length) {
      await prisma.deliverableFile.deleteMany({ where: { id: { in: removeFileIds }, deliverableId: id } });
    }

    const deliverable = await prisma.deliverable.update({
      where: { id },
      data: {
        ...(title !== undefined && { title }),
        ...(message !== undefined && { message }),
        ...(content !== undefined && { content }),
        ...(addFiles?.length && { files: { create: addFiles } }),
        ...(resubmit && {
          status: "PENDING_REVIEW" as const,
          respondedAt: null,
          respondedBy: null,
        }),
      },
      include: { files: { orderBy: { createdAt: "asc" } } },
    });

    return NextResponse.json({ success: true, data: deliverable });
  } catch (err) {
    console.error("[Deliverables] Update failed:", err);
    return NextResponse.json({ success: false, error: "Failed to update deliverable" }, { status: 500 });
  }
}

// DELETE /api/deliverables/[id]
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await prisma.deliverable.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[Deliverables] Delete failed:", err);
    return NextResponse.json({ success: false, error: "Failed to delete deliverable" }, { status: 500 });
  }
}
