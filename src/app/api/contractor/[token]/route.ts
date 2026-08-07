import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requestMeta } from "@/lib/request-meta";
import { notifySlack } from "@/lib/slack";

// Public, token-scoped contractor invoice portal API.
// GET  — validate the link and return the contractor's own submissions
// POST — register an uploaded invoice (file already sits in Vercel Blob)

async function findContractor(token: string) {
  if (!token || token.length < 16) return null;
  return prisma.contractor.findUnique({
    where: { uploadToken: token },
    select: { id: true, name: true, company: true, isActive: true },
  });
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

  const invoices = await prisma.contractorInvoice.findMany({
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
  });

  return NextResponse.json({
    success: true,
    data: {
      contractor: { name: contractor.name, company: contractor.company },
      invoices,
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

    const body = await request.json();
    const parsed = submitSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: "Invalid input" }, { status: 400 });
    }
    const d = parsed.data;

    // Only accept files that actually live in our Blob store
    if (!/^https:\/\/[\w.-]+\.public\.blob\.vercel-storage\.com\//.test(d.blobUrl)) {
      return NextResponse.json({ success: false, error: "Invalid file URL" }, { status: 400 });
    }

    const { ipAddress, userAgent } = requestMeta(request);

    const invoice = await prisma.contractorInvoice.create({
      data: {
        contractorId: contractor.id,
        invoiceNumber: d.invoiceNumber || null,
        description: d.description || null,
        amount: d.amount ?? null,
        currency: d.currency || "USD",
        invoiceDate: d.invoiceDate ? new Date(d.invoiceDate) : null,
        dueDate: d.dueDate ? new Date(d.dueDate) : null,
        fileUrl: d.blobUrl,
        filename: d.filename,
        contentType: d.contentType || null,
        size: d.size ?? null,
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
              size: d.size ?? null,
              invoiceNumber: d.invoiceNumber || null,
              amount: d.amount ?? null,
              currency: d.currency || "USD",
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

    const amountText = d.amount ? ` — ${d.currency || "USD"} ${d.amount.toFixed(2)}` : "";
    notifySlack(
      `:page_facing_up: New contractor invoice from *${contractor.name}*${amountText}${
        d.invoiceNumber ? ` (#${d.invoiceNumber})` : ""
      }`
    ).catch(() => {});

    return NextResponse.json({ success: true, data: invoice });
  } catch {
    return NextResponse.json({ success: false, error: "Failed to submit invoice" }, { status: 500 });
  }
}
