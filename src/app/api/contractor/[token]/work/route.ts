import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requestMeta } from "@/lib/request-meta";
import { notifySlack } from "@/lib/slack";
import { isAllowedBlobUrl } from "@/lib/blob-fetch";

// Public, token-scoped contractor finished-work API ("Submit Work" tab).
// GET  — validate the link and return assigned clients + the contractor's own uploads
// POST — register uploaded work files (already in Vercel Blob from the browser
//        upload). Files tagged to a client are mirrored into that client's
//        Files tab so the team sees them where client files already live.
// Deliberately NOT gated on onboarding paperwork (like hours, unlike invoices) —
// finished work stays submittable.

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://blokblokstudio-clients.vercel.app";

async function findContractor(token: string) {
  if (!token || token.length < 16) return null;
  return prisma.contractor.findUnique({
    where: { uploadToken: token },
    select: { id: true, name: true, company: true, isActive: true },
  });
}

const workSelect = {
  id: true,
  filename: true,
  url: true,
  fileSize: true,
  mimeType: true,
  note: true,
  clientId: true,
  clientName: true,
  createdAt: true,
} as const;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const contractor = await findContractor(token);
  if (!contractor || !contractor.isActive) {
    return NextResponse.json({ success: false, error: "Invalid link" }, { status: 404 });
  }

  const [assignments, files] = await Promise.all([
    // Prisma include-type inference is broken repo-wide — cast the result
    prisma.contractorClientAssignment.findMany({
      where: { contractorId: contractor.id },
      select: { client: { select: { id: true, name: true } } },
      orderBy: { createdAt: "asc" },
    }) as unknown as Promise<{ client: { id: string; name: string } }[]>,
    prisma.contractorWorkFile.findMany({
      where: { contractorId: contractor.id },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: workSelect,
    }),
  ]);

  return NextResponse.json({
    success: true,
    data: {
      clients: assignments.map((a) => a.client),
      files,
    },
  });
}

const submitSchema = z.object({
  clientId: z.string().max(100).nullable().optional(),
  note: z.string().max(2000).optional().or(z.literal("")),
  files: z
    .array(
      z.object({
        blobUrl: z.string().url(),
        filename: z.string().min(1).max(300),
        contentType: z.string().max(200).optional(),
        size: z.number().int().nonnegative().optional(),
      })
    )
    .min(1)
    .max(30),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const contractor = await findContractor(token);
    if (!contractor || !contractor.isActive) {
      return NextResponse.json({ success: false, error: "Invalid link" }, { status: 404 });
    }

    const parsed = submitSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: "Invalid input" }, { status: 400 });
    }
    const d = parsed.data;

    // Only accept files that actually live in our Blob store
    if (d.files.some((f) => !isAllowedBlobUrl(f.blobUrl))) {
      return NextResponse.json({ success: false, error: "Invalid file URL" }, { status: 400 });
    }

    // A client tag must be one of THIS contractor's assigned clients
    let client: { id: string; name: string } | null = null;
    if (d.clientId) {
      const assignment = await prisma.contractorClientAssignment.findFirst({
        where: { contractorId: contractor.id, clientId: d.clientId },
        select: { client: { select: { id: true, name: true } } },
      });
      if (!assignment) {
        return NextResponse.json(
          { success: false, error: "That client isn't assigned to you" },
          { status: 400 }
        );
      }
      client = (assignment as unknown as { client: { id: string; name: string } }).client;
    }

    const { ipAddress, userAgent } = requestMeta(request);
    const note = d.note?.trim() || null;
    const folder = `From ${contractor.name}`;

    const created = [];
    for (const f of d.files) {
      // Mirror into the client's Files tab first so the work row can point at it
      let clientFileId: string | null = null;
      if (client) {
        const mirror = await prisma.clientFile.create({
          data: {
            clientId: client.id,
            kind: "FILE",
            filename: f.filename,
            url: f.blobUrl,
            fileSize: f.size ?? null,
            mimeType: f.contentType || null,
            folder,
            notes: note,
            uploadedBy: contractor.name,
          },
          select: { id: true },
        });
        clientFileId = mirror.id;
      }

      const row = await prisma.contractorWorkFile.create({
        data: {
          contractorId: contractor.id,
          uploadedBy: contractor.name,
          clientId: client?.id ?? null,
          clientName: client?.name ?? null,
          filename: f.filename,
          url: f.blobUrl,
          fileSize: f.size ?? null,
          mimeType: f.contentType || null,
          note,
          clientFileId,
          submitIp: ipAddress,
          submitUserAgent: userAgent,
        },
        select: workSelect,
      });
      created.push(row);
    }

    const fileSummary =
      d.files.length === 1
        ? d.files[0].filename
        : `${d.files.length} files (${d.files
            .map((f) => f.filename)
            .join(", ")
            .slice(0, 300)})`;

    await prisma.activityLog.create({
      data: {
        clientId: client?.id ?? null,
        actor: "contractor",
        action: "contractor_work_uploaded",
        details: `${contractor.name} uploaded finished work${
          client ? ` for ${client.name}` : ""
        }: ${fileSummary}`,
        ipAddress,
        userAgent,
      },
    });

    // Blob paths are public-but-unguessable, same as client files — linking
    // them in the team channel is fine (no client pricing involved).
    const links = created.map((r) => `<${r.url}|${r.filename}>`).join(", ");
    notifySlack(
      client
        ? `:package: *${contractor.name}* uploaded finished work for *${client.name}*: ${links}\n<${APP_URL}/clients/${client.id}|Open client> — it's in their Files tab`
        : `:package: *${contractor.name}* uploaded finished work (general/internal): ${links}\n<${APP_URL}/work|Open Work>`
    ).catch(() => {});

    return NextResponse.json({ success: true, data: created }, { status: 201 });
  } catch {
    return NextResponse.json({ success: false, error: "Failed to submit work" }, { status: 500 });
  }
}
