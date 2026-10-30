import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { renderPartnerKit } from "@/lib/partner-kit";

// GET — the partner kit PDF (owner download)
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (session?.role !== "OWNER") {
    return NextResponse.json({ success: false, error: "Owner only" }, { status: 403 });
  }
  const { id } = await params;
  const partner = await prisma.partner.findUnique({ where: { id }, select: { name: true } });
  if (!partner) {
    return NextResponse.json({ success: false, error: "Partner not found" }, { status: 404 });
  }
  try {
    const bytes = await renderPartnerKit(id);
    const slug = partner.name.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "partner";
    return new NextResponse(Buffer.from(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="blok-blok-partner-kit-${slug}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("[partners/kit] render failed:", err);
    return NextResponse.json({ success: false, error: "Could not render the kit" }, { status: 500 });
  }
}
