import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { put, del } from "@vercel/blob";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requestMeta } from "@/lib/request-meta";
import { notifySlack } from "@/lib/slack";
import { encryptBuffer } from "@/lib/encryption";
import { fetchBlobBounded, isAllowedBlobUrl, BlobFetchError } from "@/lib/blob-fetch";

export const maxDuration = 300;

// Public, token-scoped tax document API for the contractor portal.
// GET  — the contractor's requested/received tax documents (W-9, W-8BEN, ...)
// POST — attach an uploaded file to a requested document: pulled server-side,
//        AES-256-GCM encrypted, plaintext blob deleted (same flow as invoices).

const DOC_LABELS: Record<string, string> = {
  W9: "Form W-9 (US taxpayer info)",
  W8BEN: "Form W-8BEN / W-8BEN-E (foreign status)",
  CONTRACTOR_AGREEMENT: "Signed contractor agreement",
  COUNTERSIGNED_AGREEMENT: "Your countersigned agreement copy",
  COMPANY_INFO: "Blok Blok billing details",
  "1099_NEC_COPY": "Your 1099-NEC copy",
};

async function findContractor(token: string) {
  if (!token || token.length < 16) return null;
  return prisma.contractor.findUnique({
    where: { uploadToken: token },
    select: { id: true, name: true, isActive: true },
  });
}

const docSelect = {
  id: true,
  type: true,
  direction: true,
  status: true,
  note: true,
  filename: true,
  fileUrl: true,
  validUntil: true,
  requestedAt: true,
  receivedAt: true,
} as const;

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const contractor = await findContractor(token);
  if (!contractor || !contractor.isActive) {
    return NextResponse.json({ success: false, error: "Invalid link" }, { status: 404 });
  }

  const documents = await prisma.taxDocument.findMany({
    where: { contractorId: contractor.id, status: { not: "NA" } },
    orderBy: [{ direction: "asc" }, { requestedAt: "asc" }],
    select: docSelect,
  });

  return NextResponse.json({
    success: true,
    data: {
      // fileUrl itself never leaves the server — the portal downloads through
      // the token-scoped decrypt route instead
      documents: documents.map(({ fileUrl, ...d }) => ({
        ...d,
        label: DOC_LABELS[d.type] || d.type,
        downloadable: !!fileUrl,
      })),
    },
  });
}

const submitSchema = z.object({
  documentId: z.string().max(64),
  blobUrl: z.string().url(),
  filename: z.string().min(1).max(300),
  contentType: z.string().max(200).optional(),
  size: z.number().int().nonnegative().optional(),
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

    const doc = await prisma.taxDocument.findFirst({
      where: { id: d.documentId, contractorId: contractor.id, direction: "INBOUND" },
      select: { id: true, type: true },
    });
    if (!doc) {
      return NextResponse.json({ success: false, error: "Document not found" }, { status: 404 });
    }

    if (!isAllowedBlobUrl(d.blobUrl)) {
      return NextResponse.json({ success: false, error: "Invalid file URL" }, { status: 400 });
    }

    const { ipAddress, userAgent } = requestMeta(request);

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

    // W-8BEN certifications are valid through the third following calendar year
    const validUntil =
      doc.type === "W8BEN"
        ? new Date(Date.UTC(new Date().getUTCFullYear() + 3, 11, 31))
        : undefined;

    const updated = await prisma.taxDocument.update({
      where: { id: doc.id },
      data: {
        status: "RECEIVED",
        fileUrl: encryptedBlob.url,
        filename: d.filename,
        contentType: d.contentType || null,
        size: fileBuffer.length,
        encrypted: true,
        encryptionIv: iv,
        receivedAt: new Date(),
        submitIp: ipAddress,
        submitUserAgent: userAgent,
        ...(validUntil ? { validUntil } : {}),
      },
      select: docSelect,
    });

    await prisma.activityLog.create({
      data: {
        actor: "contractor",
        action: "tax_document_received",
        details: `${contractor.name} uploaded ${doc.type} (${d.filename})`,
        ipAddress,
        userAgent,
      },
    });

    notifySlack(
      `:card_index_dividers: *${contractor.name}* uploaded their ${DOC_LABELS[doc.type] || doc.type}`
    ).catch(() => {});

    return NextResponse.json({ success: true, data: updated });
  } catch {
    return NextResponse.json({ success: false, error: "Failed to submit document" }, { status: 500 });
  }
}
