import prisma from "@/lib/prisma";

/**
 * Extra people who get a copy (CC) of a client's invoice emails, on top of the
 * bill-to email: client contacts with "Gets invoices" switched on, e.g. the
 * finance person when the day-to-day contact is someone else.
 */
export async function invoiceCcFor(clientId: string, primary: string | null | undefined): Promise<string[]> {
  const contacts = await prisma.contact.findMany({
    where: { clientId, receivesInvoices: true, email: { not: null } },
    select: { email: true },
    orderBy: { createdAt: "asc" },
  });
  return cleanCc(contacts.map((c) => c.email || ""), primary);
}

/** Trim, drop blanks + the main recipient, dedupe case-insensitively, cap at 10. */
export function cleanCc(list: string[], primary: string | null | undefined): string[] {
  const seen = new Set<string>([(primary || "").trim().toLowerCase()]);
  const out: string[] = [];
  for (const raw of list) {
    const e = raw.trim();
    const key = e.toLowerCase();
    if (!e || seen.has(key)) continue;
    seen.add(key);
    out.push(e);
  }
  return out.slice(0, 10);
}
