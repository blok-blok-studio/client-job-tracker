import { NextRequest, NextResponse } from "next/server";
import { requireOwner, handleError } from "../_shared";
import { prepareForClient } from "@/lib/invoicing/service";

export const dynamic = "force-dynamic";

// GET ?clientId= — template, currency, bill-to and VAT preview for the new-invoice form
export async function GET(request: NextRequest) {
  const { denied } = await requireOwner();
  if (denied) return denied;
  try {
    const clientId = new URL(request.url).searchParams.get("clientId");
    if (!clientId) return NextResponse.json({ success: false, error: "clientId required" }, { status: 400 });
    const data = await prepareForClient(clientId);
    return NextResponse.json({ success: true, data });
  } catch (err) {
    return handleError(err, "Failed to prepare invoice");
  }
}
