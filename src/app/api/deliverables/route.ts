import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { sendDeliverableReviewEmail } from "@/lib/email";
import { notifySlackDeliverableSent } from "@/lib/slack";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://blokblokstudio-clients.vercel.app";

const fileSchema = z.object({
  url: z.string().url(),
  filename: z.string().min(1).max(255),
  fileSize: z.number().int().nonnegative(),
  mimeType: z.string().min(1).max(100),
  folder: z.string().max(500).nullable().optional(),
});

const createSchema = z.object({
  clientId: z.string().min(1),
  title: z.string().min(1).max(200),
  message: z.string().max(5000).optional().nullable(),
  content: z.string().max(200_000).optional().nullable(),
  files: z.array(fileSchema).max(100).default([]),
});

// GET /api/deliverables?clientId=xxx — list deliverables (all clients if no filter)
export async function GET(request: NextRequest) {
  try {
    const clientId = request.nextUrl.searchParams.get("clientId");

    const deliverables = await prisma.deliverable.findMany({
      where: clientId ? { clientId } : undefined,
      include: {
        files: { orderBy: { sortOrder: "asc" } },
        comments: { orderBy: { createdAt: "asc" } },
        client: { select: { id: true, name: true, company: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ success: true, data: deliverables });
  } catch (err) {
    console.error("[Deliverables] List failed:", err);
    return NextResponse.json({ success: false, error: "Failed to load deliverables" }, { status: 500 });
  }
}

// POST /api/deliverables — create a deliverable ready for client review
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    const body = await request.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: "Invalid input" }, { status: 400 });
    }
    const { clientId, title, message, content, files } = parsed.data;

    const client = await prisma.client.findUnique({
      where: { id: clientId },
      select: { id: true, name: true, email: true },
    });
    if (!client) {
      return NextResponse.json({ success: false, error: "Client not found" }, { status: 404 });
    }

    const deliverable = await prisma.deliverable.create({
      data: {
        clientId,
        token: randomBytes(16).toString("base64url"),
        title,
        message: message || null,
        content: content || null,
        createdBy: session?.name || null,
        files: { create: files.map((f, i) => ({ ...f, sortOrder: i })) },
      },
      include: { files: { orderBy: { sortOrder: "asc" } } },
    });

    // Linked kanban card tracks the review — lands in In Review, moves itself
    // to Done on approval or back to To Do as a revision task on changes.
    // Never fail the create over board bookkeeping.
    try {
      const task = await prisma.task.create({
        data: {
          clientId,
          title: `Client review: ${title}`,
          description: `Waiting on ${client.name} to review "${title}"${files.length ? ` (${files.length} file${files.length === 1 ? "" : "s"})` : ""}.\n\nReview link: ${APP_URL}/r/${deliverable.token}`,
          status: "IN_REVIEW",
          priority: "MEDIUM",
          category: "CONTENT_CREATION",
          tags: ["client-review"],
          assignedTo: session?.name || null,
        },
      });
      await prisma.deliverable.update({
        where: { id: deliverable.id },
        data: { taskId: task.id },
      });
    } catch (err) {
      console.error("[Deliverables] Review card create failed:", err);
    }

    // Auto-email the client their review link; never fail the create over email
    let emailed = false;
    if (client.email) {
      try {
        await sendDeliverableReviewEmail({
          to: client.email,
          clientName: client.name,
          title,
          message: message || null,
          reviewUrl: `${APP_URL}/r/${deliverable.token}`,
        });
        emailed = true;
      } catch (err) {
        console.error("[Deliverables] Review email failed:", err);
      }
    }

    await notifySlackDeliverableSent({
      title,
      clientName: client.name,
      clientId,
      fileCount: files.length,
      sentBy: session?.name || null,
      emailed,
    }).catch((err) => console.error("[Deliverables] Slack notify failed:", err));

    return NextResponse.json({ success: true, data: deliverable, emailed });
  } catch (err) {
    console.error("[Deliverables] Create failed:", err);
    return NextResponse.json({ success: false, error: "Failed to create deliverable" }, { status: 500 });
  }
}
