import { getSetting, setSetting } from "@/lib/lifecycle/settings";
import { INVOICE_SETTINGS_KEY, normalizeInvoiceSettings, type InvoiceSettings } from "./settings-core";

// Server side only (Prisma). Client components import "./settings-core".
export * from "./settings-core";

export async function loadInvoiceSettings(): Promise<InvoiceSettings> {
  const raw = await getSetting<unknown>(INVOICE_SETTINGS_KEY, null);
  return normalizeInvoiceSettings(raw);
}

export async function saveInvoiceSettings(next: unknown, updatedBy: string): Promise<InvoiceSettings> {
  const normalized = normalizeInvoiceSettings(next);
  await setSetting(INVOICE_SETTINGS_KEY, normalized, updatedBy);
  return normalized;
}
