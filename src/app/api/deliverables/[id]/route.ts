import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { sendDeliverableReviewEmail } from "@/lib/email";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://blokblokstudio-clients.vercel.app";

const fileSchema = z.object({
  url: z.string().url(),
  filename: z.string().min(1).max(255),
  fileSize: z.number().int().nonnegative(),
  mimeType: z.string().min(1).max(100),
  folder: z.string().max(500).nullable().optional(),
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

    const existing = await prisma.deliverable.findUnique({
      where: { id },
      select: {
        id: true,
        token: true,
        title: true,
        message: true,
        client: { select: { name: true, email: true } },
      },
    });
    if (!existing) {
      return NextResponse.json({ success: false, error: "Deliverable not found" }, { status: 404 });
    }

    if (removeFileIds?.length) {
      await prisma.deliverableFile.deleteMany({ where: { id: { in: removeFileIds }, deliverableId: id } });
    }

    // New files continue the sequence after the current highest sortOrder
    let nextSort = 0;
    if (addFiles?.length) {
      const maxSort = await prisma.deliverableFile.aggregate({
        where: { deliverableId: id },
        _max: { sortOrder: true },
      });
      nextSort = (maxSort._max.sortOrder ?? -1) + 1;
    }

    const deliverable = await prisma.deliverable.update({
      where: { id },
      data: {
        ...(title !== undefined && { title }),
        ...(message !== undefined && { message }),
        ...(content !== undefined && { content }),
        ...(addFiles?.length && {
          files: { create: addFiles.map((f, i) => ({ ...f, sortOrder: nextSort + i })) },
        }),
        ...(resubmit && {
          status: "PENDING_REVIEW" as const,
          respondedAt: null,
          respondedBy: null,
        }),
      },
      include: { files: { orderBy: { sortOrder: "asc" } } },
    });

    // Reopening after revisions auto-emails the client that it's ready again
    let emailed = false;
    if (resubmit && existing.client.email) {
      try {
        await sendDeliverableReviewEmail({
          to: existing.client.email,
          clientName: existing.client.name,
          title: title ?? existing.title,
          message: message !== undefined ? message : existing.message,
          reviewUrl: `${APP_URL}/review/${existing.token}`,
          isRevision: true,
        });
        emailed = true;
      } catch (err) {
        console.error("[Deliverables] Resubmit email failed:", err);
      }
    }

    return NextResponse.json({ success: true, data: deliverable, emailed });
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
