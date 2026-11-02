import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireOwner, handleError } from "../../_shared";
import { importBankCsv } from "@/lib/invoicing/reconcile";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const schema = z.object({ csv: z.string().min(10).max(3_000_000), defaultCurrency: z.string().length(3).toUpperCase().optional() });

// POST { csv } — import a bank / Wise statement export and match credits to invoices
export async function POST(request: NextRequest) {
  const { session, denied } = await requireOwner();
  if (denied || !session) return denied;
  try {
    const { csv, defaultCurrency } = schema.parse(await request.json());
    const result = await importBankCsv(csv, session.name, defaultCurrency || "EUR");
    if (result.error) return NextResponse.json({ success: false, error: result.error, data: result }, { status: 422 });
    return NextResponse.json({ success: true, data: result });
  } catch (err) {
    return handleError(err, "Import failed");
  }
}
