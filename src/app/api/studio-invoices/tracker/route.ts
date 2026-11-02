import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireOwner, handleError } from "../_shared";
import { costRows, summarizeYears, trackerRows } from "@/lib/invoicing/tracker";
import { getSetting } from "@/lib/lifecycle/settings";

export const dynamic = "force-dynamic";

// GET ?year= &clientId= — year totals, the money list, money out, last Stripe sync. Owner only.
export async function GET(request: NextRequest) {
  const { denied } = await requireOwner();
  if (denied) return denied;
  try {
    const sp = new URL(request.url).searchParams;
    const clientId = sp.get("clientId");
    const year = Number(sp.get("year")) || null;
    const rows = await trackerRows({ clientId });
    const costs = clientId ? [] : await costRows();
    const years = summarizeYears(rows, costs);
    const lastSync = await getSetting<unknown>("stripe_ledger_last_sync", null);
    const unmatched = clientId ? 0 : await prisma.stripePayment.count({ where: { clientId: null } });
    return NextResponse.json({
      success: true,
      data: { years, rows: year ? rows.filter((r) => r.year === year) : rows, costs: year ? costs.filter((c) => c.year === year) : costs, lastSync, unmatched },
    });
  } catch (err) {
    return handleError(err, "Failed to load the tracker");
  }
}
