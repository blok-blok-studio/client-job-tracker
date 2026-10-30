import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { partnerLedgerTotals } from "@/lib/commissions";
import { partnerPortalUrl } from "@/lib/partner-portal";

// Owner-only: partners carry commission rates and payout state.

export async function GET() {
  const session = await getSession();
  if (session?.role !== "OWNER") {
    return NextResponse.json({ success: false, error: "Owner only" }, { status: 403 });
  }
  const partners = await prisma.partner.findMany({ orderBy: { createdAt: "asc" } });
  const ids = partners.map((p) => p.id);
  const [repRows, clientRows] = await Promise.all([
    prisma.partnerRep.findMany({ where: { partnerId: { in: ids } }, select: { partnerId: true } }),
    prisma.client.findMany({ where: { partnerId: { in: ids } }, select: { partnerId: true } }),
  ]);
  const reps = new Map<string, number>();
  for (const r of repRows) reps.set(r.partnerId, (reps.get(r.partnerId) || 0) + 1);
  const clients = new Map<string, number>();
  for (const c of clientRows) if (c.partnerId) clients.set(c.partnerId, (clients.get(c.partnerId) || 0) + 1);

  const data = await Promise.all(
    partners.map(async (p) => ({
      id: p.id,
      name: p.name,
      legalName: p.legalName,
      contactName: p.contactName,
      email: p.email,
      isActive: p.isActive,
      connectOnboarded: p.connectOnboarded,
      w9ReceivedAt: p.w9ReceivedAt,
      reps: reps.get(p.id) || 0,
      clients: clients.get(p.id) || 0,
      totals: await partnerLedgerTotals(p.id),
      createdAt: p.createdAt,
    }))
  );
  return NextResponse.json({ success: true, data });
}

const createSchema = z.object({
  name: z.string().min(1).max(120),
  legalName: z.string().max(200).optional().or(z.literal("")),
  contactName: z.string().min(1).max(120),
  email: z.string().email().max(254).optional().or(z.literal("")),
  phone: z.string().max(40).optional().or(z.literal("")),
  country: z.string().length(2).optional().default("US"),
  notes: z.string().max(5000).optional().or(z.literal("")),
});

// POST — create a partner, its contractor record (for the agreement + W-9),
// and the admin rep link for the partner's owner.
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (session?.role !== "OWNER") {
    return NextResponse.json({ success: false, error: "Owner only" }, { status: 403 });
  }
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: parsed.error.issues[0]?.message || "Invalid input" }, { status: 400 });
  }
  const d = parsed.data;
  const country = d.country.toUpperCase();
  const email = d.email?.trim().toLowerCase() || null;

  const contractor = await prisma.contractor.create({
    data: {
      name: d.contactName.trim(),
      company: d.legalName?.trim() || d.name.trim(),
      email,
      phone: d.phone?.trim() || null,
      country,
      role: "Sales partner",
      notes: `Sales partner entity for ${d.name.trim()}. Agreement and tax forms live here; deals and commissions on the Partners page.`,
      uploadToken: randomBytes(16).toString("base64url"),
    },
  });

  // W-9 / signed agreement tracking rides on the contractor record
  {
    const { ensureRequiredDocs } = await import("@/lib/tax/documents");
    await ensureRequiredDocs({ kind: "contractor", id: contractor.id, country, actor: session.name }).catch(() => {});
  }

  const partner = await prisma.partner.create({
    data: {
      name: d.name.trim(),
      legalName: d.legalName?.trim() || null,
      contactName: d.contactName.trim(),
      email,
      phone: d.phone?.trim() || null,
      country,
      notes: d.notes?.trim() || null,
      contractorId: contractor.id,
    },
  });

  const adminRep = await prisma.partnerRep.create({
    data: {
      partnerId: partner.id,
      name: d.contactName.trim(),
      email,
      token: randomBytes(18).toString("base64url"),
      isAdmin: true,
    },
  });

  await prisma.activityLog.create({
    data: {
      actor: session.name,
      action: "partner_added",
      details: `Added sales partner ${partner.name} (${partner.contactName})`,
    },
  });

  // The admin gets their portal link straight away; nothing to copy by hand.
  let emailed = false;
  if (email) {
    try {
      const { sendPartnerPortalEmail } = await import("@/lib/email");
      emailed = !!(await sendPartnerPortalEmail({
        to: email,
        name: adminRep.name,
        partnerName: partner.name,
        portalUrl: partnerPortalUrl(adminRep.token),
        isAdmin: true,
      }));
    } catch (err) {
      console.error("[partners] portal email failed:", err);
    }
  }

  return NextResponse.json({
    success: true,
    data: { id: partner.id, adminPortalUrl: partnerPortalUrl(adminRep.token), emailed },
  });
}
