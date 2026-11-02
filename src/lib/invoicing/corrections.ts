import { randomBytes } from "crypto";
import prisma from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { InvoiceError, logInvoiceActivity, sendIssuedInvoice } from "./service";
import { loadInvoiceSettings } from "./settings";
import { snapshotSeller, invoiceContentHash } from "./view";
import { sealBank } from "./bank-vault";
import { assignInvoiceNumber, withNumberRetry } from "./numbering";
import { voidCommissionsForStudioInvoice } from "./partner-commission";

/**
 * Stornorechnung: a correction invoice that mirrors an issued invoice with
 * negative amounts and references it. German practice for fixing an issued
 * invoice (instead of editing it). The original is marked VOID with the
 * correction's number as reason; the correction takes the next number in the
 * same sequence and is issued on the spot. If the original had been paid the
 * correction books negative income (a refund is owed); otherwise it nets to
 * zero.
 */
export async function createCorrection(invoiceId: string, reason: string, actor: string, opts?: { send?: boolean }) {
  const original = await prisma.studioInvoice.findUnique({ where: { id: invoiceId } });
  if (!original) throw new InvoiceError("Invoice not found", 404);
  if (original.status === "DRAFT") throw new InvoiceError("Drafts are simply edited or deleted; corrections are for issued invoices.", 409);
  if (original.kind === "CORRECTION") throw new InvoiceError("A correction cannot be corrected. Issue a new invoice instead.", 409);
  if (original.status === "VOID") throw new InvoiceError("This invoice is already cancelled.", 409);
  const already = await prisma.studioInvoice.findFirst({ where: { correctsId: original.id } });
  if (already) throw new InvoiceError(`Already corrected by ${already.number}.`, 409);

  const settings = await loadInvoiceSettings();
  const items = (original.items as unknown as Array<{ description: string; qty: number; unitPrice: number; lineTotal: number }>).map((i) => ({
    description: i.description,
    qty: Number(i.qty),
    unitPrice: -Number(i.unitPrice),
    lineTotal: -Number(i.lineTotal),
  }));
  const wasPaid = original.status === "PAID";
  const today = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate()));

  const correction = await withNumberRetry(async (tx) => {
    const created = await tx.studioInvoice.create({
      data: {
        token: randomBytes(16).toString("base64url"),
        kind: "CORRECTION",
        correctsId: original.id,
        clientId: original.clientId,
        status: "PAID", // nothing to collect: it settles against the original
        template: original.template,
        language: original.language,
        currency: original.currency,
        vatScheme: original.vatScheme,
        vatRate: original.vatRate,
        vatNote: original.vatNote,
        vatOverride: original.vatOverride,
        issueDate: today,
        serviceDateFrom: original.serviceDateFrom,
        serviceDateTo: original.serviceDateTo,
        dueDate: today,
        dueDays: 0,
        billTo: original.billTo as Prisma.InputJsonValue,
        sellerSnapshot: sealBank(snapshotSeller(settings)) as unknown as Prisma.InputJsonValue,
        items: items as unknown as Prisma.InputJsonValue,
        subtotal: -Number(original.subtotal),
        vatAmount: -Number(original.vatAmount),
        total: -Number(original.total),
        paymentMethod: original.paymentMethod,
        notes: reason,
        internalNote: `Correction of ${original.number}: ${reason}`,
        paidAt: today,
        paidMethod: wasPaid ? "refund" : "offset",
        fxRateToEur: wasPaid ? original.fxRateToEur : null,
        eurAmount: wasPaid && original.eurAmount != null ? -Number(original.eurAmount) : 0,
        partnerId: original.partnerId,
        partnerRepId: original.partnerRepId,
        createdBy: actor,
      },
    });
    await assignInvoiceNumber(tx, created.id, today.getUTCFullYear(), settings);
    const row = await tx.studioInvoice.findUniqueOrThrow({ where: { id: created.id } });
    await tx.studioInvoice.update({ where: { id: created.id }, data: { contentHash: invoiceContentHash(row) } });
    await tx.studioInvoice.update({
      where: { id: original.id },
      data: { status: "VOID", voidedAt: new Date(), voidReason: `Corrected by ${row.number}: ${reason}` },
    });
    return tx.studioInvoice.findUniqueOrThrow({ where: { id: created.id } });
  });

  await logInvoiceActivity({ clientId: original.clientId, actor, action: "invoice_corrected", details: `Correction invoice ${correction.number} issued for ${original.number}${wasPaid ? " (refund owed)" : ""}: ${reason}` });
  // Partner commission on the original falls away unless already paid out
  await voidCommissionsForStudioInvoice(original.id, actor).catch(() => {});

  let sent = false;
  if (opts?.send !== false && settings.autoSendOnIssue) {
    const r = await sendIssuedInvoice(correction.id, actor);
    sent = r.sent;
  }
  return { correction, original, wasPaid, sent };
}
