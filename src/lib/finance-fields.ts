import { getSession } from "@/lib/auth";

/**
 * Client money fields are owner-only. Every route that returns client rows to
 * the team strips these for non-owners so retainers/prices never reach a
 * member's browser — the UI hides the fields when they come back null.
 */
const CLIENT_FINANCE_FIELDS = [
  "monthlyRetainer",
  "projectPrice",
  "depositReceived",
  "projectBalance",
] as const;

export function stripClientFinance<T extends Record<string, unknown>>(client: T): T {
  const copy: Record<string, unknown> = { ...client };
  for (const field of CLIENT_FINANCE_FIELDS) {
    if (field in copy) copy[field] = null;
  }
  return copy as T;
}

export async function sessionIsOwner(): Promise<boolean> {
  const session = await getSession();
  return session?.role === "OWNER";
}

/**
 * Activity-log entries whose details carry dollar amounts (invoice sync,
 * payment links, subscription changes, retainer updates, contractor
 * invoices). Matched by action name so new money actions stay covered as long
 * as they keep the naming convention.
 */
export function isMoneyAction(action: string): boolean {
  return /invoice|payment|subscription|retainer/i.test(action);
}
