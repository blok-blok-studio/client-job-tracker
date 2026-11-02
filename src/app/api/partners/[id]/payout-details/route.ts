import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireOwner } from "@/app/api/studio-invoices/_shared";
import { readPayoutDetails } from "@/lib/partner-payout";

export const dynamic = "force-dynamic";

// GET — decrypted bank details for paying in Wise. Owner only, every read logged.
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { session, denied } = await requireOwner();
  if (denied || !session) return denied;
  const { id } = await params;
  const partner = await prisma.partner.findUnique({ where: { id }, select: { payoutVault: true, name: true } });
  if (!partner) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  await prisma.activityLog.create({ data: { actor: session.name, action: "partner_payout_details_viewed", details: `Payout bank details viewed for ${partner.name}` } }).catch(() => {});
  return NextResponse.json({ success: true, data: readPayoutDetails(partner.payoutVault) }, { headers: { "Cache-Control": "no-store" } });
}

// POST — the owner confirmed these details with the partner directly
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { session, denied } = await requireOwner();
  if (denied || !session) return denied;
  const { id } = await params;
  const partner = await prisma.partner.findUnique({ where: { id }, select: { payoutVault: true, name: true } });
  if (!partner?.payoutVault) return NextResponse.json({ success: false, error: "No bank details on file" }, { status: 400 });
  await prisma.partner.update({ where: { id }, data: { payoutDetailsVerifiedAt: new Date() } });
  await prisma.activityLog.create({ data: { actor: session.name, action: "partner_payout_details_confirmed", details: `Payout bank details confirmed for ${partner.name}` } }).catch(() => {});
  return NextResponse.json({ success: true });
}
