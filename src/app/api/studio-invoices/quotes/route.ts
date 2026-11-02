import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireOwner, handleError } from "../_shared";
import { createQuote, quoteSchema, publicQuoteUrl } from "@/lib/invoicing/quotes";

export const dynamic = "force-dynamic";

export async function GET() {
  const { denied } = await requireOwner();
  if (denied) return denied;
  try {
    const quotes = await prisma.quote.findMany({ orderBy: { createdAt: "desc" }, take: 300 });
    const clients = await prisma.client.findMany({ where: { id: { in: [...new Set(quotes.map((q) => q.clientId))] } }, select: { id: true, name: true, company: true } });
    const byId = new Map(clients.map((c) => [c.id, c]));
    return NextResponse.json({
      success: true,
      data: quotes.map((q) => ({ ...q, total: Number(q.total), subtotal: Number(q.subtotal), vatAmount: Number(q.vatAmount), vatRate: Number(q.vatRate), client: byId.get(q.clientId) || { id: q.clientId, name: "Unknown", company: null }, publicUrl: publicQuoteUrl(q.token) })),
    });
  } catch (err) {
    return handleError(err, "Failed to load quotes");
  }
}

export async function POST(request: NextRequest) {
  const { session, denied } = await requireOwner();
  if (denied || !session) return denied;
  try {
    const body = quoteSchema.parse(await request.json());
    const q = await createQuote(body, session.name);
    return NextResponse.json({ success: true, data: { ...q, total: Number(q.total), publicUrl: publicQuoteUrl(q.token) } }, { status: 201 });
  } catch (err) {
    return handleError(err, "Failed to create quote");
  }
}
