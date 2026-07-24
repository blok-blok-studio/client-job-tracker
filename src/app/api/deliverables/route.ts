import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { sendDeliverableReviewEmail } from "@/lib/email";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://blokblokstudio-clients.vercel.app";

const fileSchema = z.object({
  url: z.string().url(),
  filename: z.string().min(1).max(255),
  fileSize: z.number().int().nonnegative(),
  mimeType: z.string().min(1).max(100),
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
        files: { orderBy: { createdAt: "asc" } },
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
        token: randomBytes(24).toString("base64url"),
        title,
        message: message || null,
        content: content || null,
        createdBy: session?.name || null,
        files: { create: files },
      },
      include: { files: true },
    });

    // Auto-email the client their review link; never fail the create over email
    let emailed = false;
    if (client.email) {
      try {
        await sendDeliverableReviewEmail({
          to: client.email,
          clientName: client.name,
          title,
          message: message || null,
          reviewUrl: `${APP_URL}/review/${deliverable.token}`,
        });
        emailed = true;
      } catch (err) {
        console.error("[Deliverables] Review email failed:", err);
      }
    }

    return NextResponse.json({ success: true, data: deliverable, emailed });
  } catch (err) {
    console.error("[Deliverables] Create failed:", err);
    return NextResponse.json({ success: false, error: "Failed to create deliverable" }, { status: 500 });
  }
}
