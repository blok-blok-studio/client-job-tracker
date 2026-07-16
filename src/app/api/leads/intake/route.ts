import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";

// Server-to-server lead intake for blokblokstudio.com (strategy call funnel +
// contact form). Authenticated with a shared secret header, not a session.
// Creates a PROSPECT client, or appends the inquiry to an existing client's
// notes without touching their type/tier.
//
// Example: fetch("https://blokblokstudio-clients.vercel.app/api/leads/intake",
//   { method: "POST",
//     headers: { "Content-Type": "application/json", "X-Webhook-Secret": secret },
//     body: JSON.stringify({ source: "funnel", name, email, business, summary }) })

const leadSchema = z.object({
  source: z.string().max(50),
  name: z.string().min(1).max(120),
  email: z.string().email().max(254),
  phone: z.string().max(40).optional(),
  business: z.string().max(120).optional(),
  website: z.string().max(300).nullable().optional(),
  summary: z.string().max(5000).optional(),
});

export async function POST(request: NextRequest) {
  const secret = process.env.LEAD_WEBHOOK_SECRET;
  if (!secret) {
    console.error("LEAD_WEBHOOK_SECRET is not set");
    return NextResponse.json({ success: false, error: "Not configured" }, { status: 503 });
  }
  if (request.headers.get("x-webhook-secret") !== secret) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0] || "unknown";
  const rl = rateLimit(ip, { max: 30, prefix: "leads-intake" });
  if (!rl.allowed) {
    return NextResponse.json({ success: false, error: "Too many attempts" }, { status: 429 });
  }

  try {
    const lead = leadSchema.parse(await request.json());
    const email = lead.email.toLowerCase();

    const stamp = new Date().toISOString().slice(0, 16).replace("T", " ");
    const inquiry = [
      `[${stamp} UTC] Inquiry via ${lead.source}`,
      lead.business ? `Business: ${lead.business}` : null,
      lead.website ? `Website: ${lead.website}` : null,
      lead.summary || null,
    ]
      .filter(Boolean)
      .join("\n");

    const existing = await prisma.client.findFirst({ where: { email } });

    if (existing) {
      await prisma.client.update({
        where: { id: existing.id },
        data: {
          notes: existing.notes ? `${existing.notes}\n\n${inquiry}` : inquiry,
          industry: existing.industry || lead.business || null,
          phone: existing.phone || lead.phone || null,
        },
      });
      return NextResponse.json({ success: true, clientId: existing.id, created: false });
    }

    const client = await prisma.client.create({
      data: {
        name: lead.name.trim(),
        email,
        phone: lead.phone || null,
        type: "PROSPECT",
        source: lead.source,
        industry: lead.business || null,
        notes: inquiry,
      },
    });

    return NextResponse.json({ success: true, clientId: client.id, created: true });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: "Invalid payload" }, { status: 400 });
    }
    console.error("[leads/intake] error:", err);
    return NextResponse.json({ success: false, error: "Server error" }, { status: 500 });
  }
}
