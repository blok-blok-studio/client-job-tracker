import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { z } from "zod";
import { syncEvent } from "@/lib/sync";

const invoiceSchema = z.object({
  clientId: z.string().min(1),
  amount: z.number().positive(),
  currency: z.string().max(10).default("USD"),
  status: z.enum(["DRAFT", "SENT", "PAID", "OVERDUE", "CANCELLED"]).default("DRAFT"),
  region: z.enum(["US", "EU"]).default("US"),
  country: z.string().length(2).default("US"),
  dueDate: z.string().optional(),
  notes: z.string().max(2000).optional(),
});

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const clientId = searchParams.get("clientId");

  const where: Record<string, unknown> = {};
  if (status) where.status = status;
  if (clientId) where.clientId = clientId;

  const invoices = await prisma.invoice.findMany({
    where,
    include: { client: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ success: true, data: invoices });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = invoiceSchema.parse(body);

    const invoice = await prisma.invoice.create({
      data: {
        clientId: parsed.clientId,
        amount: parsed.amount,
        currency: parsed.currency,
        status: parsed.status,
        region: parsed.region,
        country: parsed.country,
        notes: parsed.notes || undefined,
        dueDate: parsed.dueDate ? new Date(parsed.dueDate) : undefined,
        paidAt: parsed.status === "PAID" ? new Date() : undefined,
      },
    });

    // Sync: notify all systems
    syncEvent({ type: "invoice_created", clientId: parsed.clientId, amount: parsed.amount, status: parsed.status }).catch(() => {});

    return NextResponse.json({ success: true, data: invoice });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: "Validation failed", details: error.issues },
        { status: 400 }
      );
    }
    return NextResponse.json({ success: false, error: "Failed to create invoice" }, { status: 500 });
  }
}
