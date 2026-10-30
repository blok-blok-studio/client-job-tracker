import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { findRepByToken, partnerPortalUrl } from "@/lib/partner-portal";
import { notifySlack } from "@/lib/slack";

// The partner's admin manages their own roster: add reps (each gets a portal
// link) and switch them off. Closer approval (canClose) stays with Blok Blok.

const createSchema = z.object({
  name: z.string().min(1).max(120),
  email: z.string().email().max(254).optional().or(z.literal("")),
});

const patchSchema = z.object({
  repId: z.string().min(1),
  isActive: z.boolean(),
});

async function requireAdmin(request: NextRequest, token: string) {
  const rl = rateLimit(getClientIp(request), { max: 30, prefix: "partner-reps" });
  if (!rl.allowed) return { error: NextResponse.json({ success: false, error: "Too many requests" }, { status: 429 }) };
  const rep = await findRepByToken(token);
  if (!rep) return { error: NextResponse.json({ success: false, error: "Invalid link" }, { status: 404 }) };
  if (!rep.isAdmin) return { error: NextResponse.json({ success: false, error: "Only the partner admin can manage reps" }, { status: 403 }) };
  return { rep };
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const gate = await requireAdmin(request, token);
  if ("error" in gate) return gate.error;
  const admin = gate.rep;

  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: "A name is required" }, { status: 400 });
  }

  const rep = await prisma.partnerRep.create({
    data: {
      partnerId: admin.partnerId,
      name: parsed.data.name.trim(),
      email: parsed.data.email?.trim().toLowerCase() || null,
      token: randomBytes(18).toString("base64url"),
    },
    select: { id: true, name: true, email: true, token: true, isAdmin: true, canClose: true, isActive: true, createdAt: true },
  });

  await prisma.activityLog.create({
    data: {
      actor: "partner",
      action: "partner_rep_added",
      details: `${admin.name} (${admin.partner.name}) added rep ${rep.name}`,
    },
  });
  notifySlack(`:bust_in_silhouette: *${admin.partner.name}* added a new rep: *${rep.name}*. Approve them as a closer on the Partners page when ready.`).catch(() => {});

  let emailed = false;
  if (rep.email) {
    try {
      const { sendPartnerPortalEmail } = await import("@/lib/email");
      emailed = !!(await sendPartnerPortalEmail({
        to: rep.email,
        name: rep.name,
        partnerName: admin.partner.name,
        portalUrl: partnerPortalUrl(rep.token),
        isAdmin: false,
      }));
    } catch (err) {
      console.error("[partner/reps] portal email failed:", err);
    }
  }

  return NextResponse.json({
    success: true,
    data: { ...rep, token: undefined, portalUrl: partnerPortalUrl(rep.token), emailed },
  });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const gate = await requireAdmin(request, token);
  if ("error" in gate) return gate.error;
  const admin = gate.rep;

  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: "Invalid input" }, { status: 400 });
  }
  if (parsed.data.repId === admin.id) {
    return NextResponse.json({ success: false, error: "You cannot deactivate your own link" }, { status: 400 });
  }

  const target = await prisma.partnerRep.findFirst({
    where: { id: parsed.data.repId, partnerId: admin.partnerId },
    select: { id: true, name: true },
  });
  if (!target) {
    return NextResponse.json({ success: false, error: "Rep not found" }, { status: 404 });
  }

  await prisma.partnerRep.update({ where: { id: target.id }, data: { isActive: parsed.data.isActive } });
  await prisma.activityLog.create({
    data: {
      actor: "partner",
      action: parsed.data.isActive ? "partner_rep_reactivated" : "partner_rep_deactivated",
      details: `${admin.name} (${admin.partner.name}) ${parsed.data.isActive ? "reactivated" : "deactivated"} rep ${target.name}`,
    },
  });

  return NextResponse.json({ success: true });
}
