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
    if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ success: false, error: "Invalid settings" }, { status: 400 });
    // Partial updates must never wipe the rest (a toggle alone used to erase the bank details)
    const current = await loadInvoiceSettings();
    const merged = {
      ...current,
      ...body,
      eur: { ...current.eur, ...(body.eur && typeof body.eur === "object" ? body.eur : {}) },
      usd: { ...current.usd, ...(body.usd && typeof body.usd === "object" ? body.usd : {}) },
    };
    const settings = await saveInvoiceSettings(merged, session.name);
    await prisma.activityLog.create({ data: { actor: session.name, action: "invoice_settings_updated", details: "Invoice settings updated" } }).catch(() => {});
    return NextResponse.json({ success: true, data: settings, warnings: settingsWarnings(settings), missingBank: { EUR: missingBankFields(settings, "EUR"), USD: missingBankFields(settings, "USD") } });
  } catch (err) {
    return handleError(err, "Failed to save settings");
  }
}
