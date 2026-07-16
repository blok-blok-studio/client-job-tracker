import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { sendNewsletterEmail } from "@/lib/email";
import { unsubscribeSig } from "../unsubscribe/route";

export const maxDuration = 300;

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://blokblokstudio-clients.vercel.app";

function textToHtml(text: string): string {
  const esc = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return esc
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 16px">${p.replace(/\n/g, "<br/>")}</p>`)
    .join("");
}

// POST — broadcast a campaign to all active subscribers (owner only)
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "OWNER")
    return NextResponse.json({ error: "Only owners can send campaigns" }, { status: 403 });

  try {
    const body = await request.json();
    const { subject, message } = z
      .object({ subject: z.string().min(1).max(200), message: z.string().min(1).max(20000) })
      .parse(body);

    const subscribers = await prisma.newsletterSubscriber.findMany({
      where: { unsubscribedAt: null },
      select: { id: true, email: true },
    });

    if (subscribers.length === 0) {
      return NextResponse.json({ success: false, error: "No active subscribers" }, { status: 400 });
    }

    const bodyHtml = textToHtml(message);
    let sent = 0;
    const errors: string[] = [];

    for (const sub of subscribers) {
      try {
        await sendNewsletterEmail({
          to: sub.email,
          subject,
          bodyHtml,
          unsubscribeUrl: `${APP_URL}/api/newsletter/unsubscribe?id=${sub.id}&sig=${unsubscribeSig(sub.id)}`,
        });
        sent++;
        // Stay under Resend's rate limit
        await new Promise((r) => setTimeout(r, 600));
      } catch (err) {
        errors.push(`${sub.email}: ${err instanceof Error ? err.message : "failed"}`);
      }
    }

    await prisma.newsletterCampaign.create({
      data: { subject, body: message, sentBy: session.name, recipients: sent },
    });

    return NextResponse.json({ success: true, sent, failed: errors.length, errors: errors.slice(0, 5) });
  } catch {
    return NextResponse.json({ success: false, error: "Failed to send campaign" }, { status: 500 });
  }
}
