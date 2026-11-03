import type { EurBank, UsdBank, OtherBank } from "./settings-core";
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
  otherBanks?: OtherBank[];
  wisePayLink: string;
}

export type StudioInvoiceStatus = "DRAFT" | "ISSUED" | "SENT" | "PAID" | "VOID";
export type PaymentMethod = "BANK" | "STRIPE";

/** Everything a renderer needs. Built once by `buildInvoiceView`, consumed by the PDF, the public page and the dashboard. */
export interface InvoiceView {
  id: string;
  token: string;
  number: string | null;
  kind: "INVOICE" | "CORRECTION";
  corrects: { number: string | null; issueDate: string | null } | null;
  milestone: string | null;
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
  paymentReportedAt: string | null;
  paymentReportedNote: string | null;
  eurAmount: number | null;
  fxRateToEur: number | null;
  receiptSentAt: string | null;
  voidedAt: string | null;
  voidReason: string | null;
  publicUrl: string;
  /** What the QR encodes: an EPC payload (EUR bank) or a URL (Wise / Stripe / the invoice page) */
  qrPayload: string | null;
  qrKind: "EPC" | "URL" | null;
  /** Up to two labelled codes: a local one (GiroCode or pay page) and Wise for international payers */
  qrs: QrCode[];
  createdAt: string;
}

export interface QrCode {
  kind: "EPC" | "WISE" | "PAGE" | "CARD";
  payload: string;
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
    reportPaid: "Ich habe überwiesen",
    reportPaidHint: "Sagen Sie uns kurz Bescheid, dann bestätigen wir den Eingang.",
    reportPaidDone: "Danke! Wir prüfen den Zahlungseingang und schicken Ihnen eine Bestätigung.",
    reportPaidDate: "Überwiesen am",
    reportPaidRef: "Referenz / Hinweis (optional)",
    qrEpcTitle: "Zum Bezahlen scannen",
    qrEpcHint: "Banking-App öffnen und scannen. Betrag und Verwendungszweck sind schon ausgefüllt.",
    qrWiseTitle: "Zum Bezahlen scannen",
    qrWiseHint: "Mit der Handykamera scannen. Öffnet Wise, dort diesen Betrag und Verwendungszweck angeben:",
    qrPageTitle: "Online ansehen und bezahlen",
    qrPageHint: "Mit der Handykamera scannen, öffnet diese Rechnung mit allen Bankdaten.",
    qrCardTitle: "Zahlung per Karte",
    correction: "STORNORECHNUNG",
    correctionOf: "Storniert die Rechnung",
    correctionNote: "Diese Stornorechnung hebt die genannte Rechnung vollständig auf. Es ist keine Zahlung fällig.",
    refundNote: "Der bereits gezahlte Betrag wird auf Ihr Konto zurücküberwiesen.",
    quote: "ANGEBOT",
    quoteNumber: "Angebotsnummer",
    quoteDate: "Angebotsdatum",
    validUntil: "Gültig bis",
    schedule: "Zahlungsplan",
    acceptHint: "Dieses Angebot kann online angenommen werden:",
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
    reportPaid: "I have sent the payment",
    reportPaidHint: "Let us know and we will confirm once it arrives.",
    reportPaidDone: "Thank you! We will check the account and send you a confirmation.",
    reportPaidDate: "Paid on",
    reportPaidRef: "Reference / note (optional)",
    qrEpcTitle: "Scan to pay",
    qrEpcHint: "Open your banking app and scan. Amount and reference fill in for you.",
    qrWiseTitle: "Scan to pay",
    qrWiseHint: "Scan with your phone camera. It opens Wise, enter this amount and reference:",
    qrPageTitle: "View and pay online",
    qrPageHint: "Scan with your phone camera to open this invoice with all bank details.",
    qrCardTitle: "Pay by card",
    correction: "CORRECTION INVOICE",
    correctionOf: "Cancels invoice",
    correctionNote: "This correction invoice cancels the invoice named above in full. No payment is due.",
    refundNote: "The amount already paid will be refunded to your account.",
    quote: "QUOTE",
    quoteNumber: "Quote number",
    quoteDate: "Quote date",
    validUntil: "Valid until",
    schedule: "Payment schedule",
    acceptHint: "This quote can be accepted online:",
  },
};
