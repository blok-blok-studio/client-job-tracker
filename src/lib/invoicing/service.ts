import { z } from "zod";
import { randomBytes } from "crypto";
import prisma from "@/lib/prisma";
import type { Prisma, StudioInvoice } from "@prisma/client";
import { loadInvoiceSettings, missingBankFields, type InvoiceSettings } from "./settings";
import { decideVat, defaultsForTemplate, guessCountry, templateForCountry, type InvoiceTemplate } from "./vat";
import { addDays, computeTotals, parseDateOnly } from "./money";
import { clientToBillTo, snapshotSeller, invoiceContentHash } from "./view";
import { sealBank } from "./bank-vault";
import { recordCommissionForStudioInvoice, voidCommissionsForStudioInvoice } from "./partner-commission";
import type { BillTo } from "./types";
import { assignInvoiceNumber, withNumberRetry } from "./numbering";

export const lineItemSchema = z.object({
  description: z.string().trim().min(1).max(500),
  qty: z.number().positive().max(100000),
  unitPrice: z.number().min(0).max(10_000_000),
});

export const billToSchema = z.object({
  name: z.string().trim().max(200),
  company: z.string().trim().max(200).nullable().optional(),
  addressLines: z.array(z.string().trim().max(200)).max(8),
  email: z.string().trim().email().max(200).nullable().optional().or(z.literal("")),
  vatId: z.string().trim().max(40).nullable().optional(),
  country: z.string().trim().length(2).toUpperCase().nullable().optional().or(z.literal("")),
});

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const draftSchema = z.object({
  clientId: z.string().min(1),
  template: z.enum(["DE", "US", "EU"]).optional(),
  language: z.enum(["de", "en"]).optional(),
  currency: z.enum(["EUR", "USD"]).optional(),
  issueDate: dateOnly.optional(),
  serviceDateFrom: dateOnly.nullable().optional(),
  serviceDateTo: dateOnly.nullable().optional(),
  dueDays: z.number().int().min(0).max(90).optional(),
  items: z.array(lineItemSchema).min(1).max(50),
  notes: z.string().max(2000).nullable().optional(),
  internalNote: z.string().max(2000).nullable().optional(),
  paymentMethod: z.enum(["BANK", "STRIPE"]).optional(),
  paymentUrl: z.string().trim().url().max(500).regex(/^https:\/\//, "Payment link must start with https://").nullable().optional().or(z.literal("")),
  billTo: billToSchema.optional(),
});
export type DraftInput = z.infer<typeof draftSchema>;

export class InvoiceError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export const CLIENT_BILLING_SELECT = {
  id: true,
  name: true,
  company: true,
  email: true,
  companyAddress: true,
  companyCity: true,
  companyState: true,
  companyZip: true,
  companyCountry: true,
  taxId: true,
  country: true,
} as const;

type BillingClient = Prisma.ClientGetPayload<{ select: typeof CLIENT_BILLING_SELECT }>;

export async function logInvoiceActivity(params: {
  clientId: string;
  actor: string;
  action: string;
  details: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}) {
  await prisma.activityLog
    .create({
      data: {
        clientId: params.clientId,
        actor: params.actor,
        action: params.action,
        details: params.details,
        ipAddress: params.ipAddress ?? undefined,
        userAgent: params.userAgent ?? undefined,
      },
    })
    .catch(() => {});
}

function cleanBillTo(b: z.infer<typeof billToSchema>): BillTo {
  return {
    name: b.name,
    company: b.company || null,
    addressLines: b.addressLines.filter(Boolean),
    email: b.email || null,
    vatId: b.vatId || null,
    country: b.country || null,
  };
}

/** What the new-invoice form needs the moment a client is picked. */
export async function prepareForClient(clientId: string) {
  const client = await prisma.client.findUnique({ where: { id: clientId }, select: CLIENT_BILLING_SELECT });
  if (!client) throw new InvoiceError("Client not found", 404);
  const settings = await loadInvoiceSettings();
  const country = guessCountry(client);
  const template = templateForCountry(country);
  const defaults = defaultsForTemplate(template);
  const billTo = clientToBillTo(client);
  const vat = decideVat({ template, issueDate: new Date(), clientVatId: billTo.vatId, settings });
  const openStripe = await prisma.invoice.findMany({
    where: { clientId, status: { in: ["SENT", "OVERDUE", "DRAFT"] } },
    select: { id: true, amount: true, currency: true, status: true, dueDate: true, stripeInvoiceUrl: true, createdAt: true },
    orderBy: { createdAt: "desc" },
    take: 10,
  });
  const openStudio = await prisma.studioInvoice.findMany({
    where: { clientId, status: { in: ["DRAFT", "ISSUED", "SENT"] } },
    select: { id: true, number: true, total: true, currency: true, status: true, dueDate: true },
    orderBy: { createdAt: "desc" },
    take: 10,
  });
  return {
    client: { id: client.id, name: client.name, company: client.company, email: client.email },
    country,
    template,
    ...defaults,
    billTo,
    vat,
    dueDays: settings.defaultDueDays,
    kleinunternehmerUntil: settings.kleinunternehmerUntil,
    missingBank: { EUR: missingBankFields(settings, "EUR"), USD: missingBankFields(settings, "USD") },
    stripeFeePct: settings.stripeFeePct,
    openStripeInvoices: openStripe.map((i) => ({ ...i, amount: Number(i.amount) })),
    openStudioInvoices: openStudio.map((i) => ({ ...i, total: Number(i.total) })),
  };
}

function resolveFields(input: DraftInput, client: BillingClient, settings: InvoiceSettings, existing?: StudioInvoice) {
  const country = guessCountry(client);
  const template: InvoiceTemplate = input.template ?? (existing?.template as InvoiceTemplate | undefined) ?? templateForCountry(country);
  const d = defaultsForTemplate(template);
  const language = input.language ?? (input.template && !existing ? d.language : ((existing?.language as "de" | "en" | undefined) ?? d.language));
  const currency = input.currency ?? (input.template && !existing ? d.currency : ((existing?.currency as "EUR" | "USD" | undefined) ?? d.currency));
  const issueDate = parseDateOnly(input.issueDate) ?? existing?.issueDate ?? parseDateOnly(new Date().toISOString())!;
  const dueDays = input.dueDays ?? existing?.dueDays ?? settings.defaultDueDays;
  const billTo = input.billTo ? cleanBillTo(input.billTo) : existing ? (existing.billTo as unknown as BillTo) : clientToBillTo(client);
  const vat = decideVat({ template, issueDate, clientVatId: billTo.vatId, settings });
  const totals = computeTotals(input.items, vat.rate);
  const paymentMethod = input.paymentMethod ?? (existing?.paymentMethod as "BANK" | "STRIPE" | undefined) ?? "BANK";
  const paymentUrl = paymentMethod === "STRIPE" ? input.paymentUrl || existing?.paymentUrl || null : null;
  return {
    template,
    language,
    currency,
    issueDate,
    dueDate: addDays(issueDate, dueDays),
    dueDays,
    serviceDateFrom: input.serviceDateFrom === undefined ? (existing?.serviceDateFrom ?? null) : parseDateOnly(input.serviceDateFrom),
    serviceDateTo: input.serviceDateTo === undefined ? (existing?.serviceDateTo ?? null) : parseDateOnly(input.serviceDateTo),
    vatScheme: vat.scheme,
    vatRate: vat.rate,
    vatNote: vat.notes.join("\n"),
    billTo: billTo as unknown as Prisma.InputJsonValue,
    items: totals.items as unknown as Prisma.InputJsonValue,
    subtotal: totals.subtotal,
    vatAmount: totals.vatAmount,
    total: totals.total,
    notes: input.notes === undefined ? (existing?.notes ?? null) : input.notes || null,
    internalNote: input.internalNote === undefined ? (existing?.internalNote ?? null) : input.internalNote || null,
    paymentMethod,
    paymentUrl,
    warning: vat.warning,
  };
}

export async function createDraft(input: DraftInput, actor: string) {
  const client = await prisma.client.findUnique({ where: { id: input.clientId }, select: CLIENT_BILLING_SELECT });
  if (!client) throw new InvoiceError("Client not found", 404);
  const settings = await loadInvoiceSettings();
  const { warning, ...fields } = resolveFields(input, client, settings);
  const invoice = await prisma.studioInvoice.create({
    data: {
      token: randomBytes(16).toString("base64url"),
      clientId: client.id,
      createdBy: actor,
      ...fields,
    },
  });
  await logInvoiceActivity({ clientId: client.id, actor, action: "invoice_draft_created", details: `Invoice draft created (${fields.currency} ${fields.total.toFixed(2)})` });
  return { invoice, warning };
}

export async function updateDraft(id: string, input: Omit<DraftInput, "clientId"> & { clientId?: string }, actor: string) {
  const existing = await prisma.studioInvoice.findUnique({ where: { id } });
  if (!existing) throw new InvoiceError("Invoice not found", 404);
  if (existing.status !== "DRAFT") throw new InvoiceError("Only drafts can be edited. Void the invoice and issue a new one instead.", 409);
  const client = await prisma.client.findUnique({ where: { id: existing.clientId }, select: CLIENT_BILLING_SELECT });
  if (!client) throw new InvoiceError("Client not found", 404);
  const settings = await loadInvoiceSettings();
  const { warning, ...fields } = resolveFields({ ...input, clientId: existing.clientId }, client, settings, existing);
  const invoice = await prisma.studioInvoice.update({ where: { id }, data: fields });
  void actor;
  return { invoice, warning };
}

/**
 * Issue: freeze the seller block, assign the next number, lock the row.
 * Refuses when the bank details for the currency are missing, when an EU
 * reverse-charge invoice has no client VAT id, or when the total is zero.
 */
export async function issueInvoice(id: string, actor: string, meta?: { ipAddress?: string | null; userAgent?: string | null }) {
  const existing = await prisma.studioInvoice.findUnique({ where: { id } });
  if (!existing) throw new InvoiceError("Invoice not found", 404);
  if (existing.status !== "DRAFT") throw new InvoiceError("This invoice was already issued.", 409);
  const settings = await loadInvoiceSettings();
  const currency = existing.currency as "EUR" | "USD";
  const isCard = existing.paymentMethod === "STRIPE" && !!existing.paymentUrl;
  if (!isCard) {
    const missing = missingBankFields(settings, currency);
    if (missing.length) throw new InvoiceError(`Fill in the ${currency} bank details first: ${missing.join(", ")}.`, 422);
  }
  if (Number(existing.total) <= 0) throw new InvoiceError("The invoice total must be above zero.", 422);
  const billTo = existing.billTo as unknown as BillTo;
  if (existing.vatScheme === "REVERSE_CHARGE" && !billTo.vatId) {
    throw new InvoiceError("EU reverse charge needs the client's VAT ID on the invoice. Add it under Bill to.", 422);
  }
  if (!billTo.name && !billTo.company) throw new InvoiceError("Bill to needs a name or a company.", 422);

  // Issue date is the day it is issued unless the draft set one explicitly
  const issueDate = existing.issueDate ?? parseDateOnly(new Date().toISOString())!;
  const vat = decideVat({ template: existing.template as InvoiceTemplate, issueDate, clientVatId: billTo.vatId, settings });
  const items = (existing.items as unknown as Array<{ description: string; qty: number; unitPrice: number }>).map((i) => ({
    description: i.description,
    qty: Number(i.qty),
    unitPrice: Number(i.unitPrice),
  }));
  const totals = computeTotals(items, vat.rate);
  const seller = sealBank(snapshotSeller(settings));

  const issued = await withNumberRetry(async (tx) => {
    await tx.studioInvoice.update({
      where: { id },
      data: {
        status: "ISSUED",
        issueDate,
        dueDate: addDays(issueDate, existing.dueDays),
        vatScheme: vat.scheme,
        vatRate: vat.rate,
        vatNote: vat.notes.join("\n"),
        items: totals.items as unknown as Prisma.InputJsonValue,
        subtotal: totals.subtotal,
        vatAmount: totals.vatAmount,
        total: totals.total,
        sellerSnapshot: seller as unknown as Prisma.InputJsonValue,
      },
    });
    await assignInvoiceNumber(tx, id, issueDate.getUTCFullYear(), settings);
    const row = await tx.studioInvoice.findUniqueOrThrow({ where: { id } });
    await tx.studioInvoice.update({ where: { id }, data: { contentHash: invoiceContentHash(row) } });
    return tx.studioInvoice.findUniqueOrThrow({ where: { id }, include: { client: { select: { id: true, name: true, company: true } } } });
  });

  await logInvoiceActivity({
    clientId: issued.clientId,
    actor,
    action: "invoice_issued",
    details: `Invoice ${issued.number} issued (${issued.currency} ${Number(issued.total).toFixed(2)}, ${issued.vatScheme})`,
    ...meta,
  });
  return issued;
}

export async function markPaid(id: string, actor: string, input: { paidAt?: string | null; method?: string | null; note?: string | null; commissionKind?: "PROJECT" | "BRAND_GUIDE" | "PLAN" | "NONE" | null }) {
  const existing = await prisma.studioInvoice.findUnique({ where: { id } });
  if (!existing) throw new InvoiceError("Invoice not found", 404);
  if (!["ISSUED", "SENT"].includes(existing.status)) throw new InvoiceError(`Cannot mark a ${existing.status.toLowerCase()} invoice as paid.`, 409);
  const paidAt = input.paidAt ? (parseDateOnly(input.paidAt) ?? new Date(input.paidAt)) : new Date();
  if (Number.isNaN(paidAt.getTime())) throw new InvoiceError("Invalid paid date");
  const invoice = await prisma.studioInvoice.update({
    where: { id },
    data: { status: "PAID", paidAt, paidMethod: input.method || "bank", paidNote: input.note || null },
  });
  await logInvoiceActivity({ clientId: invoice.clientId, actor, action: "invoice_paid", details: `Invoice ${invoice.number} marked paid (${invoice.paidMethod})` });
  let commission: Awaited<ReturnType<typeof recordCommissionForStudioInvoice>> | null = null;
  if (input.commissionKind && input.commissionKind !== "NONE") {
    commission = await recordCommissionForStudioInvoice(id, input.commissionKind, actor).catch((err) => {
      console.error("[invoicing] commission on paid invoice failed:", err);
      return { recorded: false, reason: "error" };
    });
  }
  return Object.assign(invoice, { commission });
}

export async function markUnpaid(id: string, actor: string) {
  const existing = await prisma.studioInvoice.findUnique({ where: { id } });
  if (!existing) throw new InvoiceError("Invoice not found", 404);
  if (existing.status !== "PAID") throw new InvoiceError("Only paid invoices can be reopened.", 409);
  const invoice = await prisma.studioInvoice.update({
    where: { id },
    data: { status: existing.sentAt ? "SENT" : "ISSUED", paidAt: null, paidMethod: null, paidNote: null },
  });
  await logInvoiceActivity({ clientId: invoice.clientId, actor, action: "invoice_unpaid", details: `Invoice ${invoice.number} reopened (payment undone)` });
  await voidCommissionsForStudioInvoice(id, actor).catch(() => {});
  return invoice;
}

export async function voidInvoice(id: string, actor: string, reason: string) {
  const existing = await prisma.studioInvoice.findUnique({ where: { id } });
  if (!existing) throw new InvoiceError("Invoice not found", 404);
  if (!["ISSUED", "SENT"].includes(existing.status)) throw new InvoiceError(`Cannot void a ${existing.status.toLowerCase()} invoice.`, 409);
  const invoice = await prisma.studioInvoice.update({
    where: { id },
    data: { status: "VOID", voidedAt: new Date(), voidReason: reason },
  });
  await logInvoiceActivity({ clientId: invoice.clientId, actor, action: "invoice_voided", details: `Invoice ${invoice.number} voided: ${reason}` });
  return invoice;
}

export async function deleteDraft(id: string, actor: string) {
  const existing = await prisma.studioInvoice.findUnique({ where: { id } });
  if (!existing) throw new InvoiceError("Invoice not found", 404);
  if (existing.status !== "DRAFT") throw new InvoiceError("Issued invoices are permanent records. Void it instead.", 409);
  await prisma.studioInvoice.delete({ where: { id } });
  await logInvoiceActivity({ clientId: existing.clientId, actor, action: "invoice_draft_deleted", details: "Invoice draft deleted" });
}

export async function recordSent(id: string, to: string, emailId: string | null, actor: string) {
  const invoice = await prisma.studioInvoice.update({
    where: { id },
    data: { sentAt: new Date(), sentTo: to, status: "SENT" },
  });
  await logInvoiceActivity({ clientId: invoice.clientId, actor, action: "invoice_sent", details: `Invoice ${invoice.number} emailed to ${to}${emailId ? ` (email ${emailId})` : ""}` });
  return invoice;
}

/** New public token: the old pay link stops working immediately (use when a link leaked or went to the wrong inbox). */
export async function rotateInvoiceLink(id: string, actor: string) {
  const existing = await prisma.studioInvoice.findUnique({ where: { id }, select: { id: true, clientId: true, number: true } });
  if (!existing) throw new InvoiceError("Invoice not found", 404);
  const invoice = await prisma.studioInvoice.update({ where: { id }, data: { token: randomBytes(16).toString("base64url") } });
  await logInvoiceActivity({ clientId: existing.clientId, actor, action: "invoice_link_rotated", details: `Pay link for ${existing.number || "draft"} replaced; the old link is dead` });
  return invoice;
}

/** Re-derive the hash and compare: "ok", "mismatch" (row changed since issue) or "none" (draft). */
export function integrityOf(inv: Parameters<typeof invoiceContentHash>[0] & { contentHash: string | null; status: string }): "ok" | "mismatch" | "none" {
  if (inv.status === "DRAFT" || !inv.contentHash) return "none";
  return invoiceContentHash(inv) === inv.contentHash ? "ok" : "mismatch";
}
