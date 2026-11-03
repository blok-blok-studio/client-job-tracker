import { NextRequest, NextResponse } from "next/server";
import { requireOwner, handleError } from "../_shared";
import { buildAnalytics } from "@/lib/invoicing/analytics";

export const dynamic = "force-dynamic";

// GET ?year= — income charts rebuilt from our own records. Owner only; omit year for all time.
export async function GET(request: NextRequest) {
  const { denied } = await requireOwner();
  if (denied) return denied;
  try {
    const y = Number(new URL(request.url).searchParams.get("year"));
    return NextResponse.json({ success: true, data: await buildAnalytics(Number.isInteger(y) && y > 2000 ? y : null) });
  } catch (err) {
    return handleError(err, "Failed to load analytics");
  }
}
