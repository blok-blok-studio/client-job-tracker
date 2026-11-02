import type { StudioInvoice } from "@prisma/client";
import { createHash } from "crypto";
import type { InvoiceSettings } from "./settings";
import type { BillTo, InvoiceView, SellerSnapshot, PaymentMethod, StudioInvoiceStatus } from "./types";
import type { InvoiceCurrency, InvoiceLanguage, InvoiceTemplate, VatScheme } from "./vat";
import type { LineItem } from "./money";
import { computeTotals, toDateOnly } from "./money";
import { buildEpcPayload } from "./epc-qr";
import { guessCountry } from "./vat";
import { openBank, type SealedBank } from "./bank-vault";

export function appUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || "https://app.blokblokstudio.com").replace(/\/$/, "");
}

export function publicInvoiceUrl(token: string): string {
  return `${appUrl()}/b/${token}`;
}

export function snapshotSeller(s: InvoiceSettings): SellerSnapshot {
  return {
    sellerName: s.sellerName,
    contactName: s.contactName,
    email: s.email,
    website: s.website,
    addressLines: [...s.addressLines],
    steuernummer: s.steuernummer,
    ustIdNr: s.ustIdNr,
    eur: { ...s.eur },
    usd: { ...s.usd },
    wisePayLink: s.wisePayLink,
  };
}

function asBillTo(raw: unknown): BillTo {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    name: typeof r.name === "string" ? r.name : "",
    company: typeof r.company === "string" && r.company ? r.company : null,
    addressLines: Array.isArray(r.addressLines) ? r.addressLines.filter((l): l is string => typeof l === "string" && !!l.trim()) : [],
    email: typeof r.email === "string" && r.email ? r.email : null,
    vatId: typeof r.vatId === "string" && r.vatId ? r.vatId : null,
    country: typeof r.country === "string" && r.country ? r.country : null,
  };
}

function asItems(raw: unknown): LineItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((it) => {
      const r = (it && typeof it === "object" ? it : {}) as Record<string, unknown>;
      const qty = Number(r.qty);
      const unitPrice = Number(r.unitPrice);
      return {
        description: typeof r.description === "string" ? r.description : "",
        qty: Number.isFinite(qty) ? qty : 0,
        unitPrice: Number.isFinite(unitPrice) ? unitPrice : 0,
        lineTotal: Number(r.lineTotal),
      };
    })
    .map((it) => ({ ...it, lineTotal: Number.isFinite(it.lineTotal) ? it.lineTotal : computeTotals([it], 0).subtotal }));
}

function asSeller(raw: unknown, fallback: InvoiceSettings): SellerSnapshot {
  if (!raw || typeof raw !== "object") return snapshotSeller(fallback);
  const { bankVault: _vault, ...r } = openBank(raw as Partial<SellerSnapshot> & SealedBank);
  void _vault; // ciphertext never leaves the server, not even to the owner's browser
  const base = snapshotSeller(fallback);
  return {
    ...base,
    ...r,
    addressLines: Array.isArray(r.addressLines) ? r.addressLines : base.addressLines,
    eur: r.eur ?? base.eur,
    usd: r.usd ?? base.usd,
  };
}

function vatNotesFrom(vatNote: string | null): string[] {
  return (vatNote || "").split("\n").map((l) => l.trim()).filter(Boolean);
}

/**
 * The one place a stored row turns into something printable. Drafts read the
 * live settings; issued invoices read their frozen seller snapshot, so editing
 * the bank details later never rewrites an invoice that already went out.
 */
export function buildInvoiceView(inv: StudioInvoice, settings: InvoiceSettings): InvoiceView {
  const status = inv.status as StudioInvoiceStatus;
  const seller = status === "DRAFT" ? snapshotSeller(settings) : asSeller(inv.sellerSnapshot, settings);
  const currency = inv.currency as InvoiceCurrency;
  const paymentMethod = inv.paymentMethod as PaymentMethod;
  const total = Number(inv.total);
  const token = inv.token;
  const url = publicInvoiceUrl(token);

  let qrPayload: string | null = null;
  let qrKind: InvoiceView["qrKind"] = null;
  if (paymentMethod === "STRIPE" && inv.paymentUrl) {
    qrPayload = inv.paymentUrl;
    qrKind = "URL";
  } else if (currency === "EUR" && seller.eur?.iban && total >= 0.01) {
    try {
      qrPayload = buildEpcPayload({
        name: seller.eur.holder || seller.sellerName,
        iban: seller.eur.iban,
        bic: seller.eur.bic || null,
        amount: total,
        reference: inv.number || "Blok Blok Studio",
      });
      qrKind = "EPC";
    } catch {
      qrPayload = null;
    }
  } else if (currency === "USD") {
    qrPayload = seller.wisePayLink || url;
    qrKind = "URL";
  }

  return {
    id: inv.id,
    token,
    number: inv.number,
    status,
    template: inv.template as InvoiceTemplate,
    language: inv.language as InvoiceLanguage,
    currency,
    vatScheme: inv.vatScheme as VatScheme,
    vatRate: Number(inv.vatRate),
    vatNotes: vatNotesFrom(inv.vatNote),
    issueDate: toDateOnly(inv.issueDate),
    serviceDateFrom: toDateOnly(inv.serviceDateFrom),
    serviceDateTo: toDateOnly(inv.serviceDateTo),
    dueDate: toDateOnly(inv.dueDate),
    dueDays: inv.dueDays,
    billTo: asBillTo(inv.billTo),
    seller,
    items: asItems(inv.items),
    subtotal: Number(inv.subtotal),
    vatAmount: Number(inv.vatAmount),
    total,
    paymentMethod,
    paymentUrl: inv.paymentUrl,
    notes: inv.notes,
    sentAt: inv.sentAt?.toISOString() ?? null,
    sentTo: inv.sentTo,
    paidAt: inv.paidAt?.toISOString() ?? null,
    paidMethod: inv.paidMethod,
    paymentReportedAt: inv.paymentReportedAt?.toISOString() ?? null,
    paymentReportedNote: inv.paymentReportedNote,
    eurAmount: inv.eurAmount != null ? Number(inv.eurAmount) : null,
    fxRateToEur: inv.fxRateToEur != null ? Number(inv.fxRateToEur) : null,
    receiptSentAt: inv.receiptSentAt?.toISOString() ?? null,
    voidedAt: inv.voidedAt?.toISOString() ?? null,
    voidReason: inv.voidReason,
    publicUrl: url,
    qrPayload,
    qrKind,
    createdAt: inv.createdAt.toISOString(),
  };
}

/** The client-facing shape: no bank account numbers beyond what the invoice prints, no internal notes. */
export function publicInvoiceView(view: InvoiceView): Omit<InvoiceView, "id"> {
  const { id: _id, ...withBooks } = view;
  void _id;
  // Our bookkeeping (EUR conversion) is not the client's business
  const rest = { ...withBooks, eurAmount: null, fxRateToEur: null };
  const settled = view.status === "PAID" || view.status === "VOID";
  if (!settled) return rest;
  // Once paid or voided there is nothing left to pay: the link still shows the
  // invoice, but no account numbers, no QR, no card link.
  return {
    ...rest,
    seller: { ...rest.seller, eur: null, usd: null, wisePayLink: "" },
    paymentUrl: null,
    qrPayload: null,
    qrKind: null,
  };
}

/** SHA-256 over the parts of an issued invoice that must never change. Stored at issue, re-checked on read. */
export function invoiceContentHash(inv: {
  number: string | null;
  issueDate: Date | null;
  dueDate: Date | null;
  currency: string;
  vatScheme: string;
  vatRate: unknown;
  billTo: unknown;
  items: unknown;
  subtotal: unknown;
  vatAmount: unknown;
  total: unknown;
  sellerSnapshot: unknown;
}): string {
  const canon = JSON.stringify({
    number: inv.number,
    issueDate: inv.issueDate?.toISOString() ?? null,
    dueDate: inv.dueDate?.toISOString() ?? null,
    currency: inv.currency,
    vatScheme: inv.vatScheme,
    vatRate: Number(inv.vatRate),
    billTo: inv.billTo,
    items: inv.items,
    subtotal: Number(inv.subtotal),
    vatAmount: Number(inv.vatAmount),
    total: Number(inv.total),
    sellerSnapshot: inv.sellerSnapshot,
  });
  return createHash("sha256").update(canon).digest("hex");
}

export function clientToBillTo(client: {
  name: string;
  company: string | null;
  email: string | null;
  companyAddress: string | null;
  companyCity: string | null;
  companyState: string | null;
  companyZip: string | null;
  companyCountry: string | null;
  taxId: string | null;
  country: string | null;
}): BillTo {
  const lines: string[] = [];
  if (client.companyAddress) lines.push(...client.companyAddress.split(/\n+/).map((l) => l.trim()).filter(Boolean));
  const country = guessCountry(client);
  const usStyle = country === "US" || country === "CA" || country === "AU";
  const city = client.companyCity?.trim() || "";
  const state = client.companyState?.trim() || "";
  const zip = client.companyZip?.trim() || "";
  const cityLine = usStyle
    ? [[city, state].filter(Boolean).join(", "), zip].filter(Boolean).join(" ") // Dallas, TX 75201
    : [[zip, city].filter(Boolean).join(" "), state && !city.includes(state) ? state : ""].filter(Boolean).join(", "); // 10115 Berlin
  if (cityLine) lines.push(cityLine);
  if (client.companyCountry) lines.push(client.companyCountry);
  return {
    name: client.name,
    company: client.company,
    addressLines: lines,
    email: client.email,
    vatId: client.taxId,
    country: client.country,
  };
}
