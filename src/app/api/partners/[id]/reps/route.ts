import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { partnerPortalUrl } from "@/lib/partner-portal";

const createSchema = z.object({
  name: z.string().min(1).max(120),
  email: z.string().email().max(254).optional().or(z.literal("")),
  isAdmin: z.boolean().optional().default(false),
  canClose: z.boolean().optional().default(false),
});

// POST — owner adds a rep to a partner (the partner's admin can also do this from the portal)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (session?.role !== "OWNER") {
    return NextResponse.json({ success: false, error: "Owner only" }, { status: 403 });
  }
  const { id } = await params;
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: "A name is required" }, { status: 400 });
  }
  const partner = await prisma.partner.findUnique({ where: { id }, select: { id: true, name: true } });
  if (!partner) {
    return NextResponse.json({ success: false, error: "Partner not found" }, { status: 404 });
  }
  const rep = await prisma.partnerRep.create({
    data: {
      partnerId: id,
      name: parsed.data.name.trim(),
      email: parsed.data.email?.trim().toLowerCase() || null,
      isAdmin: parsed.data.isAdmin,
      canClose: parsed.data.canClose,
      token: randomBytes(18).toString("base64url"),
    },
  });
  await prisma.activityLog.create({
    data: { actor: session.name, action: "partner_rep_added", details: `Added rep ${rep.name} to ${partner.name}` },
  });
  return NextResponse.json({
    success: true,
    data: { id: rep.id, name: rep.name, portalUrl: partnerPortalUrl(rep.token) },
  });
}
