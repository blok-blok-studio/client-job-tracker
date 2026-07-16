import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import prisma from "@/lib/prisma";

export function unsubscribeSig(id: string): string {
  return crypto
    .createHmac("sha256", process.env.AUTH_SECRET || "")
    .update(id)
    .digest("hex")
    .slice(0, 16);
}

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
