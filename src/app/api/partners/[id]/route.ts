import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { partnerLedgerTotals } from "@/lib/commissions";
import { partnerDeals, partnerPortalUrl, partnerPayoutRows } from "@/lib/partner-portal";
import { getSetting, setSetting } from "@/lib/lifecycle/settings";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (session?.role !== "OWNER") {
    return NextResponse.json({ success: false, error: "Owner only" }, { status: 403 });
  }
  const { id } = await params;
  const partner = await prisma.partner.findUnique({ where: { id } });
  if (!partner) {
    return NextResponse.json({ success: false, error: "Partner not found" }, { status: 404 });
  }

  const [reps, agreements, taxDocs, deals, totals, payouts, signerName, hasSignature] = await Promise.all([
    prisma.partnerRep.findMany({ where: { partnerId: partner.id }, orderBy: [{ isAdmin: "desc" }, { createdAt: "asc" }] }),
    partner.contractorId
      ? prisma.contractorContract.findMany({
          where: { contractorId: partner.contractorId, kind: "REFERRAL_PARTNER" },
          orderBy: { createdAt: "desc" },
          select: { id: true, status: true, title: true, signedAt: true, createdAt: true, token: true },
        })
      : [],
    partner.contractorId
      ? prisma.taxDocument.findMany({
          where: { contractorId: partner.contractorId, direction: "INBOUND", type: { in: ["W9", "W8BEN"] } },
          select: { type: true, status: true },
        })
      : [],
    partnerDeals(partner.id, null),
    partnerLedgerTotals(partner.id),
    partnerPayoutRows(partner.id, 50),
    getSetting<string>("partner_contract_signer_name", "Chase Haynes"),
    getSetting<string | null>("partner_contract_signature_data", null).then((v) => !!v),
  ]);

  return NextResponse.json({
    success: true,
    data: {
      id: partner.id,
      name: partner.name,
      legalName: partner.legalName,
      contactName: partner.contactName,
      email: partner.email,
      phone: partner.phone,
      country: partner.country,
      isActive: partner.isActive,
      notes: partner.notes,
      qualificationCriteria: partner.qualificationCriteria,
      bookingLink: partner.bookingLink,
      rates: {
        rateProjectHandoff: Number(partner.rateProjectHandoff),
        rateProjectClose: Number(partner.rateProjectClose),
        rateBrandGuideHandoff: Number(partner.rateBrandGuideHandoff),
        rateBrandGuideClose: Number(partner.rateBrandGuideClose),
        ratePlan: Number(partner.ratePlan),
        planMonths: partner.planMonths,
        payoutDays: partner.payoutDays,
      },
      w9ReceivedAt: partner.w9ReceivedAt,
      w9DocStatus: taxDocs[0]?.status || null,
      stripeConnectAccountId: partner.stripeConnectAccountId,
      connectOnboarded: partner.connectOnboarded,
      contractorId: partner.contractorId,
      agreements,
      reps: reps.map((r) => ({
        id: r.id,
        name: r.name,
        email: r.email,
        isAdmin: r.isAdmin,
        canClose: r.canClose,
        isActive: r.isActive,
        portalUrl: partnerPortalUrl(r.token),
        createdAt: r.createdAt,
      })),
      deals,
      totals,
      payouts,
      signer: { name: signerName, hasSignature },
      createdAt: partner.createdAt,
    },
  });
}

const patchSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  legalName: z.string().max(200).nullable().optional(),
  contactName: z.string().max(120).nullable().optional(),
  email: z.string().email().max(254).nullable().optional(),
  phone: z.string().max(40).nullable().optional(),
  notes: z.string().max(5000).nullable().optional(),
  qualificationCriteria: z.string().max(10000).nullable().optional(),
  bookingLink: z.string().url().max(500).nullable().optional().or(z.literal("")),
  isActive: z.boolean().optional(),
  w9Received: z.boolean().optional(),
  rates: z
    .object({
      rateProjectHandoff: z.number().min(0).max(100),
      rateProjectClose: z.number().min(0).max(100),
      rateBrandGuideHandoff: z.number().min(0).max(100),
      rateBrandGuideClose: z.number().min(0).max(100),
      ratePlan: z.number().min(0).max(100),
      planMonths: z.number().int().min(1).max(120),
      payoutDays: z.number().int().min(1).max(90),
    })
    .partial()
    .optional(),
  /** Counter-signature used on every partner-generated client contract */
  signer: z
    .object({
      name: z.string().min(1).max(200).optional(),
      signatureData: z.string().max(500000).nullable().optional(),
    })
    .optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (session?.role !== "OWNER") {
    return NextResponse.json({ success: false, error: "Owner only" }, { status: 403 });
  }
  const { id } = await params;
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: parsed.error.issues[0]?.message || "Invalid input" }, { status: 400 });
  }
  const d = parsed.data;

  const partner = await prisma.partner.findUnique({ where: { id }, select: { id: true, name: true, w9ReceivedAt: true } });
  if (!partner) {
    return NextResponse.json({ success: false, error: "Partner not found" }, { status: 404 });
  }

  await prisma.partner.update({
    where: { id },
    data: {
      ...(d.name !== undefined ? { name: d.name.trim() } : {}),
      ...(d.legalName !== undefined ? { legalName: d.legalName?.trim() || null } : {}),
      ...(d.contactName !== undefined ? { contactName: d.contactName?.trim() || null } : {}),
      ...(d.email !== undefined ? { email: d.email?.trim().toLowerCase() || null } : {}),
      ...(d.phone !== undefined ? { phone: d.phone?.trim() || null } : {}),
      ...(d.notes !== undefined ? { notes: d.notes?.trim() || null } : {}),
      ...(d.qualificationCriteria !== undefined ? { qualificationCriteria: d.qualificationCriteria?.trim() || null } : {}),
      ...(d.bookingLink !== undefined ? { bookingLink: d.bookingLink?.trim() || null } : {}),
      ...(d.isActive !== undefined ? { isActive: d.isActive } : {}),
      ...(d.w9Received !== undefined ? { w9ReceivedAt: d.w9Received ? partner.w9ReceivedAt || new Date() : null } : {}),
      ...(d.rates || {}),
    },
  });

  if (d.signer) {
    if (d.signer.name) await setSetting("partner_contract_signer_name", d.signer.name.trim(), session.name);
    if (d.signer.signatureData !== undefined) {
      await setSetting("partner_contract_signature_data", d.signer.signatureData || null, session.name);
    }
  }

  if (d.rates) {
    await prisma.activityLog.create({
      data: {
        actor: session.name,
        action: "partner_rates_changed",
        details: `Commission rates updated for ${partner.name}: ${JSON.stringify(d.rates)}`,
      },
    }).catch(() => {});
  }

  return NextResponse.json({ success: true });
}
