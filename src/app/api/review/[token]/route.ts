import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { notifySlackDeliverable } from "@/lib/slack";
import { sendDeliverableResponseAdminEmail } from "@/lib/email";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://blokblokstudio-clients.vercel.app";

const respondSchema = z.object({
  action: z.enum(["approve", "request_revision"]),
  notes: z.string().max(10_000).optional(),
  name: z.string().max(120).optional(),
});

// GET — fetch a deliverable for client review (public, token-scoped)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const ip = getClientIp(request);
  const rl = rateLimit(ip, { max: 30, prefix: "review-get" });
  if (!rl.allowed) {
    return NextResponse.json(
      { success: false, error: "Too many requests. Please try again later." },
      { status: 429 }
    );
  }

  try {
    const { token } = await params;
    // NB: files: true (not an orderBy arg) — nested args here break Prisma's
    // result type inference under the Accelerate extension; sorted below instead.
    const deliverable = await prisma.deliverable.findUnique({
      where: { token },
      include: {
        files: true,
        client: { select: { name: true, company: true } },
      },
    });

    if (!deliverable) {
      return NextResponse.json(
        { success: false, error: "Invalid or expired review link" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        clientName: deliverable.client.name,
        company: deliverable.client.company,
        title: deliverable.title,
        message: deliverable.message,
        content: deliverable.content,
        status: deliverable.status,
        revisionNotes: deliverable.revisionNotes,
        respondedBy: deliverable.respondedBy,
        respondedAt: deliverable.respondedAt,
        createdAt: deliverable.createdAt,
        files: [...deliverable.files]
          .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
          .map((f) => ({
          id: f.id,
          url: f.url,
          filename: f.filename,
          fileSize: f.fileSize,
          mimeType: f.mimeType,
          folder: f.folder,
        })),
      },
    });
  } catch (err) {
    console.error("[Review] Fetch failed:", err);
    return NextResponse.json({ success: false, error: "Unable to load review" }, { status: 500 });
  }
}

// POST — client approves or requests a revision
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const ip = getClientIp(request);
  const rl = rateLimit(ip, { max: 10, prefix: "review-post" });
  if (!rl.allowed) {
    return NextResponse.json(
      { success: false, error: "Too many requests. Please try again later." },
      { status: 429 }
    );
  }

  try {
    const { token } = await params;
    const body = await request.json();
    const parsed = respondSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: "Invalid input" }, { status: 400 });
    }
    const { action, notes, name } = parsed.data;

    if (action === "request_revision" && !notes?.trim()) {
      return NextResponse.json(
        { success: false, error: "Please describe what needs to change." },
        { status: 400 }
      );
    }

    const deliverable = await prisma.deliverable.findUnique({
      where: { token },
      include: { client: { select: { id: true, name: true, company: true } } },
    });

    if (!deliverable) {
      return NextResponse.json(
        { success: false, error: "Invalid or expired review link" },
        { status: 404 }
      );
    }

    if (deliverable.status !== "PENDING_REVIEW") {
      return NextResponse.json(
        { success: false, error: "This deliverable has already been reviewed." },
        { status: 409 }
      );
    }

    const approved = action === "approve";
    const updated = await prisma.deliverable.update({
      where: { id: deliverable.id },
      data: {
        status: approved ? "APPROVED" : "REVISION_REQUESTED",
        revisionNotes: approved ? deliverable.revisionNotes : notes!.trim(),
        respondedBy: name?.trim() || null,
        respondedAt: new Date(),
        ...(approved ? {} : { revisionCount: { increment: 1 } }),
      },
    });

    // Revision requests flow straight onto the kanban board so nothing gets lost
    if (!approved) {
      await prisma.task.create({
        data: {
          clientId: deliverable.client.id,
          title: `Revision: ${deliverable.title}`,
          description: `Client requested changes on "${deliverable.title}"${name?.trim() ? ` (${name.trim()})` : ""}:\n\n${notes!.trim()}\n\nReview link: ${process.env.NEXT_PUBLIC_APP_URL || "https://blokblokstudio-clients.vercel.app"}/review/${deliverable.token}`,
          status: "TODO",
          priority: "HIGH",
          category: "CONTENT_CREATION",
          tags: ["revision"],
        },
      });
    }

    await prisma.activityLog.create({
      data: {
        clientId: deliverable.client.id,
        actor: name?.trim() || deliverable.client.name,
        action: approved ? "DELIVERABLE_APPROVED" : "DELIVERABLE_REVISION_REQUESTED",
        details: approved
          ? `Approved "${deliverable.title}"`
          : `Requested revision on "${deliverable.title}": ${notes!.trim()}`,
        ipAddress: ip,
        userAgent: request.headers.get("user-agent") || undefined,
      },
    });

    await notifySlackDeliverable({
      kind: approved ? "approved" : "revision",
      title: deliverable.title,
      clientName: deliverable.client.name,
      clientId: deliverable.client.id,
      respondedBy: name?.trim() || null,
      notes: notes?.trim() || null,
    });

    // Email Chase the response; never fail the client's submission over email
    try {
      await sendDeliverableResponseAdminEmail({
        clientName: deliverable.client.name,
        company: deliverable.client.company,
        title: deliverable.title,
        approved,
        respondedBy: name?.trim() || null,
        notes: notes?.trim() || null,
        clientUrl: `${APP_URL}/clients/${deliverable.client.id}`,
        reviewUrl: `${APP_URL}/review/${deliverable.token}`,
      });
    } catch (err) {
      console.error("[Review] Admin email failed:", err);
    }

    return NextResponse.json({ success: true, data: { status: updated.status } });
  } catch (err) {
    console.error("[Review] Respond failed:", err);
    return NextResponse.json({ success: false, error: "Failed to submit response" }, { status: 500 });
  }
}
