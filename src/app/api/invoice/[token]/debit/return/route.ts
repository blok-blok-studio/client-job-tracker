import { NextRequest, NextResponse } from "next/server";
import { finishMandate } from "@/lib/invoicing/direct-debit";
import { appUrl } from "@/lib/invoicing/view";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const sessionId = new URL(request.url).searchParams.get("session_id");
  if (!/^[\w-]{16,64}$/.test(token) || !sessionId) return NextResponse.redirect(`${appUrl()}/`, 303);
  try {
    await finishMandate(token, sessionId);
    return NextResponse.redirect(`${appUrl()}/b/${token}?debit=ok`, 303);
  } catch (err) {
    console.error("[invoice/debit/return]", err instanceof Error ? err.message : err);
    return NextResponse.redirect(`${appUrl()}/b/${token}?debit=failed`, 303);
  }
}
