import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { put, del } from "@vercel/blob";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { encryptBuffer } from "@/lib/encryption";
import { fetchBlobBounded, isAllowedBlobUrl, BlobFetchError } from "@/lib/blob-fetch";

export const maxDuration = 300;

const attachSchema = z.object({
  blobUrl: z.string().url(),
  filename: z.string().min(1).max(300),
  contentType: z.string().max(200).optional(),
});

// POST /api/compliance/documents/[id]/attach — attach a team-uploaded file to a
// tax document (e.g. the countersigned agreement or a 1099 copy to deliver via
// the contractor portal). Same encrypt-and-delete-plaintext flow as invoices.
// OUTBOUND docs flip to SENT (the contractor can download immediately);
// INBOUND docs flip to RECEIVED (e.g. a W-9 that arrived by email).
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getSession();
    const parsed = attachSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: "Invalid input" }, { status: 400 });
    }
    const d = parsed.data;

    const doc = await prisma.taxDocument.findUnique({
      where: { id },
      select: {
        id: true,
        type: true,
        direction: true,
        contractor: { select: { name: true } },
        client: { select: { name: true } },
      },
    });
    if (!doc) {
      return NextResponse.json({ success: false, error: "Document not found" }, { status: 404 });
    }

    if (!isAllowedBlobUrl(d.blobUrl)) {
      return NextResponse.json({ success: false, error: "Invalid file URL" }, { status: 400 });
    }

    let fileBuffer: Buffer;
    try {
      fileBuffer = await fetchBlobBounded(d.blobUrl, 25 * 1024 * 1024);
    } catch (e) {
      await del(d.blobUrl).catch(() => {});
      const status = e instanceof BlobFetchError ? e.status : 400;
      const message = e instanceof BlobFetchError ? e.message : "Uploaded file not found";
      return NextResponse.json({ success: false, error: message }, { status });
    }

    const { encrypted, iv } = encryptBuffer(fileBuffer);
    const encryptedBlob = await put(`tax-documents/enc/${randomUUID()}.bin`, encrypted, {
      access: "public",
      contentType: "application/octet-stream",
      addRandomSuffix: false,
    });
    await del(d.blobUrl).catch(() => {});

    const updated = await prisma.taxDocument.update({
      where: { id },
      data: {
        fileUrl: encryptedBlob.url,
        filename: d.filename,
        contentType: d.contentType || null,
        size: fileBuffer.length,
        encrypted: true,
        encryptionIv: iv,
        status: doc.direction === "OUTBOUND" ? "SENT" : "RECEIVED",
        receivedAt: new Date(),
      },
      include: {
        contractor: { select: { id: true, name: true, country: true } },
        client: { select: { id: true, name: true, country: true } },
      },
    });

    await prisma.activityLog.create({
      data: {
        actor: session?.name || "team",
        action: "tax_document_attached",
        details: `Attached ${d.filename} to ${doc.type} for ${doc.contractor?.name || doc.client?.name || "unknown"} (${doc.direction === "OUTBOUND" ? "sent" : "received"})`,
      },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch {
    return NextResponse.json({ success: false, error: "Failed to attach file" }, { status: 500 });
  }
}
