import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { sendDeliverableReplyEmail } from "@/lib/email";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://blokblokstudio-clients.vercel.app";

const createSchema = z.object({
  fileId: z.string().optional(),
  body: z.string().min(1).max(10_000),
});

// POST /api/deliverables/[id]/comments — team reply on a review thread.
// Shows up on the client's public review page; they get an email ping too.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getSession();
    const body = await request.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: "Invalid input" }, { status: 400 });
    }

    const deliverable = await prisma.deliverable.findUnique({
      where: { id },
      include: {
        files: { select: { id: true, filename: true, folder: true } },
        client: { select: { name: true, email: true } },
      },
    });
    if (!deliverable) {
      return NextResponse.json({ success: false, error: "Deliverable not found" }, { status: 404 });
    }

    const file = parsed.data.fileId
      ? deliverable.files.find((f) => f.id === parsed.data.fileId)
      : null;
    if (parsed.data.fileId && !file) {
      return NextResponse.json({ success: false, error: "Invalid item" }, { status: 400 });
    }

    const comment = await prisma.deliverableComment.create({
      data: {
        deliverableId: id,
        fileId: file?.id || null,
        author: session?.name || "Blok Blok Studio",
        fromTeam: true,
        body: parsed.data.body.trim(),
      },
    });

    // Let the client know there's a reply waiting; never fail the comment over email
    let emailed = false;
    if (deliverable.client.email) {
      try {
        await sendDeliverableReplyEmail({
          to: deliverable.client.email,
          clientName: deliverable.client.name,
          title: deliverable.title,
          itemLabel: file ? (file.folder ? `${file.folder}/${file.filename}` : file.filename) : null,
          body: parsed.data.body.trim(),
          reviewUrl: `${APP_URL}/review/${deliverable.token}`,
        });
        emailed = true;
      } catch (err) {
        console.error("[Deliverables] Reply email failed:", err);
      }
    }

    return NextResponse.json({ success: true, data: comment, emailed });
  } catch (err) {
    console.error("[Deliverables] Comment failed:", err);
    return NextResponse.json({ success: false, error: "Failed to post reply" }, { status: 500 });
  }
}
