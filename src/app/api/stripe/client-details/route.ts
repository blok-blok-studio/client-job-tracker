import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireOwner, handleError } from "@/app/api/studio-invoices/_shared";
import { importClientDetails } from "@/lib/invoicing/client-details-import";

const schema = z.object({ text: z.string().min(20).max(1_000_000) });

// POST { text } — client contact details CSV from the Stripe migration. Owner only; fills empty fields only.
export async function POST(request: NextRequest) {
  const { session, denied } = await requireOwner();
  if (denied || !session) return denied;
  try {
    const { text } = schema.parse(await request.json());
    return NextResponse.json({ success: true, data: await importClientDetails(text, session.name) });
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("Expected columns")) return NextResponse.json({ success: false, error: err.message }, { status: 400 });
    return handleError(err, "Import failed");
  }
}
