import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireOwner, handleError } from "@/app/api/studio-invoices/_shared";
import { logInvoiceActivity } from "@/lib/invoicing/service";

export const dynamic = "force-dynamic";

// GET — imported Stripe payments with no client, grouped by payer email. Owner only.
export async function GET() {
  const { denied } = await requireOwner();
  if (denied) return denied;
  try {
    const rows = await prisma.stripePayment.findMany({ where: { clientId: null }, select: { billingEmail: true, amount: true, currency: true, taxYear: true, description: true } });
    const groups = new Map<string, { email: string; count: number; years: number[]; totals: Record<string, number>; test: boolean }>();
    for (const r of rows) {
      const email = (r.billingEmail || "").toLowerCase();
      const g = groups.get(email) || { email, count: 0, years: [], totals: {}, test: true };
      g.count++;
      if (!g.years.includes(r.taxYear)) g.years.push(r.taxYear);
      g.totals[r.currency] = Math.round(((g.totals[r.currency] || 0) + Number(r.amount)) * 100) / 100;
      if (r.description !== "Test charge") g.test = false;
      groups.set(email, g);
    }
    return NextResponse.json({ success: true, data: [...groups.values()].sort((a, b) => b.count - a.count) });
  } catch (err) {
    return handleError(err, "Failed to load unlinked payments");
  }
}

const schema = z.object({ email: z.string().email().max(320), clientId: z.string().min(1).max(64) });

// POST { email, clientId } — link every unlinked payment from that payer email to the client
export async function POST(request: NextRequest) {
  const { session, denied } = await requireOwner();
  if (denied || !session) return denied;
  try {
    const { email, clientId } = schema.parse(await request.json());
    const client = await prisma.client.findUnique({ where: { id: clientId }, select: { id: true, name: true } });
    if (!client) return NextResponse.json({ success: false, error: "Client not found" }, { status: 404 });
    const res = await prisma.stripePayment.updateMany({ where: { clientId: null, billingEmail: { equals: email, mode: "insensitive" } }, data: { clientId } });
    if (res.count) await logInvoiceActivity({ clientId, actor: session.name, action: "stripe_history_linked", details: `${res.count} imported Stripe payment(s) from ${email} linked to ${client.name}` });
    return NextResponse.json({ success: true, data: { linked: res.count } });
  } catch (err) {
    return handleError(err, "Link failed");
  }
}
