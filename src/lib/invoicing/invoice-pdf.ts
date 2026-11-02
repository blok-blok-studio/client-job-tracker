import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb, degrees } from "pdf-lib";
import fs from "fs";
import path from "path";
import type { InvoiceView } from "./types";
import { LABELS } from "./types";
import { formatDate, formatMoneyPdf, formatQty } from "./money";
import { qrPng } from "./epc-qr";

// Studio invoice PDF. Black and white only (brand rule for invoices): the
// wordmark, grey rules, and one QR code. German invoices come out on A4 in
// German, US invoices on Letter in English, EU invoices on A4 in English.

const BLACK = rgb(0, 0, 0);
const INK = rgb(0.1, 0.1, 0.1);
const MUTED = rgb(0.42, 0.42, 0.42);
const FAINT = rgb(0.62, 0.62, 0.62);
const RULE = rgb(0.82, 0.82, 0.82);
const PANEL = rgb(0.965, 0.965, 0.965);

/**
 * pdf-lib's standard fonts are WinAnsi: umlauts, ß and § are fine, emoji and
 * dashes beyond "-" are not. Map what we can, drop the rest, and spell out the
 * euro (Helvetica draws "€" over the next glyph).
 */
function safe(text: string): string {
  return text
    .replace(/€/g, "EUR")
    .replace(/[–—−]/g, "-")
    .replace(/[‘’‚]/g, "'")
    .replace(/[“”„]/g, '"')
    .replace(/…/g, "...")
    .replace(/ /g, " ")
    .replace(/[^\u0009\u000A -~¡-ÿ]/g, "");
}

function groupIban(iban: string): string {
  return iban.replace(/\s+/g, "").replace(/(.{4})/g, "$1 ").trim();
}

export async function renderInvoicePdf(view: InvoiceView): Promise<Uint8Array> {
  const L = LABELS[view.language];
  const lang = view.language;
  const cur = view.currency;
  const money = (n: number) => formatMoneyPdf(n, cur, lang);

  const pdf = await PDFDocument.create();
  pdf.setTitle(`${view.number || L.draft} - ${view.seller.sellerName}`);
  pdf.setAuthor(view.seller.sellerName);
  pdf.setCreator("Blok Blok Command Center");
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const mono = await pdf.embedFont(StandardFonts.Courier);

  const A4 = view.template === "US" ? false : true;
  const PAGE_W = A4 ? 595.28 : 612;
  const PAGE_H = A4 ? 841.89 : 792;
  const M = 56;
  const CW = PAGE_W - M * 2;
  const BOTTOM = 70;

  let page!: PDFPage;
  let y = 0;
  let pageNo = 0;

  const text = (s: string, x: number, yy: number, size: number, f: PDFFont = font, color = INK) => {
    page.drawText(safe(s), { x, y: yy, size, font: f, color });
  };
  const width = (s: string, size: number, f: PDFFont = font) => f.widthOfTextAtSize(safe(s), size);
  const textRight = (s: string, rightX: number, yy: number, size: number, f: PDFFont = font, color = INK) => {
    text(s, rightX - width(s, size, f), yy, size, f, color);
  };
  const rule = (x1: number, x2: number, yy: number, thickness = 0.6, color = RULE) => {
    page.drawLine({ start: { x: x1, y: yy }, end: { x: x2, y: yy }, thickness, color });
  };

  function wrap(s: string, size: number, f: PDFFont, maxW: number): string[] {
    const out: string[] = [];
    for (const para of safe(s).split("\n")) {
      const words = para.split(/\s+/).filter(Boolean);
      if (!words.length) {
        out.push("");
        continue;
      }
      let line = "";
      for (const w of words) {
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
      text(view.seller.sellerName.toUpperCase(), M, PAGE_H - 36, 7.5, bold, MUTED);
      textRight(`${L.invoice} ${view.number || L.draft}`, PAGE_W - M, PAGE_H - 36, 7.5, font, MUTED);
      rule(M, PAGE_W - M, PAGE_H - 44);
      y = PAGE_H - 70;
    } else {
      y = PAGE_H - M;
    }
  }
  function ensure(h: number) {
    if (y - h < BOTTOM) newPage();
  }

  newPage();

  // ── Letterhead ─────────────────────────────────────────────────
  const headTop = PAGE_H - 44;
  let logoBottom = headTop - 40;
  try {
    const logoBytes = fs.readFileSync(path.join(process.cwd(), "public", "bb_logo_wordmark_subhead_BLK_PNG.png"));
    const logo = await pdf.embedPng(logoBytes);
    const h = 52;
    const w = (logo.width / logo.height) * h;
    page.drawImage(logo, { x: M - 4, y: headTop - h + 6, width: w, height: h });
    logoBottom = headTop - h + 6;
  } catch {
    text("BLOK BLOK STUDIO", M, headTop - 18, 16, bold, BLACK);
    logoBottom = headTop - 30;
  }

  // Title + number on the right
  const titleSize = 22;
  textRight(L.invoice, PAGE_W - M, headTop - 18, titleSize, bold, BLACK);
  textRight(view.number || L.draft, PAGE_W - M, headTop - 34, 10.5, font, INK);
  if (view.status === "PAID" && view.paidAt) {
    textRight(`${L.paid} · ${formatDate(view.paidAt, lang)}`, PAGE_W - M, headTop - 48, 8, bold, MUTED);
  }

  y = Math.min(logoBottom, headTop - 56) - 16;
  rule(M, PAGE_W - M, y, 1, BLACK);
  y -= 20;

  // ── Addresses + meta ───────────────────────────────────────────
  const colRightX = M + CW * 0.56;
  const topBlocks = y;

  // Sender line (window-envelope style) above the recipient
  const senderLine = [view.seller.sellerName, ...view.seller.addressLines].join(" · ");
  text(senderLine, M, y, 6.5, font, FAINT);
  rule(M, colRightX - 24, y - 4, 0.4);
  y -= 18;
  text(L.billTo.toUpperCase(), M, y, 6.5, bold, MUTED);
  y -= 13;
  const billLines: Array<[string, PDFFont]> = [];
  if (view.billTo.company) billLines.push([view.billTo.company, bold]);
  if (view.billTo.name && view.billTo.name !== view.billTo.company) billLines.push([view.billTo.name, view.billTo.company ? font : bold]);
  for (const l of view.billTo.addressLines) billLines.push([l, font]);
  if (view.billTo.email) billLines.push([view.billTo.email, font]);
  if (view.billTo.vatId) billLines.push([`${L.clientVatId}: ${view.billTo.vatId}`, font]);
  for (const [l, f] of billLines) {
    for (const wl of wrap(l, 9.5, f, colRightX - 24 - M)) {
      text(wl, M, y, 9.5, f, INK);
      y -= 13;
    }
  }
  const leftBottom = y;

  // Meta table on the right
  let ry = topBlocks;
  const metaRows: Array<[string, string]> = [[L.invoiceNumber, view.number || L.draft]];
  if (view.issueDate) metaRows.push([L.issueDate, formatDate(view.issueDate, lang)]);
  if (view.serviceDateFrom && view.serviceDateTo && view.serviceDateFrom !== view.serviceDateTo) {
    metaRows.push([L.servicePeriod, `${formatDate(view.serviceDateFrom, lang)} - ${formatDate(view.serviceDateTo, lang)}`]);
  } else if (view.serviceDateFrom || view.serviceDateTo) {
    metaRows.push([L.serviceDate, formatDate(view.serviceDateFrom || view.serviceDateTo, lang)]);
  }
  if (view.dueDate) metaRows.push([L.dueDate, formatDate(view.dueDate, lang)]);
  for (const [k, v] of metaRows) {
    text(k, colRightX, ry, 8, font, MUTED);
    textRight(v, PAGE_W - M, ry, 9, bold, INK);
    ry -= 13;
  }
  ry -= 6;
  text(L.from.toUpperCase(), colRightX, ry, 6.5, bold, MUTED);
  ry -= 12;
  const sellerLines = [
    view.seller.sellerName,
    view.seller.contactName,
    ...view.seller.addressLines,
    view.seller.steuernummer ? `${L.taxNumber}: ${view.seller.steuernummer}` : "",
    view.seller.ustIdNr ? `${L.vatId}: ${view.seller.ustIdNr}` : "",
    view.seller.email,
    view.seller.website,
  ].filter(Boolean);
  for (const l of sellerLines) {
    text(l, colRightX, ry, 8, l === view.seller.sellerName ? bold : font, l === view.seller.sellerName ? INK : MUTED);
    ry -= 10.5;
  }

  y = Math.min(leftBottom, ry) - 18;

  // ── Line items ─────────────────────────────────────────────────
  const cPos = M;
  const cDesc = M + 26;
  const cQtyR = M + CW * 0.66;
  const cUnitR = M + CW * 0.83;
  const cTotR = PAGE_W - M;
  const descW = cQtyR - 44 - cDesc;

  function tableHeader() {
    ensure(30);
    text(L.pos, cPos, y, 7.5, bold, MUTED);
    text(L.description, cDesc, y, 7.5, bold, MUTED);
    textRight(L.qty, cQtyR, y, 7.5, bold, MUTED);
    textRight(L.unitPrice, cUnitR, y, 7.5, bold, MUTED);
    textRight(L.lineTotal, cTotR, y, 7.5, bold, MUTED);
    y -= 6;
    rule(M, PAGE_W - M, y, 0.8, BLACK);
    y -= 14;
  }
  tableHeader();

  view.items.forEach((it, i) => {
    const lines = wrap(it.description || "-", 9.5, font, descW);
    const h = Math.max(1, lines.length) * 13 + 5;
    if (y - h < BOTTOM) {
      newPage();
      tableHeader();
    }
    text(String(i + 1), cPos, y, 9, font, MUTED);
    lines.forEach((l, li) => text(l, cDesc, y - li * 13, 9.5, font, INK));
    textRight(formatQty(it.qty, lang), cQtyR, y, 9.5, font, INK);
    textRight(money(it.unitPrice), cUnitR, y, 9.5, font, INK);
    textRight(money(it.lineTotal), cTotR, y, 9.5, font, INK);
    y -= h;
    rule(M, PAGE_W - M, y + 4, 0.4);
    y -= 5;
  });

  // ── Totals ─────────────────────────────────────────────────────
  ensure(90);
  y -= 2;
  const totLabelX = cUnitR - 150;
  text(L.subtotal, totLabelX, y, 9, font, MUTED);
  textRight(money(view.subtotal), cTotR, y, 9, font, INK);
  y -= 15;
  const vatLabel = `${L.vat} ${view.vatRate % 1 === 0 ? view.vatRate.toFixed(0) : view.vatRate.toFixed(1)} %`;
  text(vatLabel, totLabelX, y, 9, font, MUTED);
  textRight(money(view.vatAmount), cTotR, y, 9, font, INK);
  y -= 10;
  rule(totLabelX, cTotR, y, 0.8, BLACK);
  y -= 15;
  text(L.totalDue, totLabelX, y, 11, bold, BLACK);
  textRight(money(view.total), cTotR, y, 12, bold, BLACK);
  y -= 20;

  for (const n of view.vatNotes) {
    for (const l of wrap(n, 8, font, CW)) {
      ensure(11);
      text(l, M, y, 8, font, MUTED);
      y -= 11;
    }
  }
  y -= 10;

  // ── Payment panel ──────────────────────────────────────────────
  const isCard = view.paymentMethod === "STRIPE" && !!view.paymentUrl;
  const rows: Array<[string, string, boolean]> = []; // label, value, mono
  if (isCard) {
    rows.push([L.cardHint, "", false]);
    rows.push(["", view.paymentUrl!, true]);
  } else if (cur === "EUR" && view.seller.eur) {
    const b = view.seller.eur;
    rows.push([L.holder, b.holder || view.seller.sellerName, false]);
    if (b.iban) rows.push([L.iban, groupIban(b.iban), true]);
    if (b.bic) rows.push([L.bic, b.bic, true]);
    if (b.bank) rows.push([L.bank, b.bank, false]);
  } else if (view.seller.usd) {
    const b = view.seller.usd;
    rows.push([L.holder, b.holder || view.seller.sellerName, false]);
    if (b.bank) rows.push([L.bank, b.bank, false]);
    if (b.routing) rows.push([L.routing, b.routing, true]);
    if (b.account) rows.push([L.account, b.account, true]);
    if (b.swift) rows.push([L.swift, b.swift, true]);
    if (b.bankAddress) rows.push(["", b.bankAddress, false]);
    if (view.seller.wisePayLink) rows.push(["Wise", view.seller.wisePayLink, true]);
  }
  rows.push([L.reference, view.number || "-", false]);

  const qrSize = view.qrPayload ? 108 : 0;
  const panelPad = 14;
  const rowH = 12.5;
  const panelH = Math.max(panelPad * 2 + 20 + rows.length * rowH + (view.dueDate ? 16 : 0), qrSize ? qrSize + panelPad * 2 + 22 : 0);
  ensure(panelH + 10);
  const panelTop = y;
  page.drawRectangle({ x: M, y: panelTop - panelH, width: CW, height: panelH, color: PANEL, borderColor: RULE, borderWidth: 0.5 });

  let py = panelTop - panelPad - 8;
  text((isCard ? L.paymentTitleCard : L.paymentTitle).toUpperCase(), M + panelPad, py, 7.5, bold, BLACK);
  py -= 16;
  const valX = M + panelPad + 112;
  const textMaxW = (qrSize ? CW - qrSize - panelPad * 3 : CW - panelPad * 2) - 112;
  for (const [k, v, isMono] of rows) {
    if (k) text(k, M + panelPad, py, 8, font, MUTED);
    const f = isMono ? mono : k === L.reference ? bold : font;
    const vLines = wrap(v, 8.5, f, Math.max(80, textMaxW));
    vLines.forEach((l, i) => text(l, k ? valX : M + panelPad, py - i * 11, 8.5, f, INK));
    py -= rowH + (vLines.length - 1) * 11;
  }
  if (view.dueDate) {
    py -= 3;
    text(`${L.payBy} ${formatDate(view.dueDate, lang)}.`, M + panelPad, py, 8, font, INK);
  }

  if (view.qrPayload && qrSize) {
    try {
      const png = await pdf.embedPng(await qrPng(view.qrPayload, 512));
      const qx = PAGE_W - M - panelPad - qrSize;
      const qy = panelTop - panelPad - qrSize;
      page.drawImage(png, { x: qx, y: qy, width: qrSize, height: qrSize });
      const cap = view.qrKind === "EPC" ? L.qrCaption : L.qrCaptionUrl;
      const capLines = wrap(cap, 6.5, font, qrSize + 30);
      capLines.forEach((l, i) => textRight(l, qx + qrSize, qy - 9 - i * 8, 6.5, font, MUTED));
    } catch {
      // QR failed — the bank details above still carry the payment
    }
  }
  y = panelTop - panelH - 16;

  // ── Notes ──────────────────────────────────────────────────────
  if (view.notes?.trim()) {
    ensure(30);
    text(L.notes.toUpperCase(), M, y, 6.5, bold, MUTED);
    y -= 12;
    for (const l of wrap(view.notes, 8.5, font, CW)) {
      ensure(12);
      text(l, M, y, 8.5, font, INK);
      y -= 12;
    }
    y -= 8;
  }
  // Closing line only when it fits: never start a page for a thank-you
  if (y - 14 >= BOTTOM) text(L.thanks, M, y, 8.5, font, MUTED);

  // ── Stamps ─────────────────────────────────────────────────────
  if (view.status === "VOID" || view.status === "DRAFT") {
    const stamp = view.status === "VOID" ? L.void : L.draft;
    const first = pdf.getPages()[0];
    const size = 64;
    const w = bold.widthOfTextAtSize(stamp, size);
    first.drawText(stamp, {
      x: PAGE_W / 2 - w / 2 + 60,
      y: PAGE_H / 2 - 120,
      size,
      font: bold,
      color: rgb(0.75, 0.75, 0.75),
      opacity: 0.35,
      rotate: degrees(28),
    });
  }

  // ── Footer on every page ───────────────────────────────────────
  const footer = [
    view.seller.sellerName,
    view.seller.addressLines.join(", "),
    view.seller.steuernummer ? `${L.taxNumber} ${view.seller.steuernummer}` : "",
    view.seller.ustIdNr ? `${L.vatId} ${view.seller.ustIdNr}` : "",
    view.seller.email,
    view.seller.website,
  ].filter(Boolean);
  const pages = pdf.getPages();
  pages.forEach((p, i) => {
    page = p;
    rule(M, PAGE_W - M, 46, 0.5);
    const line1 = footer.slice(0, 2).join("  ·  ");
    const line2 = footer.slice(2).join("  ·  ");
    text(line1, M, 34, 6.5, font, MUTED);
    text(line2, M, 24, 6.5, font, FAINT);
    textRight(`${L.page} ${i + 1} ${L.of} ${pages.length}`, PAGE_W - M, 34, 6.5, font, MUTED);
  });

  return pdf.save();
}
