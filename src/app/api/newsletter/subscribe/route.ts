import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";

// PUBLIC endpoint — embeddable signup for blokblokstudio.com and client sites.
// Example: fetch("https://blokblokstudio-clients.vercel.app/api/newsletter/subscribe",
//   { method: "POST", headers: {"Content-Type":"application/json"},
//     body: JSON.stringify({ email, source: "website" }) })
export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0] || "unknown";
  const rl = rateLimit(ip, { max: 5, prefix: "newsletter-subscribe" });
  if (!rl.allowed) {
    return NextResponse.json({ success: false, error: "Too many attempts" }, { status: 429 });
  }

  try {
    const body = await request.json();
    const { email, name, source, website } = z
      .object({
        email: z.string().email().max(254),
        name: z.string().max(120).optional(),
        source: z.string().max(50).optional(),
        website: z.string().optional(), // honeypot — bots fill it, humans never see it
      })
      .parse(body);

    // Honeypot tripped: pretend success, store nothing
    if (website) return NextResponse.json({ success: true });

    await prisma.newsletterSubscriber.upsert({
      where: { email: email.toLowerCase() },
      update: { unsubscribedAt: null },
      create: {
        email: email.toLowerCase(),
        name: name?.trim() || null,
        source: source?.trim() || "website",
      },
    });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ success: false, error: "Invalid email" }, { status: 400 });
  }
}
