import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { unsubscribeSig } from "@/lib/newsletter";

// PUBLIC — one-click unsubscribe from newsletter emails, signed so the
// subscriber id can't be enumerated.
export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");
  const sig = request.nextUrl.searchParams.get("sig");

  const page = (msg: string) =>
    new NextResponse(
      `<!doctype html><html><body style="font-family:-apple-system,sans-serif;background:#0A0A0A;color:#fff;display:flex;align-items:center;justify-content:center;height:100vh;margin:0"><div style="text-align:center"><h2 style="margin:0 0 8px">Blok Blok Studio</h2><p style="color:#A0A0A0">${msg}</p></div></body></html>`,
      { headers: { "Content-Type": "text/html" } }
    );

  if (!id || !sig || sig !== unsubscribeSig(id)) {
    return page("That unsubscribe link isn't valid.");
  }

  await prisma.newsletterSubscriber
    .update({ where: { id }, data: { unsubscribedAt: new Date() } })
    .catch(() => {});

  return page("You've been unsubscribed. Sorry to see you go!");
}

// Server-to-server suppression: blokblokstudio.com forwards its own
// unsubscribes here so someone who opts out on the site never lingers
// on this list. Authenticated with the shared lead-webhook secret.
export async function POST(request: NextRequest) {
  const secret = process.env.LEAD_WEBHOOK_SECRET;
  if (!secret || request.headers.get("x-webhook-secret") !== secret) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { email } = (await request.json()) as { email?: string };
    if (!email || typeof email !== "string") {
      return NextResponse.json({ success: false, error: "Missing email" }, { status: 400 });
    }
    await prisma.newsletterSubscriber
      .update({ where: { email: email.toLowerCase() }, data: { unsubscribedAt: new Date() } })
      .catch(() => {}); // not on the list — nothing to suppress
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ success: false, error: "Invalid payload" }, { status: 400 });
  }
}
