import { getSetting, setSetting } from "@/lib/lifecycle/settings";
import { INVOICE_SETTINGS_KEY, normalizeInvoiceSettings, type InvoiceSettings } from "./settings-core";
import { openBank, sealBank } from "./bank-vault";

// Server side only (Prisma + encryption). Client components import "./settings-core".
export * from "./settings-core";

/** Stored shape: the normalized settings with eur/usd replaced by an encrypted bankVault. */
type StoredSettings = Omit<InvoiceSettings, "eur" | "usd" | "otherBanks"> & { eur?: InvoiceSettings["eur"] | null; usd?: InvoiceSettings["usd"] | null; otherBanks?: InvoiceSettings["otherBanks"] | null; bankVault?: { encrypted: string; iv: string } | null };

export async function loadInvoiceSettings(): Promise<InvoiceSettings> {
  const raw = await getSetting<StoredSettings | null>(INVOICE_SETTINGS_KEY, null);
  if (!raw) return normalizeInvoiceSettings(null);
  const opened = openBank(raw);
  return normalizeInvoiceSettings({ ...opened, eur: opened.eur, usd: opened.usd, otherBanks: opened.otherBanks ?? [] });
}

export async function saveInvoiceSettings(next: unknown, updatedBy: string): Promise<InvoiceSettings> {
  const normalized = normalizeInvoiceSettings(next);
  const sealed = sealBank<StoredSettings>({ ...normalized });
  await setSetting(INVOICE_SETTINGS_KEY, sealed, updatedBy);
  return normalized;
}
