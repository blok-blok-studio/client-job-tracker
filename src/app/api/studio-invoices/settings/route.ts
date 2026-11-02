import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireOwner, handleError } from "../_shared";
import { loadInvoiceSettings, saveInvoiceSettings, settingsWarnings, missingBankFields } from "@/lib/invoicing/settings";

export const dynamic = "force-dynamic";

export async function GET() {
  const { denied } = await requireOwner();
  if (denied) return denied;
  try {
    const settings = await loadInvoiceSettings();
    return NextResponse.json({ success: true, data: settings, warnings: settingsWarnings(settings), missingBank: { EUR: missingBankFields(settings, "EUR"), USD: missingBankFields(settings, "USD") } });
  } catch (err) {
    return handleError(err, "Failed to load settings");
  }
}

export async function PUT(request: NextRequest) {
  const { session, denied } = await requireOwner();
  if (denied || !session) return denied;
  try {
    const body = await request.json();
    const settings = await saveInvoiceSettings(body, session.name);
    await prisma.activityLog.create({ data: { actor: session.name, action: "invoice_settings_updated", details: "Invoice settings updated" } }).catch(() => {});
    return NextResponse.json({ success: true, data: settings, warnings: settingsWarnings(settings), missingBank: { EUR: missingBankFields(settings, "EUR"), USD: missingBankFields(settings, "USD") } });
  } catch (err) {
    return handleError(err, "Failed to save settings");
  }
}
