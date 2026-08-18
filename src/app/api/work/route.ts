import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { requestMeta } from "@/lib/request-meta";
import { notifySlack } from "@/lib/slack";
import { isAllowedBlobUrl } from "@/lib/blob-fetch";

// Internal finished-work hub (/work page).
// GET  — every work upload, contractor and team alike
// POST — a team member registers finished files (already streamed to Blob via
//        /api/uploads/stream). Client-tagged files mirror into that client's
//        Files tab, same as contractor-portal submissions.

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://blokblokstudio-clients.vercel.app";

const workSelect = {
  id: true,
  filename: true,
  url: true,
  fileSize: true,
  mimeType: true,
  note: true,
  clientId: true,
  clientName: true,
  uploadedBy: true,
  createdAt: true,
  contractor: { select: { id: true, name: true } },
} as const;

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  // Prisma include-type inference is broken repo-wide — cast the result
  const files = (await prisma.contractorWorkFile.findMany({
    orderBy: { createdAt: "desc" },
    take: 300,
    select: workSelect,
  })) as unknown as Array<{
    id: string;
    filename: string;
    url: string;
    fileSize: number | null;
    mimeType: string | null;
    note: string | null;
    clientId: string | null;
    clientName: string | null;
    uploadedBy: string;
    createdAt: Date;
    contractor: { id: string; name: string } | null;
  }>;

  return NextResponse.json({ success: true, data: files });
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

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const parsed = submitSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: "Invalid input" }, { status: 400 });
    }
    const d = parsed.data;

    if (d.files.some((f) => !isAllowedBlobUrl(f.blobUrl))) {
      return NextResponse.json({ success: false, error: "Invalid file URL" }, { status: 400 });
    }

    let client: { id: string; name: string } | null = null;
    if (d.clientId) {
      client = await prisma.client.findUnique({
        where: { id: d.clientId },
        select: { id: true, name: true },
      });
      if (!client) {
        return NextResponse.json({ success: false, error: "Client not found" }, { status: 404 });
      }
    }

    const { ipAddress, userAgent } = requestMeta(request);
    const note = d.note?.trim() || null;
    const folder = `From ${session.name}`;

    const created = [];
    for (const f of d.files) {
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
            uploadedBy: session.name,
          },
          select: { id: true },
        });
        clientFileId = mirror.id;
      }

      const row = await prisma.contractorWorkFile.create({
        data: {
          contractorId: null,
          uploadedBy: session.name,
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
        actor: session.name,
        action: "work_uploaded",
        details: `${session.name} uploaded finished work${
          client ? ` for ${client.name}` : ""
        }: ${fileSummary}`,
        ipAddress,
        userAgent,
      },
    });

    const links = d.files.map((f) => `<${f.blobUrl}|${f.filename}>`).join(", ");
    notifySlack(
      client
        ? `:package: *${session.name}* uploaded finished work for *${client.name}*: ${links}\n<${APP_URL}/clients/${client.id}|Open client> — it's in their Files tab`
        : `:package: *${session.name}* uploaded finished work (general/internal): ${links}\n<${APP_URL}/work|Open Work>`
    ).catch(() => {});

    return NextResponse.json({ success: true, data: created }, { status: 201 });
  } catch (error) {
    console.error("Failed to submit work:", error);
    return NextResponse.json({ success: false, error: "Failed to submit work" }, { status: 500 });
  }
}
