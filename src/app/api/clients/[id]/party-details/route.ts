import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireOwner } from "@/app/api/studio-invoices/_shared";
import { CLIENT_PARTY_SELECT, clientPartyBlock, missingPartyDetails, normalizeCountry } from "@/lib/client-party";

// The client's legal details as the contract will print them. Owner only,
// like contract drafting itself.

async function load(id: string) {
  const c = await prisma.client.findUnique({ where: { id }, select: { ...CLIENT_PARTY_SELECT, onboardToken: true } });
  if (!c) return null;
  return {
    details: {
      company: c.company,
      email: c.email,
      companyAddress: c.companyAddress,
      companyCity: c.companyCity,
      companyState: c.companyState,
      companyZip: c.companyZip,
      companyCountry: normalizeCountry(c.companyCountry),
      taxId: c.taxId,
      noTaxId: c.noTaxId,
    },
    missing: missingPartyDetails(c),
    block: clientPartyBlock(c),
    onboardedAt: c.onboardedAt,
    onboardLinkOpen: !!c.onboardToken,
  };
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { denied } = await requireOwner();
  if (denied) return denied;
  const { id } = await params;
  const data = await load(id);
  if (!data) return NextResponse.json({ success: false, error: "Client not found" }, { status: 404 });
  return NextResponse.json({ success: true, data });
}

const opt = (max: number) => z.string().trim().max(max).nullable().optional();
const schema = z.object({
  company: opt(200),
  email: z.string().trim().email("Enter a valid email").max(254).nullable().optional().or(z.literal("")),
  companyAddress: opt(500),
  companyCity: opt(100),
  companyState: opt(100),
  companyZip: opt(20),
  companyCountry: opt(2),
  taxId: opt(50),
  noTaxId: z.boolean().optional(),
});

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { denied } = await requireOwner();
  if (denied) return denied;
  const { id } = await params;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: parsed.error.issues[0]?.message || "Invalid details" }, { status: 400 });
  }
  const d = parsed.data;
  const clean = (v: string | null | undefined) => (v === undefined ? undefined : v && v.trim() ? v.trim() : null);
  const data: Record<string, unknown> = {
    company: clean(d.company),
    email: clean(d.email || null),
    companyAddress: clean(d.companyAddress),
    companyCity: clean(d.companyCity),
    companyState: clean(d.companyState),
    companyZip: clean(d.companyZip),
    companyCountry: d.companyCountry === undefined ? undefined : normalizeCountry(d.companyCountry),
    taxId: clean(d.taxId),
  };
  if (d.noTaxId !== undefined) data.noTaxId = d.noTaxId && !clean(d.taxId);
  for (const k of Object.keys(data)) if (data[k] === undefined) delete data[k];
  // A contact's email is the one field we never blank out from here
  if (data.email === null) delete data.email;

  const exists = await prisma.client.findUnique({ where: { id }, select: { id: true } });
  if (!exists) return NextResponse.json({ success: false, error: "Client not found" }, { status: 404 });
  await prisma.client.update({ where: { id }, data });
  return NextResponse.json({ success: true, data: await load(id) });
}
