import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireOwner } from "@/app/api/studio-invoices/_shared";
import { autoDraftContract } from "@/lib/contract-autodraft";

export const maxDuration = 300;

// Owner-only deal terms that the automatic contract draft is written from.

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { denied } = await requireOwner();
  if (denied) return denied;
  const { id } = await params;
  const c = await prisma.client.findUnique({ where: { id }, select: { contractBrief: true, onboardedAt: true } });
  if (!c) return NextResponse.json({ success: false, error: "Client not found" }, { status: 404 });
  return NextResponse.json({ success: true, data: { brief: c.contractBrief || "", onboardedAt: c.onboardedAt } });
}

const putSchema = z.object({ brief: z.string().max(200000) });

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { session, denied } = await requireOwner();
  if (denied) return denied;
  const { id } = await params;
  const parsed = putSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ success: false, error: "Invalid deal terms" }, { status: 400 });
  const brief = parsed.data.brief.trim();
  await prisma.client.update({ where: { id }, data: { contractBrief: brief || null } });
  await prisma.activityLog.create({
    data: { clientId: id, actor: session!.name, action: "contract_brief_saved", details: brief ? "Deal terms saved for the automatic contract draft" : "Deal terms cleared" },
  });
  return NextResponse.json({ success: true });
}

// POST: draft the contract now from the saved terms (still a draft, nothing is sent)
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { session, denied } = await requireOwner();
  if (denied) return denied;
  const { id } = await params;
  const r = await autoDraftContract(id, { trigger: "manual", actor: session!.name, notify: false });
  return r.status === "drafted"
    ? NextResponse.json({ success: true, data: r })
    : NextResponse.json({ success: false, error: r.reason }, { status: 409 });
}
