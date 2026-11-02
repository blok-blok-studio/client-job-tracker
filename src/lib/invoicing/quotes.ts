import { randomBytes } from "crypto";
import { z } from "zod";
import prisma from "@/lib/prisma";
import type { Prisma, Quote } from "@prisma/client";
import { createDraft, InvoiceError, lineItemSchema, billToSchema, logInvoiceActivity, CLIENT_BILLING_SELECT } from "./service";
export { InvoiceError };
import { loadInvoiceSettings } from "./settings";
import { decideVat, defaultsForTemplate, guessCountry, templateForCountry, type InvoiceTemplate, type VatOverride } from "./vat";
import { computeTotals, parseDateOnly, addDays } from "./money";
import { clientToBillTo, snapshotSeller, appUrl } from "./view";
import { withNumberRetry } from "./numbering";
import type { BillTo, InvoiceView } from "./types";
import { renderInvoicePdf } from "./invoice-pdf";

/**
 * Quotes (Angebote). Numbered BBS-Q-YYYY-###, public accept page. On
 * acceptance the payment schedule becomes draft invoices: the first
 * milestone (deposit) is drafted right away for the owner to issue; later
 * milestones are created with "Create next invoice".
 */
export const quoteSchema = z.object({
  clientId: z.string().min(1),
  template: z.enum(["DE", "US", "EU"]).optional(),
  language: z.enum(["de", "en"]).optional(),
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/).optional(),
  vatOverride: z.enum(["AUTO", "KLEINUNTERNEHMER", "REGULAR", "REVERSE_CHARGE", "DRITTLAND"]).nullable().optional(),
  validDays: z.number().int().min(1).max(180).default(30),
  items: z.array(lineItemSchema).min(1).max(50),
  notes: z.string().max(3000).nullable().optional(),
  schedule: z.array(z.object({ label: z.string().trim().min(1).max(80), percent: z.number().min(1).max(100) })).max(6).nullable().optional(),
  billTo: billToSchema.optional(),
});
export type QuoteInput = z.infer<typeof quoteSchema>;

export function quoteNumber(year: number, seq: number): string {
  return `BBS-Q-${year}-${String(seq).padStart(3, "0")}`;
}
export function publicQuoteUrl(token: string): string {
  return `${appUrl()}/q/${token}`;
}

function cleanBillTo(b: z.infer<typeof billToSchema>): BillTo {
  return { name: b.name, company: b.company || null, addressLines: b.addressLines.filter(Boolean), email: b.email || null, vatId: b.vatId || null, country: b.country || null };
}

export async function createQuote(input: QuoteInput, actor: string): Promise<Quote> {
  const client = await prisma.client.findUnique({ where: { id: input.clientId }, select: CLIENT_BILLING_SELECT });
  if (!client) throw new InvoiceError("Client not found", 404);
  const settings = await loadInvoiceSettings();
  const country = guessCountry(client);
  const template: InvoiceTemplate = input.template ?? templateForCountry(country);
  const d = defaultsForTemplate(template);
  const language = input.language ?? d.language;
  const currency = input.currency ?? d.currency;
  const billTo = input.billTo ? cleanBillTo(input.billTo) : clientToBillTo(client);
  const today = parseDateOnly(new Date().toISOString())!;
  const override = input.vatOverride && input.vatOverride !== "AUTO" ? input.vatOverride : null;
  const vat = decideVat({ template, issueDate: today, clientVatId: billTo.vatId, settings, override });
  const totals = computeTotals(input.items, vat.rate);
  const schedule = input.schedule && input.schedule.length ? input.schedule : null;
  if (schedule && Math.round(schedule.reduce((s, x) => s + x.percent, 0)) !== 100) throw new InvoiceError("The payment schedule must add up to 100%.", 422);

  return withNumberRetry(async (tx) => {
    const year = today.getUTCFullYear();
    const agg = await tx.quote.aggregate({ where: { year }, _max: { sequence: true } });
    const sequence = (agg._max.sequence ?? 0) + 1;
    const q = await tx.quote.create({
      data: {
        token: randomBytes(16).toString("base64url"),
        number: quoteNumber(year, sequence),
        year,
        sequence,
        clientId: client.id,
        status: "DRAFT",
        template,
        language,
        currency,
        vatOverride: override,
        vatScheme: vat.scheme,
        vatRate: vat.rate,
        vatNote: vat.notes.join("\n"),
        issueDate: today,
        validUntil: addDays(today, input.validDays),
        billTo: billTo as unknown as Prisma.InputJsonValue,
        items: totals.items as unknown as Prisma.InputJsonValue,
        subtotal: totals.subtotal,
        vatAmount: totals.vatAmount,
        total: totals.total,
        notes: input.notes || null,
        schedule: schedule as unknown as Prisma.InputJsonValue,
        createdBy: actor,
      },
    });
    await tx.activityLog.create({ data: { clientId: client.id, actor, action: "quote_created", details: `Quote ${q.number} created (${currency} ${totals.total.toFixed(2)})` } });
    return q;
  });
}

export async function updateQuote(id: string, input: Partial<QuoteInput>, actor: string): Promise<Quote> {
  const q = await prisma.quote.findUnique({ where: { id } });
  if (!q) throw new InvoiceError("Quote not found", 404);
  if (q.status !== "DRAFT" && q.status !== "SENT") throw new InvoiceError("Only open quotes can be edited.", 409);
  const settings = await loadInvoiceSettings();
  const template = (input.template ?? q.template) as InvoiceTemplate;
  const billTo = input.billTo ? cleanBillTo(input.billTo) : (q.billTo as unknown as BillTo);
  const override = input.vatOverride === undefined ? (q.vatOverride as VatOverride | null) : input.vatOverride === "AUTO" ? null : input.vatOverride;
  const vat = decideVat({ template, issueDate: q.issueDate, clientVatId: billTo.vatId, settings, override });
  const items = input.items ?? (q.items as unknown as Array<{ description: string; qty: number; unitPrice: number }>).map((i) => ({ description: i.description, qty: Number(i.qty), unitPrice: Number(i.unitPrice) }));
  const totals = computeTotals(items, vat.rate);
  const schedule = input.schedule === undefined ? q.schedule : input.schedule && input.schedule.length ? input.schedule : null;
  const updated = await prisma.quote.update({
    where: { id },
    data: {
      template,
      language: input.language ?? q.language,
      currency: input.currency ?? q.currency,
      vatOverride: override,
      vatScheme: vat.scheme,
      vatRate: vat.rate,
      vatNote: vat.notes.join("\n"),
      validUntil: input.validDays ? addDays(q.issueDate, input.validDays) : q.validUntil,
      billTo: billTo as unknown as Prisma.InputJsonValue,
      items: totals.items as unknown as Prisma.InputJsonValue,
      subtotal: totals.subtotal,
      vatAmount: totals.vatAmount,
      total: totals.total,
      notes: input.notes === undefined ? q.notes : input.notes || null,
      schedule: schedule as unknown as Prisma.InputJsonValue,
    },
  });
  void actor;
  return updated;
}

/** InvoiceView-shaped object so the invoice PDF renderer can draw the quote. */
export function quoteView(q: Quote, settings: Awaited<ReturnType<typeof loadInvoiceSettings>>): InvoiceView & { validUntil: string; schedule: Array<{ label: string; percent: number }> | null; acceptUrl: string; quoteStatus: string; acceptedAt: string | null; acceptedName: string | null; convertedInvoiceId: string | null } {
  const seller = snapshotSeller(settings);
  return {
    id: q.id,
    token: q.token,
    number: q.number,
    kind: "INVOICE",
    corrects: null,
    milestone: null,
    status: "ISSUED",
    template: q.template as InvoiceTemplate,
    language: q.language as "de" | "en",
    currency: q.currency,
    vatScheme: q.vatScheme as InvoiceView["vatScheme"],
    vatRate: Number(q.vatRate),
    vatNotes: (q.vatNote || "").split("\n").filter(Boolean),
    issueDate: q.issueDate.toISOString().slice(0, 10),
    serviceDateFrom: null,
    serviceDateTo: null,
    dueDate: null,
    dueDays: 0,
    billTo: q.billTo as unknown as BillTo,
    seller: { ...seller, eur: null, usd: null, otherBanks: [] },
    items: q.items as unknown as InvoiceView["items"],
    subtotal: Number(q.subtotal),
    vatAmount: Number(q.vatAmount),
    total: Number(q.total),
    paymentMethod: "BANK",
    paymentUrl: null,
    notes: q.notes,
    sentAt: q.sentAt?.toISOString() ?? null,
    sentTo: null,
    paidAt: null,
    paidMethod: null,
    paymentReportedAt: null,
    paymentReportedNote: null,
    eurAmount: null,
    fxRateToEur: null,
    receiptSentAt: null,
    voidedAt: null,
    voidReason: null,
    publicUrl: publicQuoteUrl(q.token),
    qrPayload: null,
    qrKind: null,
    qrs: [],
    createdAt: q.createdAt.toISOString(),
    validUntil: q.validUntil.toISOString().slice(0, 10),
    schedule: (q.schedule as unknown as Array<{ label: string; percent: number }> | null) || null,
    acceptUrl: publicQuoteUrl(q.token),
    quoteStatus: q.status,
    acceptedAt: q.acceptedAt?.toISOString() ?? null,
    acceptedName: q.acceptedName,
    convertedInvoiceId: q.convertedInvoiceId,
  };
}

export async function renderQuotePdf(q: Quote): Promise<Uint8Array> {
  const v = quoteView(q, await loadInvoiceSettings());
  return renderInvoicePdf(v, { docType: "QUOTE", validUntil: v.validUntil, schedule: v.schedule, acceptUrl: v.acceptUrl });
}

/** Client accepted on the public page: record it, draft the first milestone invoice for the owner. */
export async function acceptQuote(token: string, input: { name: string; email?: string | null }, meta: { ipAddress: string | null; userAgent: string | null }) {
  const q = await prisma.quote.findUnique({ where: { token } });
  if (!q || q.status === "DRAFT") throw new InvoiceError("Not found", 404);
  if (q.status === "ACCEPTED" || q.status === "CONVERTED") return { ok: true, already: true };
  if (q.status === "DECLINED") throw new InvoiceError("This quote was declined.", 409);
  if (q.validUntil < new Date()) {
    await prisma.quote.update({ where: { id: q.id }, data: { status: "EXPIRED" } });
    throw new InvoiceError("This quote has expired. Please ask for a new one.", 410);
  }
  await prisma.quote.update({ where: { id: q.id }, data: { status: "ACCEPTED", acceptedAt: new Date(), acceptedName: input.name.slice(0, 120), acceptedIp: meta.ipAddress } });
  await logInvoiceActivity({ clientId: q.clientId, actor: "client", action: "quote_accepted", details: `Quote ${q.number} accepted online by ${input.name}`, ...meta });
  const first = await createNextMilestoneInvoice(q.id, "client acceptance").catch((err) => {
    console.error("[quotes] first milestone draft failed:", err);
    return null;
  });
  const { notifyUser } = await import("@/lib/notifications");
  const { notifySlack } = await import("@/lib/slack");
  const client = await prisma.client.findUnique({ where: { id: q.clientId }, select: { name: true, company: true } });
  const who = client?.company || client?.name || "A client";
  const owners = await prisma.user.findMany({ where: { role: "OWNER", isActive: true }, select: { id: true } });
  for (const o of owners) await notifyUser({ userId: o.id, type: "approval_response", title: `${who} accepted quote ${q.number}`, body: first ? "The deposit invoice is drafted. Review and issue it." : "Review it on the Quotes tab.", link: first ? `/invoices?invoice=${first.id}` : "/invoices?tab=quotes", clientId: q.clientId }).catch(() => {});
  await notifySlack(`:tada: *${who}* accepted quote *${q.number}*.${first ? " Deposit invoice drafted for Chase to issue." : ""}`).catch(() => {});
  return { ok: true, already: false, invoiceId: first?.id ?? null };
}

export async function declineQuote(token: string, reason: string | null, meta: { ipAddress: string | null; userAgent: string | null }) {
  const q = await prisma.quote.findUnique({ where: { token } });
  if (!q || q.status === "DRAFT") throw new InvoiceError("Not found", 404);
  if (q.status !== "SENT") return { ok: true };
  await prisma.quote.update({ where: { id: q.id }, data: { status: "DECLINED", declinedAt: new Date() } });
  await logInvoiceActivity({ clientId: q.clientId, actor: "client", action: "quote_declined", details: `Quote ${q.number} declined${reason ? `: ${reason}` : ""}`, ...meta });
  return { ok: true };
}

/** Draft the next unpaid milestone of an accepted quote (or the whole amount when there is no schedule). */
export async function createNextMilestoneInvoice(quoteId: string, actor: string) {
  const q = await prisma.quote.findUnique({ where: { id: quoteId } });
  if (!q) throw new InvoiceError("Quote not found", 404);
  if (q.status !== "ACCEPTED" && q.status !== "CONVERTED") throw new InvoiceError("The quote has to be accepted first.", 409);
  const schedule = (q.schedule as unknown as Array<{ label: string; percent: number }> | null) || [{ label: q.language === "de" ? "Gesamtbetrag" : "Full amount", percent: 100 }];
  const existing = await prisma.studioInvoice.findMany({ where: { quoteId: q.id, status: { not: "VOID" } }, select: { milestone: true } });
  const done = new Set(existing.map((e) => e.milestone));
  const nextIdx = schedule.findIndex((_, i) => !done.has(`m${i + 1}`));
  if (nextIdx < 0) throw new InvoiceError("Every milestone of this quote has an invoice already.", 409);
  const st = schedule[nextIdx];
  const items = (q.items as unknown as Array<{ description: string; qty: number; unitPrice: number }>).map((i) => ({
    description: schedule.length > 1 ? `${i.description} (${st.label}, ${st.percent}%)` : i.description,
    qty: Number(i.qty),
    unitPrice: Math.round(Number(i.unitPrice) * st.percent) / 100,
  }));
  const { invoice } = await createDraft(
    {
      clientId: q.clientId,
      template: q.template as InvoiceTemplate,
      language: q.language as "de" | "en",
      currency: q.currency,
      vatOverride: (q.vatOverride as VatOverride | null) ?? "AUTO",
      items,
      notes: q.language === "de" ? `Gemäß Angebot ${q.number}` : `As per quote ${q.number}`,
      internalNote: `From quote ${q.number}, milestone ${nextIdx + 1}/${schedule.length} (${st.label})`,
      billTo: { ...(q.billTo as unknown as BillTo), email: (q.billTo as unknown as BillTo).email || "", country: (q.billTo as unknown as BillTo).country || "" },
    },
    actor
  );
  await prisma.studioInvoice.update({ where: { id: invoice.id }, data: { quoteId: q.id, milestone: `m${nextIdx + 1}` } });
  if (nextIdx === schedule.length - 1) await prisma.quote.update({ where: { id: q.id }, data: { status: "CONVERTED", convertedInvoiceId: q.convertedInvoiceId || invoice.id } });
  else if (!q.convertedInvoiceId) await prisma.quote.update({ where: { id: q.id }, data: { convertedInvoiceId: invoice.id } });
  return { ...invoice, milestoneLabel: st.label, milestoneIndex: nextIdx + 1, milestones: schedule.length };
}
