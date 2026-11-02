import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from "pdf-lib";
import fs from "fs";
import path from "path";
import { createHash } from "crypto";
import prisma from "@/lib/prisma";
import type { Prisma, PartnerStatement } from "@prisma/client";
import { loadInvoiceSettings } from "./settings";
import { EU_COUNTRIES } from "./vat";
import { withNumberRetry } from "./numbering";
import { InvoiceError } from "./service";

/**
 * Commission statements: one per payout, issued by Blok Blok on the partner's
 * behalf as a self-billing credit note (Gutschrift, § 14 Abs. 2 S. 2 UStG).
 * The partnership agreement promises "a statement listing the practice, the
 * payment that earned the commission, the rate and the amount" with every
 * payout; this is that document, numbered BBS-PS-YYYY-###.
 */
export interface PartnerSnapshot {
  name: string;
  legalName: string | null;
  contactName: string | null;
  email: string | null;
  addressLines: string[];
  country: string;
  taxId: string | null;
}
export interface SellerBlock {
  sellerName: string;
  contactName: string;
  email: string;
  website: string;
  addressLines: string[];
  steuernummer: string;
  ustIdNr: string;
}
export interface StatementLine {
  description: string;
  client: string;
  kind: string;
  eventAt: string; // ISO
  basisAmount: number;
  rate: number;
  amount: number;
}
export type StatementVatScheme = "DRITTLAND" | "KLEINUNTERNEHMER_PARTNER" | "REGULAR" | "REVERSE_CHARGE";

export interface StatementView {
  id: string;
  number: string;
  payoutId: string;
  issueDate: string;
  periodFrom: string | null;
  periodTo: string | null;
  currency: string;
  partner: PartnerSnapshot;
  seller: SellerBlock;
  lines: StatementLine[];
  gross: number;
  clawbacks: number;
  net: number;
  vatScheme: StatementVatScheme;
  vatRate: number;
  vatAmount: number;
  vatNotes: string[];
  total: number; // net + vatAmount: what was / is owed to the partner
  stripeTransferId: string | null;
  wiseTransferId: string | null;
  contentHash: string | null;
  createdAt: string;
}

const round2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;

/** VAT treatment of the partner's commission, by where the partner sits. */
export function statementVat(partner: { country: string; chargesVat: boolean; taxId?: string | null }): { scheme: StatementVatScheme; rate: number; notes: string[]; warning: string | null } {
  const c = (partner.country || "US").toUpperCase();
  if (c === "DE") {
    if (partner.chargesVat) {
      return {
        scheme: "REGULAR",
        rate: 19,
        notes: ["Gutschrift im Sinne des § 14 Abs. 2 Satz 2 UStG. Umsatzsteuer 19 % ausgewiesen; der Gutschriftsempfänger schuldet die Umsatzsteuer."],
        warning: "German partner charging VAT: confirm their USt-IdNr. is on the statement and that they are not a Kleinunternehmer.",
      };
    }
    return {
      scheme: "KLEINUNTERNEHMER_PARTNER",
      rate: 0,
      notes: ["Gutschrift im Sinne des § 14 Abs. 2 Satz 2 UStG. Kein Umsatzsteuerausweis: der Gutschriftsempfänger ist Kleinunternehmer gemäß § 19 UStG oder nicht umsatzsteuerpflichtig."],
      warning: "German partner without VAT: confirm their § 19 status in writing.",
    };
  }
  if (EU_COUNTRIES.includes(c)) {
    return {
      scheme: "REVERSE_CHARGE",
      rate: 0,
      notes: ["Self-billing credit note (Gutschrift, § 14 Abs. 2 Satz 2 UStG). Reverse charge: VAT is accounted for by the recipient of the service (Art. 196 VAT Directive / § 13b UStG)."],
      warning: "EU partner: their VAT ID must be on the statement.",
    };
  }
  return {
    scheme: "DRITTLAND",
    rate: 0,
    notes: [
      "Self-billing credit note (Gutschrift, § 14 Abs. 2 Satz 2 UStG) for referral and sales services supplied by a business established outside the EU.",
      "No VAT shown. Where German VAT is due on this service it is accounted for by Blok Blok Studio LLC under the reverse-charge rule (§ 13b UStG).",
    ],
    warning: "Non-EU partner: § 13b reverse charge may mean 19% German VAT is owed by Blok Blok on this commission. Confirm with BD Berlin Digital Tax.",
  };
}

export function partnerSnapshotOf(p: { name: string; legalName: string | null; contactName: string | null; email: string | null; billingAddress: string | null; country: string; taxId: string | null }): PartnerSnapshot {
  return {
    name: p.name,
    legalName: p.legalName,
    contactName: p.contactName,
    email: p.email,
    addressLines: (p.billingAddress || "").split(/\n+/).map((l) => l.trim()).filter(Boolean),
    country: p.country,
    taxId: p.taxId,
  };
}

export function statementNumber(year: number, sequence: number): string {
  return `BBS-PS-${year}-${String(sequence).padStart(3, "0")}`;
}

function contentHash(row: { number: string; issueDate: Date; currency: string; partnerSnapshot: unknown; sellerSnapshot: unknown; lines: unknown; gross: unknown; clawbacks: unknown; net: unknown; vatRate: unknown; vatAmount: unknown; stripeTransferId: string | null; wiseTransferId: string | null }): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        number: row.number,
        issueDate: row.issueDate.toISOString(),
        currency: row.currency,
        partner: row.partnerSnapshot,
        seller: row.sellerSnapshot,
        lines: row.lines,
        gross: Number(row.gross),
        clawbacks: Number(row.clawbacks),
        net: Number(row.net),
        vatRate: Number(row.vatRate),
        vatAmount: Number(row.vatAmount),
        transfer: row.stripeTransferId ?? row.wiseTransferId, // old statements keep their hash
      })
    )
    .digest("hex");
}

/**
 * Create the statement for a payout. Idempotent: a payout has at most one
 * statement. Called right after the Stripe transfer succeeds, and by the
 * owner's "generate missing statements" button for payouts made before this
 * existed.
 */
export async function createStatementForPayout(payoutId: string, actor: string): Promise<PartnerStatement> {
  const existing = await prisma.partnerStatement.findUnique({ where: { payoutId } });
  if (existing) return existing;
  const payout = await prisma.commissionPayout.findUnique({ where: { id: payoutId } });
  if (!payout) throw new InvoiceError("Payout not found", 404);
  const partner = await prisma.partner.findUnique({ where: { id: payout.partnerId } });
  if (!partner) throw new InvoiceError("Partner not found", 404);
  const rows = await prisma.commission.findMany({ where: { payoutId }, orderBy: { eventAt: "asc" } });
  const clientIds = [...new Set(rows.map((r) => r.clientId))];
  const clients = clientIds.length ? await prisma.client.findMany({ where: { id: { in: clientIds } }, select: { id: true, name: true, company: true } }) : [];
  const clientName = new Map(clients.map((c) => [c.id, c.company || c.name]));
  const settings = await loadInvoiceSettings();

  const lines: StatementLine[] = rows.map((r) => ({
    description: r.description,
    client: clientName.get(r.clientId) || "Client",
    kind: r.kind,
    eventAt: r.eventAt.toISOString(),
    basisAmount: Number(r.basisAmount),
    rate: Number(r.rate),
    amount: Number(r.amount),
  }));
  let gross = 0;
  let clawbacks = 0;
  for (const l of lines) {
    if (l.amount >= 0) gross += l.amount;
    else clawbacks += l.amount;
  }
  gross = round2(gross);
  clawbacks = round2(clawbacks);
  const net = round2(Number(payout.amount)); // what was actually transferred
  const vat = statementVat(partner);
  const vatAmount = round2((net * vat.rate) / 100);
  const seller: SellerBlock = {
    sellerName: settings.sellerName,
    contactName: settings.contactName,
    email: settings.email,
    website: settings.website,
    addressLines: settings.addressLines,
    steuernummer: settings.steuernummer,
    ustIdNr: settings.ustIdNr,
  };
  const issueDate = payout.createdAt;
  const year = issueDate.getUTCFullYear();
  const eventDates = rows.map((r) => r.eventAt.getTime());

  return withNumberRetry(async (tx) => {
    const agg = await tx.partnerStatement.aggregate({ where: { year }, _max: { sequence: true } });
    const sequence = (agg._max.sequence ?? 0) + 1;
    const number = statementNumber(year, sequence);
    const data = {
      number,
      year,
      sequence,
      partnerId: partner.id,
      payoutId,
      issueDate,
      periodFrom: eventDates.length ? new Date(Math.min(...eventDates)) : null,
      periodTo: eventDates.length ? new Date(Math.max(...eventDates)) : null,
      currency: (payout.currency || "usd").toUpperCase(),
      partnerSnapshot: partnerSnapshotOf(partner) as unknown as Prisma.InputJsonValue,
      sellerSnapshot: seller as unknown as Prisma.InputJsonValue,
      lines: lines as unknown as Prisma.InputJsonValue,
      gross,
      clawbacks,
      net,
      vatScheme: vat.scheme,
      vatRate: vat.rate,
      vatAmount,
      vatNote: vat.notes.join("\n"),
      stripeTransferId: payout.stripeTransferId,
      wiseTransferId: payout.wiseTransferId,
      createdBy: actor,
    };
    const created = await tx.partnerStatement.create({ data });
    const hash = contentHash({ ...created });
    const final = await tx.partnerStatement.update({ where: { id: created.id }, data: { contentHash: hash } });
    await tx.activityLog.create({ data: { actor, action: "partner_statement_issued", details: `Commission statement ${number} issued to ${partner.name} for payout ${payoutId}` } });
    return final;
  });
}

/** Statements for every payout of this partner that has none yet. */
export async function backfillStatements(partnerId: string, actor: string): Promise<number> {
  const payouts = await prisma.commissionPayout.findMany({ where: { partnerId }, select: { id: true } });
  const have = new Set((await prisma.partnerStatement.findMany({ where: { partnerId }, select: { payoutId: true } })).map((s) => s.payoutId));
  let n = 0;
  for (const p of payouts) {
    if (have.has(p.id)) continue;
    await createStatementForPayout(p.id, actor);
    n++;
  }
  return n;
}

export function buildStatementView(row: PartnerStatement): StatementView {
  const vatAmount = Number(row.vatAmount);
  const net = Number(row.net);
  return {
    id: row.id,
    number: row.number,
    payoutId: row.payoutId,
    issueDate: row.issueDate.toISOString().slice(0, 10),
    periodFrom: row.periodFrom?.toISOString().slice(0, 10) ?? null,
    periodTo: row.periodTo?.toISOString().slice(0, 10) ?? null,
    currency: row.currency,
    partner: row.partnerSnapshot as unknown as PartnerSnapshot,
    seller: row.sellerSnapshot as unknown as SellerBlock,
    lines: (row.lines as unknown as StatementLine[]) || [],
    gross: Number(row.gross),
    clawbacks: Number(row.clawbacks),
    net,
    vatScheme: row.vatScheme as StatementVatScheme,
    vatRate: Number(row.vatRate),
    vatAmount,
    vatNotes: (row.vatNote || "").split("\n").filter(Boolean),
    total: round2(net + vatAmount),
    stripeTransferId: row.stripeTransferId,
    wiseTransferId: row.wiseTransferId,
    contentHash: row.contentHash,
    createdAt: row.createdAt.toISOString(),
  };
}

export function statementIntegrity(row: PartnerStatement): "ok" | "mismatch" {
  return row.contentHash && contentHash(row) === row.contentHash ? "ok" : "mismatch";
}

// ── PDF ─────────────────────────────────────────────────────────────────────
const INK = rgb(0.1, 0.1, 0.1);
const MUTED = rgb(0.42, 0.42, 0.42);
const FAINT = rgb(0.62, 0.62, 0.62);
const RULE = rgb(0.82, 0.82, 0.82);
const PANEL = rgb(0.965, 0.965, 0.965);
const BLACK = rgb(0, 0, 0);

function safe(text: string): string {
  return text
    .replace(/€/g, "EUR")
    .replace(/[–—−]/g, "-")
    .replace(/[‘’]/g, "'")
    .replace(/[“”„]/g, '"')
    .replace(/[^\u0009\u000A -~¡-ÿ]/g, "");
}
const usd = (n: number) => `${n < 0 ? "-" : ""}$${new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.abs(n))}`;
const dateEn = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" }) : "");

export async function renderStatementPdf(v: StatementView): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${v.number} - Commission statement - ${v.seller.sellerName}`);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const PAGE_W = 612;
  const PAGE_H = 792;
  const M = 56;
  const CW = PAGE_W - M * 2;
  const BOTTOM = 70;
  let page!: PDFPage;
  let y = 0;
  let pageNo = 0;
  const text = (s: string, x: number, yy: number, size: number, f: PDFFont = font, color = INK) => page.drawText(safe(s), { x, y: yy, size, font: f, color });
  const width = (s: string, size: number, f: PDFFont = font) => f.widthOfTextAtSize(safe(s), size);
  const textRight = (s: string, rx: number, yy: number, size: number, f: PDFFont = font, color = INK) => text(s, rx - width(s, size, f), yy, size, f, color);
  const rule = (x1: number, x2: number, yy: number, t = 0.6, color = RULE) => page.drawLine({ start: { x: x1, y: yy }, end: { x: x2, y: yy }, thickness: t, color });
  function wrap(s: string, size: number, f: PDFFont, maxW: number): string[] {
    const out: string[] = [];
    for (const para of safe(s).split("\n")) {
      let line = "";
      for (const w of para.split(/\s+/).filter(Boolean)) {
        const t = line ? `${line} ${w}` : w;
        if (f.widthOfTextAtSize(t, size) > maxW && line) {
          out.push(line);
          line = w;
        } else line = t;
      }
      if (line) out.push(line);
    }
    return out;
  }
  function newPage() {
    page = pdf.addPage([PAGE_W, PAGE_H]);
    pageNo++;
    if (pageNo > 1) {
      text(v.seller.sellerName.toUpperCase(), M, PAGE_H - 36, 7.5, bold, MUTED);
      textRight(`COMMISSION STATEMENT ${v.number}`, PAGE_W - M, PAGE_H - 36, 7.5, font, MUTED);
      rule(M, PAGE_W - M, PAGE_H - 44);
      y = PAGE_H - 70;
    } else y = PAGE_H - M;
  }
  const ensure = (h: number) => {
    if (y - h < BOTTOM) newPage();
  };
  newPage();

  const headTop = PAGE_H - 44;
  let logoBottom = headTop - 40;
  try {
    const logo = await pdf.embedPng(fs.readFileSync(path.join(process.cwd(), "public", "bb_logo_wordmark_subhead_BLK_PNG.png")));
    const h = 52;
    page.drawImage(logo, { x: M - 4, y: headTop - h + 6, width: (logo.width / logo.height) * h, height: h });
    logoBottom = headTop - h + 6;
  } catch {
    text("BLOK BLOK STUDIO", M, headTop - 18, 16, bold, BLACK);
  }
  textRight("COMMISSION STATEMENT", PAGE_W - M, headTop - 16, 17, bold, BLACK);
  textRight("Self-billing credit note / Gutschrift", PAGE_W - M, headTop - 30, 8.5, font, MUTED);
  textRight(v.number, PAGE_W - M, headTop - 44, 10.5, font, INK);
  y = Math.min(logoBottom, headTop - 56) - 16;
  rule(M, PAGE_W - M, y, 1, BLACK);
  y -= 20;

  // Parties
  const colRightX = M + CW * 0.56;
  const top = y;
  text("PAYEE (PARTNER)", M, y, 6.5, bold, MUTED);
  y -= 13;
  const partnerLines = [
    v.partner.legalName || v.partner.name,
    v.partner.legalName && v.partner.legalName !== v.partner.name ? v.partner.name : "",
    v.partner.contactName || "",
    ...v.partner.addressLines,
    v.partner.taxId ? `Tax ID: ${v.partner.taxId}` : "",
    v.partner.email || "",
  ].filter(Boolean);
  partnerLines.forEach((l, i) => {
    text(l, M, y, 9.5, i === 0 ? bold : font, INK);
    y -= 13;
  });
  if (!v.partner.addressLines.length) {
    text("(billing address not on file)", M, y, 8, font, FAINT);
    y -= 13;
  }
  const leftBottom = y;
  let ry = top;
  const meta: Array<[string, string]> = [
    ["Statement number", v.number],
    ["Statement date", dateEn(v.issueDate)],
  ];
  if (v.periodFrom) meta.push(["Commissions earned", v.periodFrom === v.periodTo || !v.periodTo ? dateEn(v.periodFrom) : `${dateEn(v.periodFrom)} - ${dateEn(v.periodTo)}`]);
  if (v.stripeTransferId) meta.push(["Paid by Stripe transfer", v.stripeTransferId]);
  if (v.wiseTransferId) meta.push(["Paid by Wise transfer", v.wiseTransferId]);
  for (const [k, val] of meta) {
    text(k, colRightX, ry, 8, font, MUTED);
    textRight(val, PAGE_W - M, ry, 8.5, bold, INK);
    ry -= 13;
  }
  ry -= 6;
  text("ISSUED BY (PAYER)", colRightX, ry, 6.5, bold, MUTED);
  ry -= 12;
  for (const l of [v.seller.sellerName, v.seller.contactName, ...v.seller.addressLines, v.seller.steuernummer ? `Steuernummer ${v.seller.steuernummer}` : "", v.seller.ustIdNr ? `USt-IdNr. ${v.seller.ustIdNr}` : "", v.seller.email].filter(Boolean)) {
    text(l, colRightX, ry, 8, l === v.seller.sellerName ? bold : font, l === v.seller.sellerName ? INK : MUTED);
    ry -= 10.5;
  }
  y = Math.min(leftBottom, ry) - 18;

  // Lines
  const cDate = M;
  const cDesc = M + 62;
  const cBasisR = M + CW * 0.68;
  const cRateR = M + CW * 0.80;
  const cAmtR = PAGE_W - M;
  const descW = cBasisR - 70 - cDesc;
  function header() {
    ensure(30);
    text("Earned", cDate, y, 7.5, bold, MUTED);
    text("Practice / commission", cDesc, y, 7.5, bold, MUTED);
    textRight("Basis", cBasisR, y, 7.5, bold, MUTED);
    textRight("Rate", cRateR, y, 7.5, bold, MUTED);
    textRight("Amount", cAmtR, y, 7.5, bold, MUTED);
    y -= 6;
    rule(M, PAGE_W - M, y, 0.8, BLACK);
    y -= 14;
  }
  header();
  for (const l of v.lines) {
    const lines = wrap(`${l.client}: ${l.description}`, 9, font, descW);
    const h = lines.length * 12 + 5;
    if (y - h < BOTTOM) {
      newPage();
      header();
    }
    text(dateEn(l.eventAt), cDate, y, 8.5, font, MUTED);
    lines.forEach((t, i) => text(t, cDesc, y - i * 12, 9, font, INK));
    textRight(l.kind === "ADJUSTMENT" ? "-" : usd(l.basisAmount), cBasisR, y, 9, font, INK);
    textRight(l.kind === "ADJUSTMENT" ? "-" : `${l.rate}%`, cRateR, y, 9, font, INK);
    textRight(usd(l.amount), cAmtR, y, 9, font, INK);
    y -= h;
    rule(M, PAGE_W - M, y + 4, 0.4);
    y -= 5;
  }

  // Totals
  ensure(100);
  const lx = cRateR - 150;
  const totalRows: Array<[string, string, boolean]> = [
    ["Commissions earned", usd(v.gross), false],
    ...(v.clawbacks !== 0 ? ([["Reversals / clawbacks", usd(v.clawbacks), false]] as Array<[string, string, boolean]>) : []),
    ["Net commission", usd(v.net), false],
    ...(v.vatRate > 0 ? ([[`VAT ${v.vatRate}%`, usd(v.vatAmount), false]] as Array<[string, string, boolean]>) : []),
  ];
  for (const [k, val] of totalRows) {
    text(k, lx, y, 9, font, MUTED);
    textRight(val, cAmtR, y, 9, font, INK);
    y -= 15;
  }
  y -= 2;
  rule(lx, cAmtR, y, 0.8, BLACK);
  y -= 15;
  text("Total paid to partner", lx, y, 11, bold, BLACK);
  textRight(usd(v.total), cAmtR, y, 12, bold, BLACK);
  y -= 22;
  for (const n of v.vatNotes) {
    for (const l of wrap(n, 8, font, CW)) {
      ensure(11);
      text(l, M, y, 8, font, MUTED);
      y -= 11;
    }
  }
  y -= 12;

  // Settlement panel
  ensure(70);
  const ph = 58;
  page.drawRectangle({ x: M, y: y - ph, width: CW, height: ph, color: PANEL, borderColor: RULE, borderWidth: 0.5 });
  text("SETTLEMENT", M + 14, y - 18, 7.5, bold, BLACK);
  const settle = v.stripeTransferId
    ? `Paid in full on ${dateEn(v.issueDate)} by Stripe Connect transfer ${v.stripeTransferId} to the partner's connected account. No payment is due from either side.`
    : v.wiseTransferId
      ? `Paid in full on ${dateEn(v.issueDate)} by Wise transfer ${v.wiseTransferId} to the partner's bank account. No payment is due from either side.`
      : `Paid on ${dateEn(v.issueDate)}. No payment is due from either side.`;
  wrap(settle, 8.5, font, CW - 28).forEach((l, i) => text(l, M + 14, y - 33 - i * 11, 8.5, font, INK));
  y -= ph + 16;
  for (const l of wrap("This statement is issued by Blok Blok Studio LLC on behalf of the partner under the self-billing clause of the Sales Partnership Agreement. It is accepted unless the partner objects in writing within 14 days. Keep it with your records; it is the invoice for the commission it lists.", 7.5, font, CW)) {
    ensure(10);
    text(l, M, y, 7.5, font, FAINT);
    y -= 10;
  }

  const pages = pdf.getPages();
  pages.forEach((p, i) => {
    page = p;
    rule(M, PAGE_W - M, 46, 0.5);
    text(`${v.seller.sellerName}  ·  ${v.seller.addressLines.join(", ")}`, M, 34, 6.5, font, MUTED);
    text([v.seller.steuernummer ? `Steuernummer ${v.seller.steuernummer}` : "", v.seller.email, v.seller.website].filter(Boolean).join("  ·  "), M, 24, 6.5, font, FAINT);
    textRight(`Page ${i + 1} of ${pages.length}`, PAGE_W - M, 34, 6.5, font, MUTED);
    if (v.contentHash) textRight(`sha256 ${v.contentHash.slice(0, 20)}`, PAGE_W - M, 24, 6, font, FAINT);
  });
  return pdf.save();
}
