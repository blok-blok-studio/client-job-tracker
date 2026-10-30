import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { findRepByToken } from "@/lib/partner-portal";
import { notifySlackLead } from "@/lib/slack";

// POST — a partner rep registers a practice. First registered wins: a practice
// we already know (any client or prospect with that email, or the same
// company name) is refused so attribution can never be disputed later.

const schema = z.object({
  name: z.string().min(1).max(120),
  email: z.string().email().max(254),
  phone: z.string().max(40).optional().or(z.literal("")),
  company: z.string().max(120).optional().or(z.literal("")),
  website: z.string().max(300).optional().or(z.literal("")),
  notes: z.string().max(3000).optional().or(z.literal("")),
});

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://blokblokstudio-clients.vercel.app";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const rl = rateLimit(getClientIp(request), { max: 30, prefix: "partner-register" });
  if (!rl.allowed) {
    return NextResponse.json({ success: false, error: "Too many requests" }, { status: 429 });
  }

  const { token } = await params;
  const rep = await findRepByToken(token);
  if (!rep) {
    return NextResponse.json({ success: false, error: "Invalid link" }, { status: 404 });
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: "Please fill in a name and a valid email" }, { status: 400 });
  }
  const d = parsed.data;
  const email = d.email.toLowerCase().trim();
  const company = d.company?.trim() || null;

  // Known to us already? Then it is not a new introduction.
  const byEmail = await prisma.client.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
    select: { id: true, partnerRepId: true, partnerId: true },
  });
  const byCompany = company
    ? await prisma.client.findFirst({
        where: { company: { equals: company, mode: "insensitive" } },
        select: { id: true, partnerRepId: true, partnerId: true },
      })
    : null;
  const existing = byEmail || byCompany;
  if (existing) {
    const mine = existing.partnerRepId === rep.id;
    const theirs = existing.partnerId === rep.partnerId;
    return NextResponse.json(
      {
        success: false,
        error: mine
          ? "You already registered this practice."
          : theirs
          ? "Another rep on your team already registered this practice."
          : "This practice is already in Blok Blok's system, so it cannot be registered as a new introduction. Contact Chase if you believe this is a mistake.",
      },
      { status: 409 }
    );
  }

  const stamp = new Date().toISOString().slice(0, 16).replace("T", " ");
  const notes = [
    `[${stamp} UTC] Registered by ${rep.name} (${rep.partner.name})`,
    d.website ? `Website: ${d.website.trim()}` : null,
    d.notes?.trim() || null,
  ]
    .filter(Boolean)
    .join("\n");

  const client = await prisma.client.create({
    data: {
      name: d.name.trim(),
      email,
      phone: d.phone?.trim() || null,
      company,
      type: "PROSPECT",
      source: `Partner: ${rep.partner.name}`,
      country: rep.partner.country || "US",
      notes,
      partnerId: rep.partnerId,
      partnerRepId: rep.id,
      partnerRegisteredAt: new Date(),
    },
    select: { id: true, name: true },
  });

  await prisma.activityLog.create({
    data: {
      clientId: client.id,
      actor: "partner",
      action: "partner_registered",
      details: `${rep.name} (${rep.partner.name}) registered ${client.name}${company ? ` / ${company}` : ""}`,
    },
  });

  notifySlackLead(
    [
      `🤝 New partner registration via *${rep.partner.name}* (${rep.name}): *${client.name}*`,
      `${email}${d.phone ? ` · ${d.phone}` : ""}${company ? ` · ${company}` : ""}`,
      `${APP_URL}/clients/${client.id}`,
    ].join("\n")
  ).catch(() => {});

  return NextResponse.json({ success: true, data: { id: client.id } });
}
