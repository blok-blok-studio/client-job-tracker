import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { randomUUID } from "crypto";
import { put, del } from "@vercel/blob";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requestMeta } from "@/lib/request-meta";
import { notifySlack } from "@/lib/slack";
import { encryptBuffer } from "@/lib/encryption";
import { scanContractorInvoice } from "@/lib/invoice-scan";
import { fetchBlobBounded, isAllowedBlobUrl, BlobFetchError } from "@/lib/blob-fetch";

// Registration downloads the blob, encrypts it, and runs the AI scan after
// responding — needs longer than the default function window.
export const maxDuration = 300;

// Public, token-scoped contractor invoice portal API.
// GET  — validate the link and return the contractor's own submissions
// POST — register an uploaded invoice: the file (already in Vercel Blob from
//        the browser upload) is pulled server-side, AES-256-GCM encrypted,
//        re-stored, and the plaintext blob deleted. The AI amount scan runs
//        in the background after the response.

async function findContractor(token: string) {
  if (!token || token.length < 16) return null;
  return prisma.contractor.findUnique({
    where: { uploadToken: token },
    select: { id: true, name: true, company: true, isActive: true, avatarUrl: true },
  });
}

// Onboarding gate: these must be on file before invoices can be submitted.
// Hours logging is deliberately NOT gated — work records stay recordable.
const BLOCKING_DOC_TYPES = ["CONTRACTOR_AGREEMENT", "W9", "W8BEN"];
const BLOCKING_DOC_LABELS: Record<string, string> = {
  CONTRACTOR_AGREEMENT: "Signed contractor agreement",
  W9: "Form W-9",
  W8BEN: "Form W-8BEN / W-8BEN-E",
};

async function missingRequiredDocs(contractorId: string): Promise<string[]> {
  const open = await prisma.taxDocument.findMany({
    where: {
      contractorId,
      direction: "INBOUND",
      status: "REQUESTED",
      type: { in: BLOCKING_DOC_TYPES },
    },
    select: { type: true },
  });
  return open.map((d) => BLOCKING_DOC_LABELS[d.type] || d.type);
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const contractor = await findContractor(token);
  if (!contractor || !contractor.isActive) {
    return NextResponse.json({ success: false, error: "Invalid link" }, { status: 404 });
  }

  const [invoices, missingDocs] = await Promise.all([
    prisma.contractorInvoice.findMany({
      where: { contractorId: contractor.id },
      orderBy: { submittedAt: "desc" },
      take: 50,
      select: {
        id: true,
        invoiceNumber: true,
        amount: true,
        currency: true,
        filename: true,
        status: true,
        submittedAt: true,
        paidAt: true,
      },
    }),
    missingRequiredDocs(contractor.id),
  ]);

  return NextResponse.json({
    success: true,
    data: {
      contractor: {
        name: contractor.name,
        company: contractor.company,
        avatarUrl: contractor.avatarUrl,
      },
      invoices,
      missingDocs,
    },
  });
}

const submitSchema = z.object({
  blobUrl: z.string().url(),
  filename: z.string().min(1).max(300),
  contentType: z.string().max(200).optional(),
  size: z.number().int().nonnegative().optional(),
  invoiceNumber: z.string().max(100).optional().or(z.literal("")),
  amount: z.number().nonnegative().max(1_000_000).nullable().optional(),
  currency: z.enum(["USD", "EUR", "GBP", "CHF"]).optional(),
  invoiceDate: z.string().optional().or(z.literal("")),
  dueDate: z.string().optional().or(z.literal("")),
  description: z.string().max(2000).optional().or(z.literal("")),
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

    // Required paperwork gates invoice submission (not hours logging)
    const missing = await missingRequiredDocs(contractor.id);
    if (missing.length > 0) {
      return NextResponse.json(
        {
          success: false,
          error: `Before submitting invoices, please provide: ${missing.join(", ")} (see the Documents tab)`,
        },
        { status: 403 }
      );
    }

    const body = await request.json();
    const parsed = submitSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: "Invalid input" }, { status: 400 });
    }
    const d = parsed.data;

    // Only accept files that actually live in our Blob store
    if (!isAllowedBlobUrl(d.blobUrl)) {
      return NextResponse.json({ success: false, error: "Invalid file URL" }, { status: 400 });
    }

    const { ipAddress, userAgent } = requestMeta(request);

    // Pull the plaintext upload server-side (size-capped, no redirects), encrypt
    // it, store the ciphertext, and delete the plaintext blob — files never
    // persist unencrypted.
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
    const encryptedBlob = await put(`contractor-invoices/enc/${randomUUID()}.bin`, encrypted, {
      access: "public",
      contentType: "application/octet-stream",
      addRandomSuffix: false,
    });
    await del(d.blobUrl).catch(() => {});

    const invoice = await prisma.contractorInvoice.create({
      data: {
        contractorId: contractor.id,
        invoiceNumber: d.invoiceNumber || null,
        description: d.description || null,
        amount: d.amount ?? null,
        currency: d.currency || "USD",
        invoiceDate: d.invoiceDate ? new Date(d.invoiceDate) : null,
        dueDate: d.dueDate ? new Date(d.dueDate) : null,
        fileUrl: encryptedBlob.url,
        filename: d.filename,
        contentType: d.contentType || null,
        size: fileBuffer.length,
        encrypted: true,
        encryptionIv: iv,
        submitIp: ipAddress,
        submitUserAgent: userAgent,
        audits: {
          create: {
            event: "uploaded",
            actor: "contractor",
            ipAddress,
            userAgent,
            metadata: JSON.stringify({
              filename: d.filename,
              size: fileBuffer.length,
              invoiceNumber: d.invoiceNumber || null,
              amount: d.amount ?? null,
              currency: d.currency || "USD",
              encrypted: true,
            }),
          },
        },
      },
      select: {
        id: true,
        invoiceNumber: true,
        amount: true,
        currency: true,
        filename: true,
        status: true,
        submittedAt: true,
        paidAt: true,
      },
    });

    await prisma.activityLog.create({
      data: {
        actor: "contractor",
        action: "contractor_invoice_submitted",
        details: `${contractor.name} submitted invoice ${d.invoiceNumber || d.filename}${
          d.amount ? ` (${d.currency || "USD"} ${d.amount.toFixed(2)})` : ""
        }`,
        ipAddress,
        userAgent,
      },
    });

    // No amounts in Slack — the channel is team-visible, finances are owner-only
    notifySlack(
      `:page_facing_up: New contractor invoice from *${contractor.name}*${
        d.invoiceNumber ? ` (#${d.invoiceNumber})` : ""
      }`
    ).catch(() => {});

    // AI amount verification runs after the response goes out
    after(() => scanContractorInvoice(invoice.id, fileBuffer, d.contentType || null, d.filename));

    return NextResponse.json({ success: true, data: invoice });
  } catch {
    return NextResponse.json({ success: false, error: "Failed to submit invoice" }, { status: 500 });
  }
}
