import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { put, del } from "@vercel/blob";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requestMeta } from "@/lib/request-meta";
import { notifySlack } from "@/lib/slack";
import { encryptBuffer } from "@/lib/encryption";
import { fetchBlobBounded, isAllowedBlobUrl, BlobFetchError } from "@/lib/blob-fetch";
import { isSelfHeldDocType, SELF_HELD_ATTESTATION_TEXT } from "@/lib/tax/obligations-source";

export const maxDuration = 300;

// Public, token-scoped tax document API for the contractor portal.
// GET  — the contractor's requested/received tax documents (W-9, W-8BEN, ...)
// POST — either:
//   • attest (SSN/TIN forms like W-9/W-8BEN): record a timestamped confirmation
//     that the contractor holds the form and sent it to the accountant. We store
//     NO copy and no SSN — data minimization.
//   • upload (non-sensitive forms like the signed agreement): file pulled
//     server-side, AES-256-GCM encrypted, plaintext blob deleted.

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
        // self-held forms are confirmed by attestation, never uploaded here
        selfHeld: isSelfHeldDocType(d.type),
      })),
    },
  });
}

const submitSchema = z.object({
  documentId: z.string().max(64),
  // Present for a self-attestation (SSN/TIN forms); absent for a file upload
  attest: z.literal(true).optional(),
  // Present for a file upload (non-sensitive forms)
  blobUrl: z.string().url().optional(),
  filename: z.string().min(1).max(300).optional(),
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

    const { ipAddress, userAgent } = requestMeta(request);
    const selfHeld = isSelfHeldDocType(doc.type);

    // Self-held SSN/TIN forms are confirmed by attestation only — we store no
    // copy. Reject any attempt to upload a file for these types.
    if (selfHeld) {
      if (d.attest !== true) {
        return NextResponse.json(
          { success: false, error: "This form is confirmed by attestation, not upload." },
          { status: 400 }
        );
      }
      const validUntil =
        doc.type === "W8BEN"
          ? new Date(Date.UTC(new Date().getUTCFullYear() + 3, 11, 31))
          : undefined;

      const updated = await prisma.taxDocument.update({
        where: { id: doc.id },
        data: {
          status: "ATTESTED",
          attestedAt: new Date(),
          attestationText: SELF_HELD_ATTESTATION_TEXT,
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
          action: "tax_document_attested",
          details: `${contractor.name} confirmed their ${doc.type} (sent to accountant; no copy stored)`,
          ipAddress,
          userAgent,
        },
      }).catch(() => {});

      notifySlack(
        `:white_check_mark: *${contractor.name}* confirmed their ${DOC_LABELS[doc.type] || doc.type} (delivered to accountant; not stored here)`
      ).catch(() => {});

      return NextResponse.json({ success: true, data: updated });
    }

    // Non-sensitive forms (e.g. signed agreement) — normal encrypted upload path
    if (!d.blobUrl || !d.filename) {
      return NextResponse.json({ success: false, error: "A file is required." }, { status: 400 });
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
