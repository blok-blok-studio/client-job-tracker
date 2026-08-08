import prisma from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

/**
 * Lifecycle settings live in the Setting key-value table so a moderator can
 * change them in the portal without code changes.
 *
 * Keys:
 *  - booking_link           string  — studio calendar URL merged into emails
 *  - asset_checklist_link   string  — fallback content-checklist URL (client upload portal wins)
 *  - lifecycle_live_emails  boolean — MASTER SWITCH. false = every sequence email is
 *                                     recorded as a dry run, nothing reaches Resend.
 *  - tier_constants         object  — owner-editable overrides of DEFAULT_TIER_CONSTANTS
 */

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const row = await prisma.setting.findUnique({ where: { key } });
  if (!row) return fallback;
  return row.value as T;
}

export async function setSetting(key: string, value: unknown, updatedBy: string) {
  await prisma.setting.upsert({
    where: { key },
    create: { key, value: value as Prisma.InputJsonValue, updatedBy },
    update: { value: value as Prisma.InputJsonValue, updatedBy },
  });
}

/** True only when the owner has explicitly enabled real outbound sends. */
export async function liveEmailsEnabled(): Promise<boolean> {
  return (await getSetting<boolean>("lifecycle_live_emails", false)) === true;
}
