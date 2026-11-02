import type { EurBank, UsdBank } from "./settings";
import type { InvoiceCurrency, InvoiceLanguage, InvoiceTemplate, VatScheme } from "./vat";
import type { LineItem } from "./money";

export interface BillTo {
  name: string;
  company: string | null;
  addressLines: string[];
  email: string | null;
  vatId: string | null;
  country: string | null;
}

/** Seller + bank details exactly as printed, frozen when the invoice is issued. */
export interface SellerSnapshot {
  sellerName: string;
  contactName: string;
  email: string;
  website: string;
  addressLines: string[];
  steuernummer: string;
  ustIdNr: string;
  eur: EurBank | null;
  usd: UsdBank | null;
  wisePayLink: string;
}

export type StudioInvoiceStatus = "DRAFT" | "ISSUED" | "SENT" | "PAID" | "VOID";
export type PaymentMethod = "BANK" | "STRIPE";

/** Everything a renderer needs. Built once by `buildInvoiceView`, consumed by the PDF, the public page and the dashboard. */
export interface InvoiceView {
  id: string;
  token: string;
  number: string | null;
  status: StudioInvoiceStatus;
  template: InvoiceTemplate;
  language: InvoiceLanguage;
  currency: InvoiceCurrency;
  vatScheme: VatScheme;
  vatRate: number;
  vatNotes: string[];
  issueDate: string | null; // YYYY-MM-DD
  serviceDateFrom: string | null;
  serviceDateTo: string | null;
  dueDate: string | null;
  dueDays: number;
  billTo: BillTo;
  seller: SellerSnapshot;
  items: LineItem[];
  subtotal: number;
  vatAmount: number;
  total: number;
  paymentMethod: PaymentMethod;
  paymentUrl: string | null;
  notes: string | null;
  sentAt: string | null;
  sentTo: string | null;
  paidAt: string | null;
  paidMethod: string | null;
  voidedAt: string | null;
  voidReason: string | null;
  publicUrl: string;
  /** What the QR encodes: an EPC payload (EUR bank) or a URL (Wise / Stripe / the invoice page) */
  qrPayload: string | null;
  qrKind: "EPC" | "URL" | null;
  createdAt: string;
}

export const LABELS: Record<InvoiceLanguage, Record<string, string>> = {
  de: {
    invoice: "RECHNUNG",
    invoiceNumber: "Rechnungsnummer",
    issueDate: "Rechnungsdatum",
    serviceDate: "Leistungsdatum",
    servicePeriod: "Leistungszeitraum",
    dueDate: "Fällig am",
    billTo: "Rechnung an",
    from: "Rechnungssteller",
    pos: "Pos.",
    description: "Beschreibung",
    qty: "Menge",
    unitPrice: "Einzelpreis",
    lineTotal: "Gesamt",
    subtotal: "Zwischensumme (netto)",
    vat: "Umsatzsteuer",
    total: "Gesamtbetrag",
    totalDue: "Zu zahlen",
    paymentTitle: "Zahlung per Überweisung",
    paymentTitleCard: "Zahlung per Karte",
    holder: "Kontoinhaber",
    iban: "IBAN",
    bic: "BIC",
    bank: "Bank",
    reference: "Verwendungszweck",
    payBy: "Bitte überweisen Sie den Betrag bis zum",
    qrCaption: "GiroCode: mit der Banking-App scannen, Überweisung ist vorausgefüllt.",
    qrCaptionUrl: "QR-Code scannen, um die Zahlungsdetails zu öffnen.",
    cardHint: "Bezahlen Sie sicher per Karte über diesen Link:",
    notes: "Hinweise",
    taxNumber: "Steuernummer",
    vatId: "USt-IdNr.",
    clientVatId: "USt-IdNr. des Kunden",
    paid: "BEZAHLT",
    paidOn: "Bezahlt am",
    void: "STORNIERT",
    draft: "ENTWURF",
    page: "Seite",
    of: "von",
    email: "E-Mail",
    web: "Web",
    routing: "Routing (ACH)",
    account: "Kontonummer",
    swift: "SWIFT / BIC",
    thanks: "Vielen Dank für Ihr Vertrauen.",
  },
  en: {
    invoice: "INVOICE",
    invoiceNumber: "Invoice number",
    issueDate: "Issue date",
    serviceDate: "Service date",
    servicePeriod: "Service period",
    dueDate: "Due date",
    billTo: "Bill to",
    from: "From",
    pos: "#",
    description: "Description",
    qty: "Qty",
    unitPrice: "Unit price",
    lineTotal: "Total",
    subtotal: "Subtotal (net)",
    vat: "VAT",
    total: "Total",
    totalDue: "Total due",
    paymentTitle: "Payment by bank transfer",
    paymentTitleCard: "Payment by card",
    holder: "Account holder",
    iban: "IBAN",
    bic: "BIC / SWIFT",
    bank: "Bank",
    reference: "Payment reference",
    payBy: "Please pay by",
    qrCaption: "Scan with your banking app: the transfer is pre-filled.",
    qrCaptionUrl: "Scan to open the payment details.",
    cardHint: "Pay securely by card using this link:",
    notes: "Notes",
    taxNumber: "Tax number (Steuernummer)",
    vatId: "VAT ID (USt-IdNr.)",
    clientVatId: "Client VAT ID",
    paid: "PAID",
    paidOn: "Paid on",
    void: "VOID",
    draft: "DRAFT",
    page: "Page",
    of: "of",
    email: "Email",
    web: "Web",
    routing: "Routing number (ACH)",
    account: "Account number",
    swift: "SWIFT / BIC",
    thanks: "Thank you for your business.",
  },
};
