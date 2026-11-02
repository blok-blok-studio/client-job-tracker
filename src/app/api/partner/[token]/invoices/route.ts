import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { requestMeta } from "@/lib/request-meta";
import { findRepByToken } from "@/lib/partner-portal";
import { PARTNER_WEBSITE_IDS, PARTNER_BRAND_GUIDE_ID, PARTNER_PLAN_IDS, partnerPackage } from "@/lib/partner-catalog";
import { createDraft, InvoiceError } from "@/lib/invoicing/service";
import { publicInvoiceUrl } from "@/lib/invoicing/view";
import { notifyUser } from "@/lib/notifications";
import { notifySlack } from "@/lib/slack";

export const dynamic = "force-dynamic";

// Bank-transfer invoices from the partner portal.
// GET  — the invoices for this team's practices (admins: all; reps: their own)
// POST — an approved closer drafts one from the locked price list. It lands as
//        a DRAFT in Chase's /invoices; only the owner issues the number, so a
//        partner can never put an invoice out in Blok Blok's name unseen.

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://app.blokblokstudio.com";

export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const rl = rateLimit(getClientIp(request), { max: 60, prefix: "partner-invoices" });
  if (!rl.allowed) return NextResponse.json({ success: false, error: "Too many requests" }, { status: 429 });
  const { token } = await params;
  const rep = await findRepByToken(token);
  if (!rep) return NextResponse.json({ success: false, error: "Invalid link" }, { status: 404 });
  const clients = await prisma.client.findMany({
    where: { partnerId: rep.partnerId, ...(rep.isAdmin ? {} : { partnerRepId: rep.id }) },
    select: { id: true },
  });
  const rows = await prisma.studioInvoice.findMany({
    where: { clientId: { in: clients.map((c) => c.id) } },
    orderBy: { createdAt: "desc" },
    select: { id: true, number: true, status: true, token: true, total: true, currency: true, issueDate: true, dueDate: true, paidAt: true, clientId: true, partnerRepId: true, createdAt: true, items: true },
  });
  return NextResponse.json({
    success: true,
    data: rows.map((r) => ({
      id: r.id,
      number: r.number,
      status: r.status,
      total: Number(r.total),
      currency: r.currency,
      issueDate: r.issueDate,
      dueDate: r.dueDate,
      paidAt: r.paidAt,
      clientId: r.clientId,
      createdAt: r.createdAt,
      summary: (r.items as Array<{ description: string }>).map((i) => i.description).join(", "),
      payUrl: r.status === "DRAFT" ? null : publicInvoiceUrl(r.token),
    })),
  });
}

const schema = z.object({
  clientId: z.string().min(1),
  websiteId: z.enum(PARTNER_WEBSITE_IDS).nullable().optional(),
  brandGuide: z.boolean().optional().default(false),
  planId: z.enum(PARTNER_PLAN_IDS).nullable().optional(),
  milestone: z.enum(["deposit", "balance", "full"]).default("deposit"),
  vat19: z.boolean().optional().default(false),
  note: z.string().trim().max(300).optional(),
});

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const rl = rateLimit(getClientIp(request), { max: 20, prefix: "partner-invoice-create" });
  if (!rl.allowed) return NextResponse.json({ success: false, error: "Too many requests" }, { status: 429 });
  const { token } = await params;
  const rep = await findRepByToken(token);
  if (!rep) return NextResponse.json({ success: false, error: "Invalid link" }, { status: 404 });
  if (!rep.canClose) return NextResponse.json({ success: false, error: "Your link is not approved for closing yet." }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ success: false, error: "Pick at least one package from the price list" }, { status: 400 });
  const d = parsed.data;

  const client = await prisma.client.findUnique({ where: { id: d.clientId }, select: { id: true, name: true, partnerId: true } });
  if (!client || client.partnerId !== rep.partnerId) return NextResponse.json({ success: false, error: "That practice is not registered to your team" }, { status: 404 });

  const items: Array<{ description: string; qty: number; unitPrice: number }> = [];
  const oneTimeIds: string[] = [];
  if (d.websiteId) oneTimeIds.push(d.websiteId);
  if (d.brandGuide) oneTimeIds.push(PARTNER_BRAND_GUIDE_ID);
  const oneTime = oneTimeIds.map((id) => partnerPackage(id)).filter((p): p is NonNullable<typeof p> => !!p);
  const share = d.milestone === "full" ? 1 : 0.5;
  const label = d.milestone === "deposit" ? "50% deposit" : d.milestone === "balance" ? "50% balance on completion" : "full amount";
  for (const p of oneTime) items.push({ description: `${p.name} (${label})`, qty: 1, unitPrice: Math.round(p.price * share * 100) / 100 });
  if (d.planId) {
    const plan = partnerPackage(d.planId);
    if (plan) items.push({ description: `${plan.name} (first month)`, qty: 1, unitPrice: plan.price });
  }
  if (!items.length) return NextResponse.json({ success: false, error: "Pick at least one package from the price list" }, { status: 400 });

  try {
    const { invoice } = await createDraft(
      { clientId: client.id, template: "US", language: "en", currency: "USD", items, vatOverride: d.vat19 ? "REGULAR" : null, internalNote: `Drafted from the partner portal by ${rep.name}${d.note ? `: ${d.note}` : ""}` },
      `partner:${rep.name}`
    );
    await prisma.studioInvoice.update({ where: { id: invoice.id }, data: { partnerId: rep.partnerId, partnerRepId: rep.id, milestone: d.milestone } });
    const { ipAddress, userAgent } = requestMeta(request);
    await prisma.activityLog.create({ data: { clientId: client.id, actor: `partner:${rep.name}`, action: "invoice_draft_from_partner", details: `Bank-transfer invoice draft for ${client.name} created in the partner portal (${label})`, ipAddress, userAgent } }).catch(() => {});
    const owners = await prisma.user.findMany({ where: { role: "OWNER", isActive: true }, select: { id: true } });
    for (const o of owners) {
      await notifyUser({ userId: o.id, type: "approval_response", title: `Invoice draft from ${rep.name} for ${client.name}`, body: "Review and issue it on the Invoices page. Nothing goes to the client until you issue it.", link: `/invoices?invoice=${invoice.id}`, clientId: client.id }).catch(() => {});
    }
    await notifySlack(`:receipt: *Invoice draft from partner* ${rep.name} for *${client.name}* is waiting to be issued.\n${APP_URL}/invoices?invoice=${invoice.id}`).catch(() => {});
    return NextResponse.json({ success: true, data: { id: invoice.id, status: "DRAFT" } }, { status: 201 });
  } catch (err) {
    if (err instanceof InvoiceError) return NextResponse.json({ success: false, error: err.message }, { status: err.status });
    console.error("[partner/invoices] create failed:", err);
    return NextResponse.json({ success: false, error: "Could not create the invoice draft" }, { status: 500 });
  }
}
