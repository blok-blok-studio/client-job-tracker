import prisma from "@/lib/prisma";
import { parseCsv } from "./stripe-ledger-import";

/**
 * One-time import of client contact details taken from Stripe (email, phone,
 * billing address, tax ID). Matches by client email, then by the client the
 * payments from that email are linked to. Only empty fields are filled; nothing
 * already in the portal is overwritten.
 */
export interface DetailsImportResult {
  rows: number;
  updated: Array<{ client: string; filled: string[] }>;
  unchanged: number;
  unmatched: string[];
}

export async function importClientDetails(text: string, actor: string): Promise<DetailsImportResult> {
  const rows = parseCsv(text);
  if (!rows.length || !("email" in rows[0]) || !("line1" in rows[0])) throw new Error("Expected columns: email,name,phone,line1,line2,city,state,zip,country,taxId");
  const res: DetailsImportResult = { rows: rows.length, updated: [], unchanged: 0, unmatched: [] };
  const seen = new Set<string>();
  for (const r of rows) {
    const email = (r.email || "").toLowerCase();
    if (!email) continue;
    let client = await prisma.client.findFirst({ where: { email: { equals: email, mode: "insensitive" }, type: { not: "ARCHIVED" } } });
    if (!client) {
      const linked = await prisma.stripePayment.findMany({ where: { billingEmail: { equals: email, mode: "insensitive" }, clientId: { not: null } }, select: { clientId: true } });
      const counts = new Map<string, number>();
      for (const p of linked) if (p.clientId) counts.set(p.clientId, (counts.get(p.clientId) || 0) + 1);
      const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
      if (top) client = await prisma.client.findUnique({ where: { id: top } });
    }
    if (!client) { res.unmatched.push(email); continue; }
    const fresh = seen.has(client.id) ? await prisma.client.findUnique({ where: { id: client.id } }) : client;
    if (!fresh) continue;
    seen.add(client.id);
    const street = [r.line1, r.line2].filter(Boolean).join(", ");
    const want: Record<string, string> = { phone: r.phone, companyAddress: street, companyCity: r.city, companyState: r.state, companyZip: r.zip, companyCountry: r.country, taxId: r.taxId };
    const patch: Record<string, string> = {};
    for (const [k, v] of Object.entries(want)) {
      const cur = (fresh as unknown as Record<string, unknown>)[k];
      if (v && v !== "—" && (cur == null || cur === "")) patch[k] = v;
    }
    if (!Object.keys(patch).length) { res.unchanged++; continue; }
    await prisma.client.update({ where: { id: fresh.id }, data: patch });
    await prisma.activityLog.create({ data: { clientId: fresh.id, actor, action: "client_details_imported", details: `Filled from Stripe: ${Object.keys(patch).join(", ")}` } }).catch(() => {});
    res.updated.push({ client: fresh.company || fresh.name, filled: Object.keys(patch) });
  }
  return res;
}
