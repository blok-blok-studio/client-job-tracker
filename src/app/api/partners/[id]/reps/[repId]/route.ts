import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { partnerPortalUrl } from "@/lib/partner-portal";

const patchSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  email: z.string().email().max(254).nullable().optional(),
  isAdmin: z.boolean().optional(),
  canClose: z.boolean().optional(),
  isActive: z.boolean().optional(),
  /** Issue a fresh portal link (the old one stops working) */
  rotateToken: z.boolean().optional(),
});

// PATCH — approve as closer, make admin, deactivate, or rotate the link
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; repId: string }> }
) {
  const session = await getSession();
  if (session?.role !== "OWNER") {
    return NextResponse.json({ success: false, error: "Owner only" }, { status: 403 });
  }
  const { id, repId } = await params;
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: "Invalid input" }, { status: 400 });
  }
  const d = parsed.data;

  const rep = await prisma.partnerRep.findFirst({
    where: { id: repId, partnerId: id },
    include: { partner: { select: { name: true } } },
  });
  if (!rep) {
    return NextResponse.json({ success: false, error: "Rep not found" }, { status: 404 });
  }

  const updated = await prisma.partnerRep.update({
    where: { id: rep.id },
    data: {
      ...(d.name !== undefined ? { name: d.name.trim() } : {}),
      ...(d.email !== undefined ? { email: d.email?.trim().toLowerCase() || null } : {}),
      ...(d.isAdmin !== undefined ? { isAdmin: d.isAdmin } : {}),
      ...(d.canClose !== undefined ? { canClose: d.canClose } : {}),
      ...(d.isActive !== undefined ? { isActive: d.isActive } : {}),
      ...(d.rotateToken ? { token: randomBytes(18).toString("base64url") } : {}),
    },
  });

  const changes: string[] = [];
  if (d.canClose !== undefined) changes.push(d.canClose ? "approved as closer" : "closer approval removed");
  if (d.isActive !== undefined) changes.push(d.isActive ? "reactivated" : "deactivated");
  if (d.isAdmin !== undefined) changes.push(d.isAdmin ? "made partner admin" : "admin removed");
  if (d.rotateToken) changes.push("portal link rotated");
  if (changes.length > 0) {
    await prisma.activityLog.create({
      data: {
        actor: session.name,
        action: "partner_rep_updated",
        details: `${rep.name} (${rep.partner.name}): ${changes.join(", ")}`,
      },
    });
  }

  return NextResponse.json({
    success: true,
    data: { id: updated.id, canClose: updated.canClose, isActive: updated.isActive, isAdmin: updated.isAdmin, portalUrl: partnerPortalUrl(updated.token) },
  });
}
