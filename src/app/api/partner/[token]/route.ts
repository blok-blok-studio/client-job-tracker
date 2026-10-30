import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { findRepByToken, partnerDeals, partnerPortalUrl, partnerLedgerRows, partnerPayoutRows } from "@/lib/partner-portal";
import { catalogSummary } from "@/lib/partner-catalog";
import { partnerLedgerTotals } from "@/lib/commissions";

// Public, token-scoped sales-partner portal.
// GET — who this link belongs to, the price list, their deals; admins also get
//       the rep roster and the commission statement.

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const rl = rateLimit(getClientIp(request), { max: 60, prefix: "partner-get" });
  if (!rl.allowed) {
    return NextResponse.json({ success: false, error: "Too many requests" }, { status: 429 });
  }

  const { token } = await params;
  const rep = await findRepByToken(token);
  if (!rep) {
    return NextResponse.json({ success: false, error: "Invalid link" }, { status: 404 });
  }
  const partner = rep.partner;

  const deals = await partnerDeals(partner.id, rep.isAdmin ? null : rep.id);

  const base = {
    rep: { id: rep.id, name: rep.name, isAdmin: rep.isAdmin, canClose: rep.canClose },
    partner: {
      name: partner.name,
      qualificationCriteria: partner.qualificationCriteria,
      bookingLink: partner.bookingLink,
    },
    catalog: catalogSummary(),
    deals,
  };

  if (!rep.isAdmin) {
    return NextResponse.json({ success: true, data: base });
  }

  const [reps, commissions, payouts, totals] = await Promise.all([
    prisma.partnerRep.findMany({
      where: { partnerId: partner.id },
      orderBy: [{ isAdmin: "desc" }, { createdAt: "asc" }],
    }),
    partnerLedgerRows(partner.id, null, 500),
    partnerPayoutRows(partner.id),
    partnerLedgerTotals(partner.id),
  ]);

  return NextResponse.json({
    success: true,
    data: {
      ...base,
      partner: {
        ...base.partner,
        connectOnboarded: partner.connectOnboarded,
        w9ReceivedAt: partner.w9ReceivedAt,
        rates: {
          projectHandoff: Number(partner.rateProjectHandoff),
          projectClose: Number(partner.rateProjectClose),
          brandGuideHandoff: Number(partner.rateBrandGuideHandoff),
          brandGuideClose: Number(partner.rateBrandGuideClose),
          plan: Number(partner.ratePlan),
          planMonths: partner.planMonths,
          payoutDays: partner.payoutDays,
        },
      },
      reps: reps.map((r) => ({
        id: r.id,
        name: r.name,
        email: r.email,
        isAdmin: r.isAdmin,
        canClose: r.canClose,
        isActive: r.isActive,
        createdAt: r.createdAt,
        portalUrl: partnerPortalUrl(r.token),
      })),
      commissions,
      payouts,
      totals,
    },
  });
}
