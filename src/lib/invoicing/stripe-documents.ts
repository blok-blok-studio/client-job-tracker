import prisma from "@/lib/prisma";
import { parseCsv } from "./stripe-ledger-import";

/**
 * Stripe's invoices, kept for the books after leaving Stripe. The register comes
 * from the dashboard's invoice export; each PDF is attached by invoice number.
 * Drafts are skipped: they were never issued.
 */
const utc = (s: string) => (s ? new Date(`${s.replace(" ", "T")}${s.length <= 16 ? ":00" : ""}Z`) : null);

async function clientFor(email: string, name?: string): Promise<string | null> {
  // A customer billed under another email still carries the client's exact name
  if (!email) return name ? ((await prisma.client.findFirst({ where: { OR: [{ company: { equals: name, mode: "insensitive" } }, { name: { equals: name, mode: "insensitive" } }] }, select: { id: true } }))?.id ?? null) : null;
  const direct = await prisma.client.findFirst({ where: { email: { equals: email, mode: "insensitive" } }, select: { id: true } });
  if (direct) return direct.id;
  const linked = await prisma.stripePayment.findMany({ where: { billingEmail: { equals: email, mode: "insensitive" }, clientId: { not: null } }, select: { clientId: true } });
  const counts = new Map<string, number>();
  for (const p of linked) if (p.clientId) counts.set(p.clientId, (counts.get(p.clientId) || 0) + 1);
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  if (top) return top;
  return name ? clientFor("", name) : null;
}

export async function importInvoiceRegister(text: string): Promise<{ rows: number; created: number; updated: number; skippedDrafts: number; withoutClient: number }> {
  const rows = parseCsv(text);
  if (!rows.length || !("Number" in rows[0]) || !("Amount Paid" in rows[0])) throw new Error("This is not Stripe's invoice export. Use Invoices, Export, all dates, all columns, UTC.");
  const res = { rows: rows.length, created: 0, updated: 0, skippedDrafts: 0, withoutClient: 0 };
  const clients = new Map<string, string | null>();
  for (const r of rows) {
    if (!r.id?.startsWith("in_")) continue;
    if (r.Status === "draft") { res.skippedDrafts++; continue; }
    const email = (r["Customer Email"] || "").toLowerCase();
    const name = r["Customer Name"] || "";
    const key = `${email}|${name}`;
    if (!clients.has(key)) clients.set(key, await clientFor(email, name));
    const clientId = clients.get(key) ?? null;
    if (!clientId) res.withoutClient++;
    const issuedAt = utc(r["Finalized At (UTC)"] || r["Date (UTC)"])!;
    const paidAt = utc(r["Paid At (UTC)"]);
    const data = {
      number: r.Number || null, clientId, customerEmail: email || null, customerName: r["Customer Name"] || null,
      status: r.Status, currency: (r.Currency || "").toUpperCase(), total: Number(r.Total || 0), amountPaid: Number(r["Amount Paid"] || 0),
      issuedAt, paidAt, chargeId: r.Charge || null, subscriptionId: r.Subscription || null,
      taxYear: (paidAt || issuedAt).getUTCFullYear(),
    };
    const existing = await prisma.stripeDocument.findUnique({ where: { stripeInvoiceId: r.id }, select: { id: true, clientId: true } });
    if (existing) {
      // A client linked by hand stays linked
      await prisma.stripeDocument.update({ where: { id: existing.id }, data: { ...data, clientId: clientId ?? existing.clientId } });
      res.updated++;
    } else {
      await prisma.stripeDocument.create({ data: { stripeInvoiceId: r.id, ...data } });
      res.created++;
    }
  }
  return res;
}

const MAX_PDF = 3 * 1024 * 1024;

export async function attachInvoicePdf(fileName: string, bytes: Uint8Array): Promise<{ number: string; attached: boolean; reason?: string }> {
  // Stripe names them Invoice-<NUMBER>.pdf; the export of a single invoice may add " (1)"
  const number = fileName.replace(/^Invoice-/i, "").replace(/( \(\d+\))?\.pdf$/i, "").trim();
  if (bytes.length > MAX_PDF) return { number, attached: false, reason: "larger than 3 MB" };
  if (String.fromCharCode(...bytes.slice(0, 5)) !== "%PDF-") return { number, attached: false, reason: "not a PDF" };
  const doc = await prisma.stripeDocument.findFirst({ where: { number }, select: { id: true } });
  if (!doc) return { number, attached: false, reason: "no invoice with this number in the register" };
  await prisma.stripeDocument.update({ where: { id: doc.id }, data: { pdf: Buffer.from(bytes), pdfBytes: bytes.length } });
  return { number, attached: true };
}
