import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { requestMeta } from "@/lib/request-meta";
import { findRepByToken } from "@/lib/partner-portal";

export const dynamic = "force-dynamic";

const schema = z.object({
  legalName: z.string().trim().max(200).nullable().optional(),
  billingAddress: z.string().trim().max(600).nullable().optional(),
  taxId: z.string().trim().max(40).nullable().optional(),
  email: z.string().trim().email().max(254).nullable().optional().or(z.literal("")),
});

// PATCH — the partner admin keeps their own billing identity current; it is
// what prints on commission statements. Country and VAT treatment stay with
// the owner.
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const rl = rateLimit(getClientIp(request), { max: 20, prefix: "partner-billing" });
  if (!rl.allowed) return NextResponse.json({ success: false, error: "Too many requests" }, { status: 429 });
  const { token } = await params;
  const rep = await findRepByToken(token);
  if (!rep) return NextResponse.json({ success: false, error: "Invalid link" }, { status: 404 });
  if (!rep.isAdmin) return NextResponse.json({ success: false, error: "Only the partner admin can change billing details" }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ success: false, error: "Check the fields" }, { status: 400 });
  const d = parsed.data;
  const partner = await prisma.partner.update({
    where: { id: rep.partnerId },
    data: {
      ...(d.legalName !== undefined ? { legalName: d.legalName || null } : {}),
      ...(d.billingAddress !== undefined ? { billingAddress: d.billingAddress || null } : {}),
      ...(d.taxId !== undefined ? { taxId: d.taxId || null } : {}),
      ...(d.email !== undefined ? { email: d.email || null } : {}),
    },
    select: { legalName: true, billingAddress: true, taxId: true, email: true, country: true },
  });
  const { ipAddress, userAgent } = requestMeta(request);
  await prisma.activityLog.create({ data: { actor: `partner:${rep.name}`, action: "partner_billing_updated", details: `Billing details updated from the partner portal`, ipAddress, userAgent } }).catch(() => {});
  return NextResponse.json({ success: true, data: partner });
}
