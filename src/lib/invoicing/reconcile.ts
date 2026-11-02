import { createHash } from "crypto";
import prisma from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { markPaid, InvoiceError, logInvoiceActivity } from "./service";

/**
 * Bank reconciliation from CSV exports (Wise, N26, Sparkasse/Volksbank DATEV
 * style, or anything with date/amount/reference columns). Credits are stored
 * once (fingerprint), matched to open invoices by the BBS number in the
 * reference, otherwise suggested by amount. Confirmed matches mark the
 * invoice paid on the booking date (receipt + EUR booking follow).
 */
export interface ParsedTx {
  bookedAt: Date;
  amount: number;
  currency: string;
  counterparty: string | null;
  reference: string | null;
  raw: Record<string, string>;
}

function splitCsvLine(line: string, delim: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') inQ = false;
      else cur += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === delim) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

function detectDelimiter(header: string): string {
  const counts = { ";": (header.match(/;/g) || []).length, ",": (header.match(/,/g) || []).length, "\t": (header.match(/\t/g) || []).length };
  return (Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] as string) || ",";
}

function parseAmount(s: string): number | null {
  if (!s) return null;
  let t = s.replace(/[^\d,.\-+]/g, "");
  // German "1.234,56" vs English "1,234.56"
  if (/,\d{1,2}$/.test(t) && (t.match(/,/g) || []).length === 1) t = t.replace(/\./g, "").replace(",", ".");
  else t = t.replace(/,/g, "");
  const n = Number(t);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

function parseDate(s: string): Date | null {
  if (!s) return null;
  const t = s.trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t);
  if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  m = /^(\d{1,2})[./](\d{1,2})[./](\d{4})/.exec(t);
  if (m) return new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]));
  m = /^(\d{1,2})[./](\d{1,2})[./](\d{2})$/.exec(t);
  if (m) return new Date(Date.UTC(2000 + +m[3], +m[2] - 1, +m[1]));
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? null : d;
}

const COLS = {
  date: ["date", "buchungstag", "buchungsdatum", "valuta", "wertstellung", "datum", "created on", "booking date", "value date", "transaction date"],
  amount: ["amount", "betrag", "umsatz", "amount (eur)", "amount (usd)", "source amount (after fees)", "target amount (after fees)", "amount_value"],
  currency: ["currency", "währung", "waehrung", "wkz", "source currency", "target currency", "amount_currency"],
  reference: ["payment reference", "reference", "verwendungszweck", "description", "beschreibung", "buchungstext", "note", "memo", "details", "purpose"],
  counterparty: ["payer name", "payee name", "name", "beguenstigter/zahlungspflichtiger", "begünstigter/zahlungspflichtiger", "auftraggeber/empfänger", "counterparty", "merchant", "sender", "zahlungspflichtiger", "empfänger"],
  direction: ["direction", "credit debit indicator", "soll/haben"],
};

function findCol(headers: string[], candidates: string[]): number {
  const low = headers.map((h) => h.toLowerCase().replace(/"/g, "").trim());
  for (const c of candidates) {
    const i = low.indexOf(c);
    if (i >= 0) return i;
  }
  for (const c of candidates) {
    const i = low.findIndex((h) => h.includes(c));
    if (i >= 0) return i;
  }
  return -1;
}

/** Parse any reasonable bank CSV. Returns credits only (money in). */
export function parseBankCsv(csv: string, defaultCurrency = "EUR"): { source: string; rows: ParsedTx[]; skipped: number; error?: string } {
  const text = csv.replace(/^﻿/, "");
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return { source: "generic", rows: [], skipped: 0, error: "The file has no rows" };
  // Some German exports put metadata lines first; the header is the first line that has a date-ish and amount-ish column
  let headerIdx = 0;
  for (let i = 0; i < Math.min(lines.length, 10); i++) {
    const d = detectDelimiter(lines[i]);
    const cols = splitCsvLine(lines[i], d);
    if (findCol(cols, COLS.date) >= 0 && findCol(cols, COLS.amount) >= 0) {
      headerIdx = i;
      break;
    }
  }
  const delim = detectDelimiter(lines[headerIdx]);
  const headers = splitCsvLine(lines[headerIdx], delim);
  const iDate = findCol(headers, COLS.date);
  const iAmt = findCol(headers, COLS.amount);
  const iCur = findCol(headers, COLS.currency);
  const iRef = findCol(headers, COLS.reference);
  const iCp = findCol(headers, COLS.counterparty);
  const iDir = findCol(headers, COLS.direction);
  if (iDate < 0 || iAmt < 0) return { source: "generic", rows: [], skipped: 0, error: `Could not find date and amount columns. Headers seen: ${headers.slice(0, 12).join(", ")}` };
  const source = headers.some((h) => /wise|transferwise|source amount|target amount/i.test(h)) ? "wise" : headers.some((h) => /buchungstag|verwendungszweck/i.test(h)) ? "de-bank" : "generic";
  const rows: ParsedTx[] = [];
  let skipped = 0;
  for (const line of lines.slice(headerIdx + 1)) {
    const cols = splitCsvLine(line, delim);
    if (cols.length < 2) continue;
    const bookedAt = parseDate(cols[iDate] || "");
    let amount = parseAmount(cols[iAmt] || "");
    if (!bookedAt || amount == null) {
      skipped++;
      continue;
    }
    if (iDir >= 0 && /^(out|debit|s|soll|d)$/i.test(cols[iDir] || "")) amount = -Math.abs(amount);
    if (amount <= 0) {
      skipped++;
      continue;
    }
    const raw: Record<string, string> = {};
    headers.forEach((h, i) => {
      if (cols[i]) raw[h] = cols[i].slice(0, 200);
    });
    rows.push({
      bookedAt,
      amount,
      currency: (iCur >= 0 && cols[iCur] ? cols[iCur] : defaultCurrency).toUpperCase().slice(0, 3),
      counterparty: iCp >= 0 ? cols[iCp]?.slice(0, 120) || null : null,
      reference: iRef >= 0 ? cols[iRef]?.slice(0, 500) || null : null,
      raw,
    });
  }
  return { source, rows, skipped };
}

export function fingerprintOf(source: string, t: ParsedTx): string {
  return createHash("sha256").update([source, t.bookedAt.toISOString().slice(0, 10), t.amount.toFixed(2), t.currency, (t.reference || "").trim().toLowerCase(), (t.counterparty || "").trim().toLowerCase()].join("|")).digest("hex");
}

const NUMBER_RE = /BBS[-\s]?(\d{4})[-\s]?(\d{3,4})/i;

export interface ImportResult {
  imported: number;
  duplicates: number;
  matched: number;
  suggested: number;
  unmatched: number;
  skipped: number;
  source: string;
  error?: string;
}

/** Store credits and try to match each one. Exact number + amount match marks the invoice paid immediately. */
export async function importBankCsv(csv: string, actor: string, defaultCurrency = "EUR"): Promise<ImportResult> {
  const parsed = parseBankCsv(csv, defaultCurrency);
  const res: ImportResult = { imported: 0, duplicates: 0, matched: 0, suggested: 0, unmatched: 0, skipped: parsed.skipped, source: parsed.source, error: parsed.error };
  if (parsed.error) return res;
  for (const t of parsed.rows) {
    const fingerprint = fingerprintOf(parsed.source, t);
    const exists = await prisma.bankTransaction.findUnique({ where: { fingerprint }, select: { id: true } });
    if (exists) {
      res.duplicates++;
      continue;
    }
    const tx = await prisma.bankTransaction.create({
      data: { fingerprint, source: parsed.source, bookedAt: t.bookedAt, amount: t.amount, currency: t.currency, counterparty: t.counterparty, reference: t.reference, raw: t.raw as Prisma.InputJsonValue, importedBy: actor },
    });
    res.imported++;
    const outcome = await matchTransaction(tx.id, actor);
    if (outcome === "MATCHED") res.matched++;
    else if (outcome === "SUGGESTED") res.suggested++;
    else res.unmatched++;
  }
  await logInvoiceActivity({ clientId: "", actor, action: "bank_import", details: `Bank CSV imported (${parsed.source}): ${res.imported} new, ${res.duplicates} already known, ${res.matched} matched, ${res.suggested} suggested` }).catch(() => {});
  return res;
}

async function matchTransaction(txId: string, actor: string): Promise<"MATCHED" | "SUGGESTED" | "UNMATCHED"> {
  const tx = await prisma.bankTransaction.findUnique({ where: { id: txId } });
  if (!tx || tx.status !== "UNMATCHED") return "UNMATCHED";
  const amount = Number(tx.amount);
  const hay = `${tx.reference || ""} ${tx.counterparty || ""}`;
  const m = NUMBER_RE.exec(hay);
  if (m) {
    const number = `BBS-${m[1]}-${m[2].padStart(3, "0")}`;
    const inv = await prisma.studioInvoice.findUnique({ where: { number } });
    if (inv && (inv.status === "ISSUED" || inv.status === "SENT") && inv.currency === tx.currency) {
      if (Math.abs(Number(inv.total) - amount) <= 0.05) {
        await confirmMatch(tx.id, inv.id, actor, true);
        return "MATCHED";
      }
      await prisma.bankTransaction.update({ where: { id: tx.id }, data: { status: "SUGGESTED", suggestedInvoiceId: inv.id } });
      return "SUGGESTED";
    }
    if (inv && inv.status === "PAID") {
      // Already recorded (e.g. marked paid by hand): link without changing anything
      await prisma.bankTransaction.update({ where: { id: tx.id }, data: { status: "MATCHED", invoiceId: inv.id, matchedAt: new Date(), matchedBy: "auto (already paid)" } });
      return "MATCHED";
    }
  }
  // No number: a single open invoice with this exact amount + currency
  const candidates = await prisma.studioInvoice.findMany({ where: { status: { in: ["ISSUED", "SENT"] }, currency: tx.currency, total: amount }, select: { id: true } });
  if (candidates.length === 1) {
    await prisma.bankTransaction.update({ where: { id: tx.id }, data: { status: "SUGGESTED", suggestedInvoiceId: candidates[0].id } });
    return "SUGGESTED";
  }
  return "UNMATCHED";
}

/** Owner confirms (or the exact match confirms itself): invoice → paid on the booking date. */
export async function confirmMatch(txId: string, invoiceId: string, actor: string, auto = false) {
  const tx = await prisma.bankTransaction.findUnique({ where: { id: txId } });
  if (!tx) throw new InvoiceError("Transaction not found", 404);
  if (tx.status === "MATCHED") throw new InvoiceError("Already matched", 409);
  const inv = await prisma.studioInvoice.findUnique({ where: { id: invoiceId }, select: { id: true, status: true, number: true, currency: true, total: true } });
  if (!inv) throw new InvoiceError("Invoice not found", 404);
  if (inv.currency !== tx.currency) throw new InvoiceError(`Currency mismatch: the payment is ${tx.currency}, the invoice ${inv.currency}.`, 422);
  if (inv.status === "ISSUED" || inv.status === "SENT") {
    const partial = Math.abs(Number(inv.total) - Number(tx.amount)) > 0.05;
    await markPaid(invoiceId, auto ? "bank import" : actor, {
      paidAt: tx.bookedAt.toISOString().slice(0, 10),
      method: tx.source === "wise" ? "wise" : "bank",
      note: `${auto ? "Auto-matched" : "Matched"} bank credit ${Number(tx.amount).toFixed(2)} ${tx.currency}${tx.counterparty ? ` from ${tx.counterparty}` : ""}${partial ? " (amount differs from the invoice)" : ""}`,
    });
  }
  await prisma.bankTransaction.update({ where: { id: txId }, data: { status: "MATCHED", invoiceId, suggestedInvoiceId: null, matchedAt: new Date(), matchedBy: auto ? "auto" : actor } });
}

export async function ignoreTransaction(txId: string, actor: string) {
  await prisma.bankTransaction.update({ where: { id: txId }, data: { status: "IGNORED", matchedBy: actor, matchedAt: new Date() } });
}

export async function unmatchTransaction(txId: string) {
  await prisma.bankTransaction.update({ where: { id: txId }, data: { status: "UNMATCHED", invoiceId: null, suggestedInvoiceId: null, matchedAt: null, matchedBy: null } });
}
