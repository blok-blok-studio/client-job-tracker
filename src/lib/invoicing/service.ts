import { z } from "zod";
import { COUNTRY_CURRENCY } from "./vat";
import { randomBytes } from "crypto";
import prisma from "@/lib/prisma";
import type { Prisma, StudioInvoice } from "@prisma/client";
import { loadInvoiceSettings, missingBankFields, type InvoiceSettings } from "./settings";
import { detectCountry } from "./country-detect";
import { decideVat, defaultsForTemplate, guessCountry, templateForCountry, type InvoiceTemplate, type VatOverride } from "./vat";
import { addDays, computeTotals, parseDateOnly } from "./money";
import { clientToBillTo, snapshotSeller, invoiceContentHash } from "./view";
import { sealBank } from "./bank-vault";
import { inferCommissionKind, recordCommissionForStudioInvoice, voidCommissionsForStudioInvoice } from "./partner-commission";
import { rateToEurOn } from "./revenue";
import type { BillTo } from "./types";
import { assignInvoiceNumber, withNumberRetry, formatInvoiceNumber, nextSequenceFor } from "./numbering";

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
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/).optional(),
  issueDate: dateOnly.optional(),
  serviceDateFrom: dateOnly.nullable().optional(),
  serviceDateTo: dateOnly.nullable().optional(),
  dueDays: z.number().int().min(0).max(90).optional(),
  items: z.array(lineItemSchema).min(1).max(50),
  notes: z.string().max(2000).nullable().optional(),
  internalNote: z.string().max(2000).nullable().optional(),
  vatOverride: z.enum(["AUTO", "KLEINUNTERNEHMER", "REGULAR", "REVERSE_CHARGE", "DRITTLAND"]).nullable().optional(),
  paymentMethod: z.enum(["BANK"]).optional(),
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
  phone: true,
  timezone: true,
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
        clientId: params.clientId || null,
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
  const detected = detectCountry(client);
  const country = detected?.country ?? null;
  const template = templateForCountry(country);
  const base = defaultsForTemplate(template);
  // Bill in the client's own currency when we have a receiving account for it
  const local = country ? COUNTRY_CURRENCY[country] : undefined;
  const defaults = { ...base, currency: local && settings.otherBanks.some((b) => b.currency === local) ? local : base.currency };
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
    countrySource: detected ? (detected.onFile ? null : detected.source) : null,
    template,
    ...defaults,
    billTo,
    vat,
    dueDays: settings.defaultDueDays,
    kleinunternehmerUntil: settings.kleinunternehmerUntil,
    missingBank: Object.fromEntries(["EUR", "USD", ...settings.otherBanks.map((b) => b.currency)].map((c) => [c, missingBankFields(settings, c)])) as Record<string, string[]>,
    configuredCurrencies: ["EUR", "USD", ...settings.otherBanks.map((b) => b.currency)],
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
  const currency = input.currency ?? (input.template && !existing ? d.currency : (existing?.currency ?? d.currency));
  const issueDate = parseDateOnly(input.issueDate) ?? existing?.issueDate ?? parseDateOnly(new Date().toISOString())!;
  const dueDays = input.dueDays ?? existing?.dueDays ?? settings.defaultDueDays;
  const billTo = input.billTo ? cleanBillTo(input.billTo) : existing ? (existing.billTo as unknown as BillTo) : clientToBillTo(client);
  const vatOverride = input.vatOverride === undefined ? ((existing?.vatOverride as VatOverride | null) ?? null) : input.vatOverride === "AUTO" ? null : input.vatOverride;
  const vat = decideVat({ template, issueDate, clientVatId: billTo.vatId, settings, override: vatOverride });
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
    vatOverride,
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

/** Why a draft cannot be issued yet (empty list = ready). Same checks issueInvoice enforces. */
function issueBlockers(existing: StudioInvoice, settings: InvoiceSettings): string[] {
  const out: string[] = [];
  const isCard = existing.paymentMethod === "STRIPE" && !!existing.paymentUrl;
  if (!isCard) {
    const missing = missingBankFields(settings, existing.currency);
    if (missing.length) out.push(`Fill in the ${existing.currency} bank details first: ${missing.join(", ")}.`);
  }
  if (Number(existing.total) <= 0) out.push("The invoice total must be above zero.");
  const billTo = existing.billTo as unknown as BillTo;
  if (existing.vatScheme === "REVERSE_CHARGE" && !billTo.vatId) out.push("EU reverse charge needs the client's VAT ID on the invoice. Add it under Bill to.");
  if (!billTo.name && !billTo.company) out.push("Bill to needs a name or a company.");
  return out;
}

/** The fields issuing writes, computed without saving: shared by issueInvoice and the preview. */
function issueFields(existing: StudioInvoice, settings: InvoiceSettings) {
  const billTo = existing.billTo as unknown as BillTo;
  // Issue date is the day it is issued unless the draft set one explicitly
  const issueDate = existing.issueDate ?? parseDateOnly(new Date().toISOString())!;
  const vat = decideVat({ template: existing.template as InvoiceTemplate, issueDate, clientVatId: billTo.vatId, settings, override: existing.vatOverride as VatOverride | null });
  const items = (existing.items as unknown as Array<{ description: string; qty: number; unitPrice: number }>).map((i) => ({
    description: i.description,
    qty: Number(i.qty),
    unitPrice: Number(i.unitPrice),
  }));
  const totals = computeTotals(items, vat.rate);
  return {
    issueDate,
    dueDate: addDays(issueDate, existing.dueDays),
    vatScheme: vat.scheme,
    vatRate: vat.rate,
    vatNote: vat.notes.join("\n"),
    items: totals.items,
    subtotal: totals.subtotal,
    vatAmount: totals.vatAmount,
    total: totals.total,
    sellerSnapshot: sealBank(snapshotSeller(settings)),
  };
}

/**
 * Exactly what issuing would produce, without saving anything: the predicted
 * number, the final PDF view (no DRAFT stamp) and who the email goes to.
 * The number is a prediction; issuing assigns the real one.
 */
export async function previewIssue(id: string) {
  const existing = await prisma.studioInvoice.findUnique({ where: { id } });
  if (!existing) throw new InvoiceError("Invoice not found", 404);
  if (existing.status !== "DRAFT") throw new InvoiceError("This invoice was already issued.", 409);
  const settings = await loadInvoiceSettings();
  const fields = issueFields(existing, settings);
  const year = fields.issueDate.getUTCFullYear();
  const agg = await prisma.studioInvoice.aggregate({ where: { year }, _max: { sequence: true } });
  const number = formatInvoiceNumber(year, nextSequenceFor(year, agg._max.sequence, settings));
  const row = { ...existing, ...fields, status: "ISSUED", number, year } as unknown as StudioInvoice;
  const corrects = existing.correctsId ? await prisma.studioInvoice.findUnique({ where: { id: existing.correctsId }, select: { number: true, issueDate: true } }) : null;
  const billTo = existing.billTo as unknown as BillTo;
  return { row, settings, corrects, number, to: billTo.email || null, autoSend: settings.autoSendOnIssue, blockers: issueBlockers(existing, settings) };
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
  const blockers = issueBlockers(existing, settings);
  if (blockers.length) throw new InvoiceError(blockers[0], 422);
  const { sellerSnapshot: seller, ...f } = issueFields(existing, settings);
  const issueDate = f.issueDate;

  const issued = await withNumberRetry(async (tx) => {
    await tx.studioInvoice.update({
      where: { id },
      data: {
        status: "ISSUED",
        issueDate,
        dueDate: f.dueDate,
        vatScheme: f.vatScheme,
        vatRate: f.vatRate,
        vatNote: f.vatNote,
        items: f.items as unknown as Prisma.InputJsonValue,
        subtotal: f.subtotal,
        vatAmount: f.vatAmount,
        total: f.total,
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

export async function markPaid(id: string, actor: string, input: { paidAt?: string | null; method?: string | null; note?: string | null; commissionKind?: "PROJECT" | "BRAND_GUIDE" | "PLAN" | "NONE" | null; sendReceipt?: boolean | null; eurAmount?: number | null }) {
  const existing = await prisma.studioInvoice.findUnique({ where: { id } });
  if (!existing) throw new InvoiceError("Invoice not found", 404);
  if (!["ISSUED", "SENT"].includes(existing.status)) throw new InvoiceError(`Cannot mark a ${existing.status.toLowerCase()} invoice as paid.`, 409);
  const paidAt = input.paidAt ? (parseDateOnly(input.paidAt) ?? new Date(input.paidAt)) : new Date();
  if (Number.isNaN(paidAt.getTime())) throw new InvoiceError("Invalid paid date");
  // Book the income in EUR at the ECB rate of the payment date (USD) or 1:1 (EUR)
  const total = Number(existing.total);
  const fx = existing.currency === "EUR" ? { rate: 1, rateDate: paidAt.toISOString().slice(0, 10) } : await rateToEurOn(existing.currency, paidAt);
  const eurAmount = fx.rate != null ? Math.round(total * fx.rate * 100) / 100 : (input.eurAmount ?? null);
  const invoice = await prisma.studioInvoice.update({
    where: { id },
    data: { status: "PAID", paidAt, paidMethod: input.method || "bank", paidNote: input.note || null, fxRateToEur: fx.rate ?? null, eurAmount },
  });
  await logInvoiceActivity({
    clientId: invoice.clientId,
    actor,
    action: "invoice_paid",
    details: `Invoice ${invoice.number} marked paid (${invoice.paidMethod}); ${eurAmount != null ? `booked as EUR ${eurAmount.toFixed(2)}${existing.currency !== "EUR" ? ` at ${fx.rate} (ECB ${fx.rateDate})` : ""}` : `EUR amount not available for ${existing.currency}, enter it by hand`}`,
  });
  // Receipt to the client (best effort)
  let receipt: { sent: boolean; error: string | null } = { sent: false, error: null };
  if (input.sendReceipt !== false) {
    receipt = await sendPaymentReceipt(id, actor).catch((err) => ({ sent: false, error: err instanceof Error ? err.message : "failed" }));
  }
  let commission: Awaited<ReturnType<typeof recordCommissionForStudioInvoice>> | null = null;
  // Automatic paths (bank match) pass no kind: infer it so a partner is never silently skipped
  const commissionKind = input.commissionKind ?? inferCommissionKind(invoice);
  if (commissionKind !== "NONE") {
    commission = await recordCommissionForStudioInvoice(id, commissionKind, actor).catch((err) => {
      console.error("[invoicing] commission on paid invoice failed:", err);
      return { recorded: false, reason: "error" };
    });
  }
  // A paid contract invoice moves the client forward exactly like a paid deposit link did
  if (invoice.contractId) {
    const { onPaymentConfirmed } = await import("@/lib/pipeline");
    await onPaymentConfirmed(invoice.clientId).catch((err) => console.error("[invoicing] pipeline after payment failed:", err));
  }
  return Object.assign(invoice, { commission, receipt, eurAmount, fxRate: fx.rate, fxRateDate: fx.rateDate });
}

export async function markUnpaid(id: string, actor: string) {
  const existing = await prisma.studioInvoice.findUnique({ where: { id } });
  if (!existing) throw new InvoiceError("Invoice not found", 404);
  if (existing.status !== "PAID") throw new InvoiceError("Only paid invoices can be reopened.", 409);
  const invoice = await prisma.studioInvoice.update({
    where: { id },
    data: { status: existing.sentAt ? "SENT" : "ISSUED", paidAt: null, paidMethod: null, paidNote: null, fxRateToEur: null, eurAmount: null },
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

/**
 * Auto-send after issue: PDF + pay link to the bill-to email. Never throws;
 * the invoice is already issued, so a mail failure is reported, not fatal.
 */
export async function sendIssuedInvoice(id: string, actor: string, to?: string | null, message?: string | null): Promise<{ sent: boolean; to: string | null; error: string | null }> {
  const invoice = await prisma.studioInvoice.findUnique({ where: { id } });
  if (!invoice || !["ISSUED", "SENT", "PAID"].includes(invoice.status)) return { sent: false, to: null, error: "Invoice is not issued" };
  const billTo = invoice.billTo as unknown as BillTo;
  const recipient = to || billTo.email;
  if (!recipient) return { sent: false, to: null, error: "No email on the invoice. Add one under Bill to, or copy the pay link." };
  if (!process.env.RESEND_API_KEY) return { sent: false, to: recipient, error: "Email sending is not configured (RESEND_API_KEY missing)." };
  try {
    const [{ buildInvoiceView }, { renderInvoicePdf }, { sendStudioInvoiceEmail }] = await Promise.all([import("./view"), import("./invoice-pdf"), import("./email")]);
    const settings = await loadInvoiceSettings();
    const corrects = invoice.correctsId ? await prisma.studioInvoice.findUnique({ where: { id: invoice.correctsId }, select: { number: true, issueDate: true } }) : null;
    const view = buildInvoiceView(invoice, settings, { corrects });
    const pdf = await renderInvoicePdf(view);
    const { id: emailId } = await sendStudioInvoiceEmail({ to: recipient, view, pdf, message, replyTo: settings.email });
    if (invoice.status !== "PAID") await recordSent(id, recipient, emailId, actor);
    else await logInvoiceActivity({ clientId: invoice.clientId, actor, action: "invoice_sent", details: `Invoice ${invoice.number} copy emailed to ${recipient}` });
    return { sent: true, to: recipient, error: null };
  } catch (err) {
    await logInvoiceActivity({ clientId: invoice.clientId, actor, action: "invoice_send_failed", details: `Invoice ${invoice.number} email to ${recipient} failed: ${err instanceof Error ? err.message : "unknown"}` });
    return { sent: false, to: recipient, error: err instanceof Error ? err.message : "Email failed" };
  }
}

/** The client told us they paid (pay page button). Flags the invoice, pings the owner; the owner still confirms against the bank. */
export async function reportPayment(token: string, input: { date?: string | null; note?: string | null }, meta: { ipAddress: string | null; userAgent: string | null }) {
  const invoice = await prisma.studioInvoice.findUnique({ where: { token } });
  if (!invoice || invoice.status === "DRAFT") throw new InvoiceError("Not found", 404);
  if (invoice.status === "PAID") return { ok: true, alreadyPaid: true };
  if (invoice.status === "VOID") throw new InvoiceError("This invoice was cancelled.", 409);
  const when = input.date ? (parseDateOnly(input.date) ?? new Date()) : new Date();
  const note = [input.date ? `paid ${input.date}` : null, input.note?.trim() || null].filter(Boolean).join(" · ").slice(0, 300) || null;
  await prisma.studioInvoice.update({ where: { id: invoice.id }, data: { paymentReportedAt: new Date(), paymentReportedNote: note } });
  await logInvoiceActivity({ clientId: invoice.clientId, actor: "client", action: "invoice_payment_reported", details: `Client reports invoice ${invoice.number} as paid${note ? ` (${note})` : ""}`, ...meta });
  const { notifyUser } = await import("@/lib/notifications");
  const { notifySlack } = await import("@/lib/slack");
  const client = await prisma.client.findUnique({ where: { id: invoice.clientId }, select: { name: true, company: true } });
  const who = client?.company || client?.name || "A client";
  const owners = await prisma.user.findMany({ where: { role: "OWNER", isActive: true }, select: { id: true } });
  for (const o of owners) {
    await notifyUser({ userId: o.id, type: "approval_response", title: `${who} says invoice ${invoice.number} is paid`, body: `${note ? `${note}. ` : ""}Check the bank, then press Mark paid to confirm and send the receipt.`, link: `/invoices?invoice=${invoice.id}`, clientId: invoice.clientId }).catch(() => {});
  }
  await notifySlack(`:bell: *${who}* reports invoice *${invoice.number}* as paid${input.date ? ` (${input.date})` : ""}. Confirm it on the Invoices page once it shows on the bank.`).catch(() => {});
  void when;
  return { ok: true, alreadyPaid: false };
}

/** Receipt / Zahlungsbestätigung to the client after Mark paid. Best effort, never throws to the caller. */
export async function sendPaymentReceipt(id: string, actor: string): Promise<{ sent: boolean; error: string | null }> {
  const invoice = await prisma.studioInvoice.findUnique({ where: { id } });
  if (!invoice || invoice.status !== "PAID") return { sent: false, error: "not paid" };
  const billTo = invoice.billTo as unknown as BillTo;
  if (!billTo.email) return { sent: false, error: "no email on the invoice" };
  if (!process.env.RESEND_API_KEY) return { sent: false, error: "RESEND_API_KEY missing" };
  try {
    const [{ buildInvoiceView }, { renderInvoicePdf }, { sendPaymentReceiptEmail }] = await Promise.all([import("./view"), import("./invoice-pdf"), import("./email")]);
    const settings = await loadInvoiceSettings();
    const view = buildInvoiceView(invoice, settings);
    const pdf = await renderInvoicePdf(view); // carries the PAID stamp now
    await sendPaymentReceiptEmail({ to: billTo.email, view, pdf, replyTo: settings.email });
    await prisma.studioInvoice.update({ where: { id }, data: { receiptSentAt: new Date() } });
    await logInvoiceActivity({ clientId: invoice.clientId, actor, action: "invoice_receipt_sent", details: `Receipt for ${invoice.number} emailed to ${billTo.email}` });
    return { sent: true, error: null };
  } catch (err) {
    return { sent: false, error: err instanceof Error ? err.message : "failed" };
  }
}
