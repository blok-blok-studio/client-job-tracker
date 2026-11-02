import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { findRepByToken } from "@/lib/partner-portal";
import { savePayoutDetails } from "@/lib/partner-payout";

export const dynamic = "force-dynamic";

const schema = z.object({
  accountHolder: z.string().trim().min(2).max(120),
  bankName: z.string().trim().min(2).max(120),
  routingNumber: z.string().trim().regex(/^\d{9}$/, "Routing numbers have 9 digits"),
  accountNumber: z.string().trim().regex(/^\d{4,17}$/, "Check the account number"),
  accountType: z.enum(["checking", "savings"]),
  address: z.string().trim().min(5).max(300),
});

// PUT — partner admin saves payout details. Write-only: the portal never reads
// them back, so a leaked link cannot show them. A change blocks payouts until
// the owner confirms it.
export async function PUT(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const rl = rateLimit(getClientIp(request), { max: 10, prefix: "partner-payout-details" });
  if (!rl.allowed) return NextResponse.json({ success: false, error: "Too many requests" }, { status: 429 });
  const { token } = await params;
  const rep = await findRepByToken(token);
  if (!rep) return NextResponse.json({ success: false, error: "Invalid link" }, { status: 404 });
  if (!rep.isAdmin) return NextResponse.json({ success: false, error: "Only the partner admin can change payout details" }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ success: false, error: parsed.error.issues[0]?.message || "Check the fields" }, { status: 400 });
  await savePayoutDetails(rep.partnerId, parsed.data, `partner:${rep.name}`);
  return NextResponse.json({ success: true, data: { last4: parsed.data.accountNumber.slice(-4) } });
}
