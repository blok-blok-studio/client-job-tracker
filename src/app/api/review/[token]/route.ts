import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { notifySlackDeliverable, notifySlackDeliverableComment } from "@/lib/slack";
import { sendDeliverableResponseAdminEmail } from "@/lib/email";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://blokblokstudio-clients.vercel.app";

const respondSchema = z.discriminatedUnion("action", [
  // Mark one item (or a whole section via multiple ids) approved / needs changes
  z.object({
    action: z.literal("review_item"),
    fileIds: z.array(z.string()).min(1).max(200),
    decision: z.enum(["approve", "request_changes"]),
    note: z.string().max(10_000).optional(),
    name: z.string().max(120).optional(),
  }),
  // Reply in a thread — allowed even after the review is submitted
  z.object({
    action: z.literal("comment"),
    fileId: z.string().optional(),
    body: z.string().min(1).max(10_000),
    name: z.string().max(120).optional(),
  }),
  // Finish the review — overall status computed from the per-item marks
  z.object({
    action: z.literal("submit"),
    notes: z.string().max(10_000).optional(),
    name: z.string().max(120).optional(),
  }),
  // Legacy one-shot responses — still used for content-only deliverables (no files)
  z.object({
    action: z.literal("approve"),
    notes: z.string().max(10_000).optional(),
    name: z.string().max(120).optional(),
  }),
  z.object({
    action: z.literal("request_revision"),
    notes: z.string().max(10_000).optional(),
    name: z.string().max(120).optional(),
  }),
]);

function itemLabel(file: { folder: string | null; filename: string }): string {
  return file.folder ? `${file.folder}/${file.filename}` : file.filename;
}

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
    // NB: files/comments: true (no nested args) — nested args here break Prisma's
    // result type inference under the Accelerate extension; sorted below instead.
    const deliverable = await prisma.deliverable.findUnique({
      where: { token },
      include: {
        files: true,
        comments: true,
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
          .sort(
            (a, b) =>
              a.sortOrder - b.sortOrder ||
              a.createdAt.getTime() - b.createdAt.getTime()
          )
          .map((f) => ({
            id: f.id,
            url: f.url,
            filename: f.filename,
            fileSize: f.fileSize,
            mimeType: f.mimeType,
            folder: f.folder,
            decision: f.decision,
            decidedAt: f.decidedAt,
          })),
        comments: [...deliverable.comments]
          .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
          .map((c) => ({
            id: c.id,
            fileId: c.fileId,
            author: c.author,
            fromTeam: c.fromTeam,
            body: c.body,
            createdAt: c.createdAt,
          })),
      },
    });
  } catch (err) {
    console.error("[Review] Fetch failed:", err);
    return NextResponse.json({ success: false, error: "Unable to load review" }, { status: 500 });
  }
}

// POST — per-item marks, thread replies, and the final review submission
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const ip = getClientIp(request);
  const rl = rateLimit(ip, { max: 60, prefix: "review-post" });
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

    const deliverable = await prisma.deliverable.findUnique({
      where: { token },
      include: {
        files: true,
        client: { select: { id: true, name: true, company: true } },
      },
    });

    if (!deliverable) {
      return NextResponse.json(
        { success: false, error: "Invalid or expired review link" },
        { status: 404 }
      );
    }

    const input = parsed.data;
    const authorName =
      ("name" in input && input.name?.trim()) || deliverable.client.name;

    // --- Thread reply (allowed at any status, keeps the conversation going) ---
    if (input.action === "comment") {
      const file = input.fileId
        ? deliverable.files.find((f) => f.id === input.fileId)
        : null;
      if (input.fileId && !file) {
        return NextResponse.json({ success: false, error: "Invalid item" }, { status: 400 });
      }

      const comment = await prisma.deliverableComment.create({
        data: {
          deliverableId: deliverable.id,
          fileId: file?.id || null,
          author: authorName,
          fromTeam: false,
          body: input.body.trim(),
        },
      });

      await prisma.activityLog.create({
        data: {
          clientId: deliverable.client.id,
          actor: authorName,
          action: "DELIVERABLE_COMMENT",
          details: `Commented on "${deliverable.title}"${file ? ` (${itemLabel(file)})` : ""}: ${input.body.trim()}`,
          ipAddress: ip,
          userAgent: request.headers.get("user-agent") || undefined,
        },
      });

      await notifySlackDeliverableComment({
        title: deliverable.title,
        clientName: deliverable.client.name,
        clientId: deliverable.client.id,
        author: authorName,
        itemLabel: file ? itemLabel(file) : null,
        body: input.body.trim(),
      });

      return NextResponse.json({ success: true, data: { comment } });
    }

    // --- Per-item mark ---
    if (input.action === "review_item") {
      if (deliverable.status !== "PENDING_REVIEW") {
        return NextResponse.json(
          { success: false, error: "This deliverable has already been reviewed." },
          { status: 409 }
        );
      }

      const validIds = new Set(deliverable.files.map((f) => f.id));
      const fileIds = input.fileIds.filter((id) => validIds.has(id));
      if (fileIds.length === 0) {
        return NextResponse.json({ success: false, error: "Invalid items" }, { status: 400 });
      }

      const decision = input.decision === "approve" ? "APPROVED" : "CHANGES_REQUESTED";
      await prisma.deliverableFile.updateMany({
        where: { id: { in: fileIds }, deliverableId: deliverable.id },
        data: { decision, decidedAt: new Date() },
      });

      // A note with a single item starts that item's thread; with a section
      // batch it lands on the deliverable-level thread instead.
      let comment = null;
      if (input.note?.trim()) {
        comment = await prisma.deliverableComment.create({
          data: {
            deliverableId: deliverable.id,
            fileId: fileIds.length === 1 ? fileIds[0] : null,
            author: authorName,
            fromTeam: false,
            body: input.note.trim(),
          },
        });
      }

      return NextResponse.json({ success: true, data: { decision, fileIds, comment } });
    }

    // --- Final submission (submit / legacy approve / legacy request_revision) ---
    if (deliverable.status !== "PENDING_REVIEW") {
      return NextResponse.json(
        { success: false, error: "This deliverable has already been reviewed." },
        { status: 409 }
      );
    }

    let approved: boolean;
    let compiledNotes: string | null;
    let itemSummary: string | null = null;

    if (input.action === "submit") {
      if (deliverable.files.length === 0) {
        return NextResponse.json(
          { success: false, error: "Nothing to submit — this review has no items." },
          { status: 400 }
        );
      }
      const undecided = deliverable.files.filter((f) => !f.decision);
      if (undecided.length > 0) {
        return NextResponse.json(
          { success: false, error: "Please mark every item before submitting your review." },
          { status: 400 }
        );
      }

      const changed = deliverable.files.filter((f) => f.decision === "CHANGES_REQUESTED");
      const approvedCount = deliverable.files.length - changed.length;
      approved = changed.length === 0;
      itemSummary = approved
        ? `all ${deliverable.files.length} items approved`
        : `${approvedCount} approved · ${changed.length} need changes`;

      // Compile per-item feedback so the kanban task / email spell out exactly
      // which items need work and what the client said about each.
      const itemComments = await prisma.deliverableComment.findMany({
        where: { deliverableId: deliverable.id, fromTeam: false, fileId: { not: null } },
        orderBy: { createdAt: "asc" },
      });
      const notesByFile = new Map<string, string[]>();
      for (const c of itemComments) {
        const list = notesByFile.get(c.fileId!) || [];
        list.push(c.body);
        notesByFile.set(c.fileId!, list);
      }

      const parts: string[] = [];
      if (input.notes?.trim()) parts.push(input.notes.trim());
      if (!approved) {
        const sorted = [...changed].sort((a, b) => a.sortOrder - b.sortOrder);
        parts.push(
          "Items needing changes:\n" +
            sorted
              .map((f) => {
                const notes = notesByFile.get(f.id);
                return `• ${itemLabel(f)}${notes?.length ? ` — ${notes.join(" / ")}` : ""}`;
              })
              .join("\n")
        );
      }
      compiledNotes = parts.length ? parts.join("\n\n") : null;
    } else {
      // Legacy one-shot flow (content-only deliverables)
      approved = input.action === "approve";
      if (!approved && !input.notes?.trim()) {
        return NextResponse.json(
          { success: false, error: "Please describe what needs to change." },
          { status: 400 }
        );
      }
      compiledNotes = input.notes?.trim() || null;
      // "Approve" stamps any unmarked items so nothing is left ambiguous
      if (approved && deliverable.files.length > 0) {
        await prisma.deliverableFile.updateMany({
          where: { deliverableId: deliverable.id, decision: null },
          data: { decision: "APPROVED", decidedAt: new Date() },
        });
      }
    }

    const updated = await prisma.deliverable.update({
      where: { id: deliverable.id },
      data: {
        status: approved ? "APPROVED" : "REVISION_REQUESTED",
        revisionNotes: approved ? compiledNotes ?? deliverable.revisionNotes : compiledNotes,
        respondedBy: ("name" in input && input.name?.trim()) || null,
        respondedAt: new Date(),
        ...(approved ? {} : { revisionCount: { increment: 1 } }),
      },
    });

    // Keep the kanban board in sync: the linked review card moves itself to
    // Done on approval, or converts into a To Do revision task on changes —
    // one card follows the whole lifecycle instead of piling up duplicates.
    if (approved) {
      if (deliverable.taskId) {
        await prisma.task
          .update({
            where: { id: deliverable.taskId },
            data: { status: "DONE", completedAt: new Date() },
          })
          .catch((err) => console.error("[Review] Card complete failed:", err));
      }
    } else {
      const revisionCard = {
        clientId: deliverable.client.id,
        title: `Revision: ${deliverable.title}`,
        description: `Client requested changes on "${deliverable.title}"${authorName !== deliverable.client.name ? ` (${authorName})` : ""}${itemSummary ? ` — ${itemSummary}` : ""}:\n\n${compiledNotes || "(no notes)"}\n\nReview link: ${APP_URL}/review/${deliverable.token}`,
        status: "TODO" as const,
        priority: "HIGH" as const,
        category: "CONTENT_CREATION" as const,
        tags: ["revision"],
      };
      try {
        if (!deliverable.taskId) throw new Error("no linked card");
        await prisma.task.update({
          where: { id: deliverable.taskId },
          data: { ...revisionCard, completedAt: null },
        });
      } catch {
        // Linked card missing (deleted, or pre-dates the linkage) — create one
        const task = await prisma.task
          .create({ data: revisionCard })
          .catch((err) => {
            console.error("[Review] Revision card create failed:", err);
            return null;
          });
        if (task) {
          await prisma.deliverable
            .update({ where: { id: deliverable.id }, data: { taskId: task.id } })
            .catch(() => {});
        }
      }
    }

    await prisma.activityLog.create({
      data: {
        clientId: deliverable.client.id,
        actor: authorName,
        action: approved ? "DELIVERABLE_APPROVED" : "DELIVERABLE_REVISION_REQUESTED",
        details: approved
          ? `Approved "${deliverable.title}"${itemSummary ? ` (${itemSummary})` : ""}`
          : `Requested revision on "${deliverable.title}"${itemSummary ? ` (${itemSummary})` : ""}: ${compiledNotes || ""}`,
        ipAddress: ip,
        userAgent: request.headers.get("user-agent") || undefined,
      },
    });

    await notifySlackDeliverable({
      kind: approved ? "approved" : "revision",
      title: deliverable.title,
      clientName: deliverable.client.name,
      clientId: deliverable.client.id,
      respondedBy: ("name" in input && input.name?.trim()) || null,
      notes: compiledNotes,
      itemSummary,
    });

    // Email Chase the response; never fail the client's submission over email
    try {
      await sendDeliverableResponseAdminEmail({
        clientName: deliverable.client.name,
        company: deliverable.client.company,
        title: deliverable.title,
        approved,
        respondedBy: ("name" in input && input.name?.trim()) || null,
        notes: compiledNotes,
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
