import { NextRequest, NextResponse } from "next/server";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { findRepByToken } from "@/lib/partner-portal";
import { renderPartnerKit } from "@/lib/partner-kit";

// GET — the kit PDF from inside the portal (any active rep)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const rl = rateLimit(getClientIp(request), { max: 10, prefix: "partner-kit" });
  if (!rl.allowed) {
    return NextResponse.json({ success: false, error: "Too many requests" }, { status: 429 });
  }
  const { token } = await params;
  const rep = await findRepByToken(token);
  if (!rep) {
    return NextResponse.json({ success: false, error: "Invalid link" }, { status: 404 });
  }
  try {
    const bytes = await renderPartnerKit(rep.partnerId);
    return new NextResponse(Buffer.from(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="blok-blok-partner-kit.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("[partner/kit] render failed:", err);
    return NextResponse.json({ success: false, error: "Could not render the kit" }, { status: 500 });
  }
}
