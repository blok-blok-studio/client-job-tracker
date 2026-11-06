import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb, degrees } from "pdf-lib";
import fs from "fs";
import path from "path";
import type { InvoiceView } from "./types";
import { LABELS } from "./types";
import { formatDate, formatMoneyPdf, formatQty } from "./money";
import { qrPng } from "./epc-qr";
import { paysViaWiseOnly } from "./settings-core";

// Studio invoice PDF: the big wordmark, the brand blues on band and rules, and
// one QR code that stays black on white so banking apps can read it. German invoices come out on A4 in
// German, US invoices on Letter in English, EU invoices on A4 in English.

const BLUE1 = rgb(0.145, 0.38, 0.847); // #2561D8
const BLUE2 = rgb(0.008, 0.031, 0.529); // #020887
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

export interface RenderOptions {
  /** QUOTE renders an Angebot from an InvoiceView-shaped object */
  docType?: "INVOICE" | "CORRECTION" | "QUOTE";
  validUntil?: string | null;
  schedule?: Array<{ label: string; percent: number }> | null;
  acceptUrl?: string | null;
}

export async function renderInvoicePdf(view: InvoiceView, opts: RenderOptions = {}): Promise<Uint8Array> {
  const docType = opts.docType || (view.kind === "CORRECTION" ? "CORRECTION" : "INVOICE");
  const L = LABELS[view.language];
  const TITLE = docType === "CORRECTION" ? L.correction : docType === "QUOTE" ? L.quote : L.invoice;
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
    page.drawRectangle({ x: 0, y: PAGE_H - 8, width: PAGE_W, height: 8, color: BLUE2 });
    page.drawRectangle({ x: 0, y: PAGE_H - 8, width: PAGE_W * 0.34, height: 8, color: BLUE1 });
    if (pageNo > 1) {
      text(view.seller.sellerName.toUpperCase(), M, PAGE_H - 36, 7.5, bold, MUTED);
      textRight(`${TITLE} ${view.number || L.draft}`, PAGE_W - M, PAGE_H - 36, 7.5, font, MUTED);
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
  const headTop = PAGE_H - 34;
  let logoBottom = headTop - 40;
  try {
    const logoBytes = fs.readFileSync(path.join(process.cwd(), "public", "bb_logo_wordmark_subhead_BLK_PNG.png"));
    const logo = await pdf.embedPng(logoBytes);
    const h = 76;
    const w = (logo.width / logo.height) * h;
    page.drawImage(logo, { x: M - 4, y: headTop - h + 6, width: w, height: h });
    logoBottom = headTop - h + 6;
  } catch {
    text("BLOK BLOK STUDIO", M, headTop - 18, 16, bold, BLACK);
    logoBottom = headTop - 30;
  }

  // Title + number on the right
  const titleSize = TITLE.length > 14 ? 16 : 22;
  textRight(TITLE, PAGE_W - M, headTop - 18, titleSize, bold, BLUE2);
  textRight(view.number || L.draft, PAGE_W - M, headTop - 34, 10.5, font, INK);
  if (view.status === "PAID" && view.paidAt && docType === "INVOICE") {
    textRight(`${L.paid} · ${formatDate(view.paidAt, lang)}`, PAGE_W - M, headTop - 48, 8, bold, MUTED);
  }

  y = Math.min(logoBottom, headTop - 56) - 12;
  rule(M, PAGE_W - M, y, 1.5, BLUE2);
  y -= 20;

  // ── Addresses + meta ───────────────────────────────────────────
  const colRightX = M + CW * 0.56;
  const topBlocks = y;

  // Sender line (window-envelope style) above the recipient
  // Must stay inside the left column: drop trailing address lines (country first),
  // then shrink the type, so a long seller name never runs into the meta block
  const senderMax = colRightX - 24 - M;
  const senderParts = [view.seller.sellerName, ...view.seller.addressLines];
  let senderLine = senderParts.join(" · ");
  while (width(senderLine, 6.5, font) > senderMax && senderParts.length > 2) {
    senderParts.pop();
    senderLine = senderParts.join(" · ");
  }
  const senderSize = Math.max(5, Math.min(6.5, (6.5 * senderMax) / Math.max(1, width(senderLine, 6.5, font))));
  text(senderLine, M, y, senderSize, font, FAINT);
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
  const metaRows: Array<[string, string]> = [[docType === "QUOTE" ? L.quoteNumber : L.invoiceNumber, view.number || L.draft]];
  if (view.issueDate) metaRows.push([docType === "QUOTE" ? L.quoteDate : L.issueDate, formatDate(view.issueDate, lang)]);
  if (docType === "QUOTE" && opts.validUntil) metaRows.push([L.validUntil, formatDate(opts.validUntil, lang)]);
  if (docType === "CORRECTION" && view.corrects) metaRows.push([L.correctionOf, `${view.corrects.number || ""}${view.corrects.issueDate ? ` (${formatDate(view.corrects.issueDate, lang)})` : ""}`]);
  if (view.serviceDateFrom && view.serviceDateTo && view.serviceDateFrom !== view.serviceDateTo) {
    metaRows.push([L.servicePeriod, `${formatDate(view.serviceDateFrom, lang)} - ${formatDate(view.serviceDateTo, lang)}`]);
  } else if (view.serviceDateFrom || view.serviceDateTo) {
    metaRows.push([L.serviceDate, formatDate(view.serviceDateFrom || view.serviceDateTo, lang)]);
  }
  if (view.dueDate && docType === "INVOICE") metaRows.push([L.dueDate, formatDate(view.dueDate, lang)]);
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
    rule(M, PAGE_W - M, y, 1, BLUE1);
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
  rule(totLabelX, cTotR, y, 1, BLUE1);
  y -= 15;
  text(docType === "INVOICE" && view.status !== "PAID" && view.status !== "VOID" ? L.totalDue : L.total, totLabelX, y, 11, bold, BLUE2);
  textRight(money(view.total), cTotR, y, 12, bold, BLUE2);
  y -= 20;

  for (const n of view.vatNotes) {
    for (const l of wrap(n, 8, font, CW)) {
      ensure(11);
      text(l, M, y, 8, font, MUTED);
      y -= 11;
    }
  }
  y -= 10;

  // ── Correction / quote closing blocks instead of a payment panel ─
  if (docType === "CORRECTION") {
    for (const l of wrap(`${L.correctionNote}${view.paidAt && view.eurAmount != null && view.eurAmount < 0 ? ` ${L.refundNote}` : ""}`, 9, font, CW)) {
      ensure(13);
      text(l, M, y, 9, font, INK);
      y -= 13;
    }
    y -= 10;
  }
  if (docType === "QUOTE") {
    if (opts.schedule?.length) {
      ensure(20 + opts.schedule.length * 12);
      text(L.schedule.toUpperCase(), M, y, 6.5, bold, MUTED);
      y -= 12;
      for (const st of opts.schedule) {
        text(`${st.percent}%  ·  ${st.label}  ·  ${money(Math.round(view.total * st.percent) / 100)}`, M, y, 9, font, INK);
        y -= 12;
      }
      y -= 6;
    }
    if (opts.acceptUrl) {
      ensure(26);
      text(L.acceptHint, M, y, 8.5, font, MUTED);
      y -= 12;
      text(opts.acceptUrl, M, y, 8.5, mono, INK);
      y -= 16;
    }
  }

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
  } else if (paysViaWiseOnly(view.seller, cur)) {
    rows.push([L.holder, (cur === "USD" && view.seller.usd?.holder) || view.seller.otherBanks?.find((x) => x.currency === cur)?.holder || view.seller.sellerName, false]);
    rows.push(["Pay via Wise", view.seller.wisePayLink, true]);
  } else if (cur !== "USD" && view.seller.otherBanks?.some((b) => b.currency === cur)) {
    const b = view.seller.otherBanks.find((x) => x.currency === cur)!;
    rows.push([L.holder, b.holder || view.seller.sellerName, false]);
    if (b.bank) rows.push([L.bank, b.bank, false]);
    for (const l of b.lines) rows.push([l.label, l.value, /\d/.test(l.value)]);
  } else if (cur === "USD" && view.seller.usd) {
    const b = view.seller.usd;
    rows.push([L.holder, b.holder || view.seller.sellerName, false]);
    if (b.bank) rows.push([L.bank, b.bank, false]);
    if (b.routing) rows.push([L.routing, b.routing, true]);
    if (b.account) rows.push([L.account, b.account, true]);
    if (b.swift) rows.push([L.swift, b.swift, true]);
    if (b.bankAddress) rows.push(["", b.bankAddress, false]);
  }
  rows.push([L.reference, view.number || "-", false]);

  // Nothing left to pay: a paid or voided invoice stops printing account numbers and QR codes
  if (docType === "INVOICE" && view.status !== "PAID" && view.status !== "VOID") {
  // Bank QR on the left, Wise on the right, bank details between them, so
  // each payer finds "their" code at a glance; a single QR sits on the right.
  const qrs = [...view.qrs.slice(0, 2)].sort((a, b) => (a.kind === "WISE" ? 1 : 0) - (b.kind === "WISE" ? 1 : 0));
  const qrCount = qrs.length;
  const qrSize = qrCount === 2 ? 84 : qrCount ? 100 : 0;
  const colW = qrCount === 2 ? 100 : qrCount ? 128 : 0;
  const panelPad = 14;
  const rowH = 12.5;
  const qrTitle = (k: string) => (k === "EPC" ? L.qrEpcTitle : k === "WISE" ? L.qrWiseTitle : k === "CARD" ? L.qrCardTitle : L.qrPageTitle);
  const qrHint = (k: string) => (k === "EPC" ? L.qrEpcHint : k === "WISE" ? L.qrWiseHint : L.qrPageHint);
  const titleLines = qrs.map((q) => wrap(qrTitle(q.kind), 9.5, bold, colW - 6));
  const hintLines = qrs.map((q) => wrap(qrHint(q.kind), 6.5, font, colW - 6));
  const maxTitle = Math.max(0, ...titleLines.map((l) => l.length));
  const maxHint = Math.max(0, ...hintLines.map((l) => l.length));
  const qrColH = qrCount ? maxTitle * 11.5 + 4 + qrSize + 6 + maxHint * 8.5 + (qrs.some((q) => q.kind === "WISE") ? 22 : 0) : 0;
  const leftCol = qrCount === 2 ? colW + panelPad : 0;
  const rightCol = qrCount ? colW + panelPad : 0;
  const textX = M + panelPad + leftCol;
  const panelH = Math.max(panelPad * 2 + 20 + rows.length * rowH + (view.dueDate ? 16 : 0), qrColH + panelPad * 2);
  ensure(panelH + 10);
  const panelTop = y;
  page.drawRectangle({ x: M, y: panelTop - panelH, width: CW, height: panelH, color: PANEL, borderColor: RULE, borderWidth: 0.5 });
  // Divider lines set the QR columns apart from the bank details
  if (qrCount === 2) page.drawLine({ start: { x: textX - panelPad / 2, y: panelTop - panelPad }, end: { x: textX - panelPad / 2, y: panelTop - panelH + panelPad }, thickness: 0.5, color: RULE });
  if (qrCount) page.drawLine({ start: { x: PAGE_W - M - rightCol - panelPad / 2, y: panelTop - panelPad }, end: { x: PAGE_W - M - rightCol - panelPad / 2, y: panelTop - panelH + panelPad }, thickness: 0.5, color: RULE });

  let py = panelTop - panelPad - 8;
  text((isCard ? L.paymentTitleCard : L.paymentTitle).toUpperCase(), textX, py, 7.5, bold, BLUE2);
  py -= 16;
  // Label column as wide as its longest label, so values never collide with it
  const labelW = Math.max(60, ...rows.filter(([k]) => k).map(([k]) => width(k, 8, font) + 8));
  const valX = textX + labelW;
  const textMaxW = CW - panelPad * 2 - leftCol - rightCol - labelW;
  for (const [k, v, isMono] of rows) {
    if (k) text(k, textX, py, 8, font, MUTED);
    const f = isMono ? mono : k === L.reference ? bold : font;
    const vLines = wrap(v, 8.5, f, Math.max(80, textMaxW));
    vLines.forEach((l, i) => text(l, k ? valX : textX, py - i * 11, 8.5, f, INK));
    py -= rowH + (vLines.length - 1) * 11;
  }
  if (view.dueDate) {
    py -= 3;
    for (const l of wrap(`${L.payBy} ${formatDate(view.dueDate, lang)}.`, 8, font, CW - panelPad * 2 - leftCol - rightCol)) {
      text(l, textX, py, 8, font, INK);
      py -= 10;
    }
  }

  for (let i = 0; i < qrCount; i++) {
    const q = qrs[i];
    const colX = qrCount === 2 && i === 0 ? M + panelPad : PAGE_W - M - panelPad - colW;
    const cx = colX + colW / 2;
    const color = q.kind === "WISE" ? BLUE1 : BLUE2;
    let ty = panelTop - panelPad - 8;
    for (const l of titleLines[i]) {
      const tw = width(l, 9.5, bold);
      text(l, cx - tw / 2, ty, 9.5, bold, color);
      ty -= 11.5;
    }
    const qy = panelTop - panelPad - maxTitle * 11.5 - 4 - qrSize;
    try {
      const png = await pdf.embedPng(await qrPng(q.payload, 512));
      page.drawRectangle({ x: cx - qrSize / 2 - 3, y: qy - 3, width: qrSize + 6, height: qrSize + 6, color: rgb(1, 1, 1), borderColor: color, borderWidth: 1.2 });
      page.drawImage(png, { x: cx - qrSize / 2, y: qy, width: qrSize, height: qrSize });
      let hy = qy - 12;
      for (const l of hintLines[i]) {
        const hw = width(l, 6.5, font);
        text(l, cx - hw / 2, hy, 6.5, font, MUTED);
        hy -= 8.5;
      }
      // Wise links do not carry the amount: print exactly what to type in
      if (q.kind === "WISE") {
        hy -= 2;
        const amt = money(view.total);
        const aw = width(amt, 8.5, bold);
        text(amt, cx - aw / 2, hy, 8.5, bold, INK);
        const ref = view.number || "";
        const rw = width(ref, 8, bold);
        text(ref, cx - rw / 2, hy - 11, 8, bold, INK);
      }
    } catch {
      // QR failed: the bank details beside it still carry the payment
    }
  }
  y = panelTop - panelH - 16;
  }

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
