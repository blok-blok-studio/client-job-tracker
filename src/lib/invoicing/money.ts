import type { InvoiceCurrency, InvoiceLanguage } from "./vat";

export interface LineItemInput {
  description: string;
  qty: number;
  unitPrice: number;
}

export interface LineItem extends LineItemInput {
  lineTotal: number;
}

export interface Totals {
  items: LineItem[];
  subtotal: number;
  vatAmount: number;
  total: number;
}

/** Round half away from zero to cents, avoiding 1.005 → 1.00 float traps. */
export function roundCents(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function computeTotals(items: LineItemInput[], vatRatePct: number): Totals {
  const lines: LineItem[] = items.map((it) => ({
    description: it.description.trim(),
    qty: it.qty,
    unitPrice: roundCents(it.unitPrice),
    lineTotal: roundCents(it.qty * it.unitPrice),
  }));
  const subtotal = roundCents(lines.reduce((s, l) => s + l.lineTotal, 0));
  const vatAmount = roundCents((subtotal * vatRatePct) / 100);
  return { items: lines, subtotal, vatAmount, total: roundCents(subtotal + vatAmount) };
}

/** "1.234,56 €" for German invoices, "$1,234.56" / "€1,234.56" for English ones. */
export function formatMoney(amount: number, currency: InvoiceCurrency, language: InvoiceLanguage): string {
  const locale = language === "de" ? "de-DE" : "en-US";
  return new Intl.NumberFormat(locale, { style: "currency", currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);
}

/**
 * Money for the PDF. pdf-lib's Helvetica draws "€" on top of the next glyph,
 * so the PDF spells the currency out: "1.234,56 EUR" / "USD 1,234.56".
 */
export function formatMoneyPdf(amount: number, currency: InvoiceCurrency, language: InvoiceLanguage): string {
  const locale = language === "de" ? "de-DE" : "en-US";
  const n = new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);
  if (currency === "USD" && language === "en") return `$${n}`;
  return language === "de" ? `${n} ${currency}` : `${currency} ${n}`;
}

export function formatQty(qty: number, language: InvoiceLanguage): string {
  const locale = language === "de" ? "de-DE" : "en-US";
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(qty);
}

export function formatDate(d: Date | string | null | undefined, language: InvoiceLanguage): string {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(language === "de" ? "de-DE" : "en-US", {
    year: "numeric",
    month: language === "de" ? "2-digit" : "short",
    day: language === "de" ? "2-digit" : "numeric",
    timeZone: "UTC",
  });
}

/** Date-only strings ("2026-11-02") become UTC midnight so they print the same day everywhere. */
export function parseDateOnly(s: string | null | undefined): Date | null {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return Number.isNaN(d.getTime()) ? null : d;
}

export function toDateOnly(d: Date | null | undefined): string | null {
  return d ? d.toISOString().slice(0, 10) : null;
}

export function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * 86_400_000);
}
