import prisma from "@/lib/prisma";
import type { InvoiceSettings } from "./settings";

/**
 * Invoice numbers: BBS-YYYY-### — sequential within the year, assigned the
 * moment an invoice is issued, never reused (voided invoices keep theirs) and
 * never skipped (drafts have no number, so deleting a draft leaves no hole).
 *
 * Concurrency: the (year, sequence) pair is unique in the database. Two
 * issues racing for the same number make one of them fail the unique
 * constraint, and that one retries with the next number.
 */
/** The client handed to an interactive transaction (Accelerate-extended, so not Prisma.TransactionClient). */
export type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

export function formatInvoiceNumber(year: number, sequence: number): string {
  return `BBS-${year}-${String(sequence).padStart(3, "0")}`;
}

export function nextSequenceFor(year: number, maxExisting: number | null, settings: Pick<InvoiceSettings, "sequenceStartYear" | "sequenceStart">): number {
  if (maxExisting != null) return maxExisting + 1;
  // No invoice in this year yet: honour the starting number for invoices that
  // predate this system (e.g. BBS-2026-001..004 were written by hand)
  if (year === settings.sequenceStartYear) return Math.max(1, settings.sequenceStart);
  return 1;
}

export async function assignInvoiceNumber(
  tx: Tx,
  invoiceId: string,
  year: number,
  settings: Pick<InvoiceSettings, "sequenceStartYear" | "sequenceStart">
): Promise<{ number: string; sequence: number }> {
  const agg = await tx.studioInvoice.aggregate({ where: { year }, _max: { sequence: true } });
  const sequence = nextSequenceFor(year, agg._max.sequence, settings);
  const number = formatInvoiceNumber(year, sequence);
  await tx.studioInvoice.update({ where: { id: invoiceId }, data: { year, sequence, number } });
  return { number, sequence };
}

/** Run `fn` inside a transaction, retrying when the unique (year, sequence) pair collides. */
export async function withNumberRetry<T>(fn: (tx: Tx) => Promise<T>, attempts = 4): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await prisma.$transaction(async (tx) => fn(tx));
    } catch (err) {
      lastErr = err;
      const code = (err as { code?: string })?.code;
      if (code !== "P2002") throw err;
    }
  }
  throw lastErr;
}
