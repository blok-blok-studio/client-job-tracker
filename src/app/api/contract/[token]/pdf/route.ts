import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from "pdf-lib";
import fs from "fs";
import path from "path";

// Brand palette — matches blokblokstudio.com (Tailwind orange-500 accent on
// black with the site's neutral gray scale)
const ORANGE = rgb(0.976, 0.451, 0.086); // #f97316 (orange-500)
const BLACK = rgb(0.039, 0.039, 0.039); // #0a0a0a (gray-950)
const DARK_TEXT = rgb(0.09, 0.09, 0.09); // #171717 (gray-900)
const BODY_TEXT = rgb(0.149, 0.149, 0.149); // #262626 (gray-800)
const MUTED = rgb(0.451, 0.451, 0.451); // #737373 (gray-500)
const FAINT = rgb(0.639, 0.639, 0.639); // #a3a3a3 (gray-400)
const LIGHT_BORDER = rgb(0.898, 0.898, 0.898); // #e5e5e5 (gray-200)
const PANEL_BG = rgb(0.98, 0.98, 0.98); // #fafafa (gray-50)

// GET — Download signed contract as PDF
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;

    const contract = await prisma.contractSignature.findUnique({
      where: { token },
      include: {
        client: { select: { name: true, company: true } },
      },
    });

    if (!contract) {
      return NextResponse.json(
        { success: false, error: "Contract not found" },
        { status: 404 }
      );
    }

    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);
    const fontItalic = await pdf.embedFont(StandardFonts.HelveticaOblique);
    const fontMono = await pdf.embedFont(StandardFonts.Courier);

    const PAGE_WIDTH = 612; // Letter
    const PAGE_HEIGHT = 792;
    const MARGIN = 64;
    const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
    const BOTTOM_LIMIT = MARGIN + 28; // keep clear of the per-page footer
    const FONT_SIZE = 9.5;
    const LINE_HEIGHT = 15;
    const HEADING_SIZE = 11.5;

    const clientLabel = contract.client.company || contract.client.name;

    let page!: PDFPage;
    let y = 0;
    let pageCount = 0;

    function newPage() {
      page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      pageCount++;
      // Orange brand bar across the top of every page
      page.drawRectangle({ x: 0, y: PAGE_HEIGHT - 5, width: PAGE_WIDTH, height: 5, color: ORANGE });
      if (pageCount > 1) {
        // Slim running header on continuation pages
        page.drawText("BLOK BLOK STUDIO", { x: MARGIN, y: PAGE_HEIGHT - 34, size: 7.5, font: fontBold, color: MUTED });
        const right = `Service Agreement — ${clientLabel}`;
        const rw = font.widthOfTextAtSize(right, 7.5);
        page.drawText(right, { x: PAGE_WIDTH - MARGIN - rw, y: PAGE_HEIGHT - 34, size: 7.5, font, color: MUTED });
        page.drawLine({
          start: { x: MARGIN, y: PAGE_HEIGHT - 42 },
          end: { x: PAGE_WIDTH - MARGIN, y: PAGE_HEIGHT - 42 },
          thickness: 0.5,
          color: LIGHT_BORDER,
        });
        y = PAGE_HEIGHT - 66;
      } else {
        y = PAGE_HEIGHT - 64;
      }
    }

    function ensureSpace(needed: number) {
      if (y - needed < BOTTOM_LIMIT) newPage();
    }

    // Wrap text into lines that fit within a given width
    function wrapText(text: string, fontSize: number, currentFont: PDFFont, maxWidth = CONTENT_WIDTH): string[] {
      const words = text.split(" ");
      const lines: string[] = [];
      let currentLine = "";
      for (const word of words) {
        const testLine = currentLine ? `${currentLine} ${word}` : word;
        if (currentFont.widthOfTextAtSize(testLine, fontSize) > maxWidth) {
          if (currentLine) lines.push(currentLine);
          currentLine = word;
        } else {
          currentLine = testLine;
        }
      }
      if (currentLine) lines.push(currentLine);
      return lines;
    }

    function drawWrapped(
      text: string,
      fontSize: number,
      currentFont: PDFFont,
      color = BODY_TEXT,
      x = MARGIN,
      maxWidth = CONTENT_WIDTH,
      lineHeight = LINE_HEIGHT
    ) {
      for (const line of wrapText(text, fontSize, currentFont, maxWidth)) {
        ensureSpace(lineHeight);
        page.drawText(line, { x, y, size: fontSize, font: currentFont, color });
        y -= lineHeight;
      }
    }

    // Bullet item with a hanging indent and an orange bullet
    function drawBullet(text: string) {
      const indent = 14;
      const lines = wrapText(text, FONT_SIZE, font, CONTENT_WIDTH - indent);
      ensureSpace(LINE_HEIGHT);
      page.drawCircle({ x: MARGIN + 3, y: y + 3.2, size: 1.6, color: ORANGE });
      for (let i = 0; i < lines.length; i++) {
        if (i > 0) ensureSpace(LINE_HEIGHT);
        page.drawText(lines[i], { x: MARGIN + indent, y, size: FONT_SIZE, font, color: BODY_TEXT });
        y -= LINE_HEIGHT;
      }
      y -= 1;
    }

    // Section heading with an orange left bar — nothing ever crosses the text
    function drawSectionHeading(text: string) {
      const indent = 12;
      const lines = wrapText(text, HEADING_SIZE, fontBold, CONTENT_WIDTH - indent);
      const blockHeight = lines.length * (HEADING_SIZE + 5);
      ensureSpace(blockHeight + 26);
      y -= 14;
      const topOfText = y + HEADING_SIZE * 0.78;
      for (const line of lines) {
        page.drawText(line, { x: MARGIN + indent, y, size: HEADING_SIZE, font: fontBold, color: BLACK });
        y -= HEADING_SIZE + 5;
      }
      const bottomOfText = y + HEADING_SIZE + 5 - 3;
      page.drawRectangle({
        x: MARGIN,
        y: bottomOfText,
        width: 3,
        height: topOfText - bottomOfText,
        color: ORANGE,
      });
      y -= 6;
    }

    newPage();

    // ── Cover header: black brand band with the white logo ────────
    const BAND_HEIGHT = 108;
    page.drawRectangle({ x: 0, y: PAGE_HEIGHT - BAND_HEIGHT, width: PAGE_WIDTH, height: BAND_HEIGHT, color: BLACK });
    page.drawRectangle({ x: 0, y: PAGE_HEIGHT - BAND_HEIGHT - 3, width: PAGE_WIDTH, height: 3, color: ORANGE });

    // White wordmark + subhead logo, vertically centered in the band
    try {
      const logoBytes = fs.readFileSync(
        path.join(process.cwd(), "public", "bb_logo_wordmark_subhead_WHT_PNG.png")
      );
      const logoImg = await pdf.embedPng(logoBytes);
      const logoH = 88;
      const logoW = (logoImg.width / logoImg.height) * logoH;
      page.drawImage(logoImg, {
        x: MARGIN - 5,
        y: PAGE_HEIGHT - BAND_HEIGHT + (BAND_HEIGHT - logoH) / 2,
        width: logoW,
        height: logoH,
      });
    } catch {
      // Logo missing — fall back to text branding
      page.drawText("BLOK BLOK STUDIO", { x: MARGIN, y: PAGE_HEIGHT - 62, size: 19, font: fontBold, color: rgb(1, 1, 1) });
      page.drawText("creative tech studio", { x: MARGIN, y: PAGE_HEIGHT - 78, size: 8.5, font: fontItalic, color: FAINT });
    }

    // Prepared-for block on the right of the band
    const preparedFor = "PREPARED FOR";
    const pfw = fontBold.widthOfTextAtSize(preparedFor, 6.5);
    page.drawText(preparedFor, { x: PAGE_WIDTH - MARGIN - pfw, y: PAGE_HEIGHT - 52, size: 6.5, font: fontBold, color: FAINT });
    const clientNameW = font.widthOfTextAtSize(clientLabel, 9.5);
    page.drawText(clientLabel, { x: PAGE_WIDTH - MARGIN - clientNameW, y: PAGE_HEIGHT - 65, size: 9.5, font, color: rgb(1, 1, 1) });

    y = PAGE_HEIGHT - BAND_HEIGHT - 40;

    // ── Contract body ─────────────────────────────────────────────
    const bodyLines = contract.contractBody.split("\n");
    let consecutiveBlank = 0;

    for (const rawLine of bodyLines) {
      const trimmed = rawLine.trim();

      if (!trimmed) {
        consecutiveBlank++;
        if (consecutiveBlank === 1) y -= 7;
        continue;
      }
      consecutiveBlank = 0;

      // Document title
      if (trimmed === "SERVICE AGREEMENT" || /^[A-Z][A-Z\s]{8,40}AGREEMENT$/.test(trimmed)) {
        ensureSpace(56);
        const titleSize = 17;
        const titleWidth = fontBold.widthOfTextAtSize(trimmed, titleSize);
        page.drawText(trimmed, { x: (PAGE_WIDTH - titleWidth) / 2, y, size: titleSize, font: fontBold, color: BLACK });
        y -= 10;
        page.drawLine({
          start: { x: (PAGE_WIDTH - 46) / 2, y },
          end: { x: (PAGE_WIDTH + 46) / 2, y },
          thickness: 2,
          color: ORANGE,
        });
        y -= 24;
        continue;
      }

      // Section headers
      if (/^SECTION \d+[.:]/i.test(trimmed) || trimmed === "ACKNOWLEDGMENT AND ACCEPTANCE") {
        drawSectionHeading(trimmed);
        continue;
      }

      // Skip the template's fill-in-by-hand signature placeholders — the real
      // signature panel below carries the captured signatures
      if (/^(PROVIDER|CLIENT):$/.test(trimmed) || /^(Name|Date|Signature):\s*_{3,}/.test(trimmed)) {
        continue;
      }

      // Numbered subsections like "1.1 WEBSITE DESIGN — $8,000 USD".
      // Must be mostly uppercase — numbered prose paragraphs ("8.1 The Provider
      // shall...") stay body text.
      const subsectionMatch = /^\d+\.\d+\s+(.*)$/.exec(trimmed);
      const letters = subsectionMatch ? subsectionMatch[1].replace(/[^a-zA-Z]/g, "") : "";
      const isUpperTitle = letters.length > 0 && letters === letters.toUpperCase();
      if (subsectionMatch && isUpperTitle) {
        ensureSpace(LINE_HEIGHT + 8);
        y -= 5;
        drawWrapped(trimmed, 10, fontBold, DARK_TEXT);
        y -= 2;
        continue;
      }

      // Lettered items with prices (legacy format)
      if (/^[A-Z]\.\s/.test(trimmed) && /[$€]/.test(trimmed)) {
        ensureSpace(LINE_HEIGHT);
        drawWrapped(trimmed, FONT_SIZE, fontBold, DARK_TEXT);
        continue;
      }

      // Money summary lines — bold, never with rules through them
      if (/^(TOTAL\b|Total\b|Balance Due\b|Subtotal\b)/.test(trimmed) && /[$€]/.test(trimmed)) {
        ensureSpace(LINE_HEIGHT + 4);
        drawWrapped(trimmed, 10, fontBold, BLACK);
        continue;
      }

      // Bulleted list items
      if (/^[-•]\s+/.test(trimmed)) {
        drawBullet(trimmed.replace(/^[-•]\s+/, ""));
        continue;
      }

      // Regular paragraph text
      drawWrapped(trimmed, FONT_SIZE, font);
      y -= 2;
    }

    // ── Signature panel ───────────────────────────────────────────
    async function embedSignature(data: string | null): Promise<{ img: Awaited<ReturnType<typeof pdf.embedPng>>; w: number; h: number } | null> {
      if (!data) return null;
      try {
        const base64Data = data.replace(/^data:image\/png;base64,/, "");
        const sigBytes = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0));
        const img = await pdf.embedPng(sigBytes);
        const maxW = 190;
        const maxH = 42;
        const scale = Math.min(maxW / img.width, maxH / img.height, 1);
        return { img, w: img.width * scale, h: img.height * scale };
      } catch {
        return null;
      }
    }

    const providerSig = await embedSignature(contract.providerSignatureData);
    const clientSig = await embedSignature(contract.signatureData);

    ensureSpace(190);
    y -= 16;
    drawSectionHeading("SIGNATURES");
    y -= 8;

    const colGap = 28;
    const colWidth = (CONTENT_WIDTH - colGap) / 2;
    const leftX = MARGIN;
    const rightX = MARGIN + colWidth + colGap;
    const sigAreaHeight = 52;
    const topY = y;

    function drawSignatureColumn(
      x: number,
      role: string,
      name: string | null,
      sig: { img: Awaited<ReturnType<typeof pdf.embedPng>>; w: number; h: number } | null,
      signedAt: Date | null
    ) {
      let cy = topY;
      page.drawText(role.toUpperCase(), { x, y: cy, size: 7.5, font: fontBold, color: MUTED });
      cy -= 10;
      // Signature area (image or typed script), sitting on a signing line
      const lineY = cy - sigAreaHeight;
      if (sig) {
        page.drawImage(sig.img, { x, y: lineY + 6, width: sig.w, height: sig.h });
      } else if (name) {
        page.drawText(name, { x, y: lineY + 10, size: 15, font: fontItalic, color: BLACK });
      }
      page.drawLine({ start: { x, y: lineY }, end: { x: x + colWidth, y: lineY }, thickness: 0.75, color: rgb(0.6, 0.6, 0.6) });
      let metaY = lineY - 13;
      if (name) {
        page.drawText(name, { x, y: metaY, size: 8.5, font: fontBold, color: DARK_TEXT });
        metaY -= 12;
      }
      if (signedAt) {
        page.drawText(
          `Signed ${signedAt.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })} at ${signedAt.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}`,
          { x, y: metaY, size: 7.5, font, color: MUTED }
        );
      } else if (!name) {
        page.drawText("Awaiting signature", { x, y: metaY, size: 7.5, font: fontItalic, color: FAINT });
      }
    }

    drawSignatureColumn(leftX, "Provider — Blok Blok Studio", contract.providerSignedName, providerSig, contract.providerSignedAt);
    drawSignatureColumn(rightX, `Client — ${clientLabel}`, contract.signedName, clientSig, contract.signedAt);
    y = topY - sigAreaHeight - 50;

    // ── Document integrity panel ──────────────────────────────────
    if (contract.documentHash || contract.signedDocumentHash) {
      const rows = [
        contract.documentHash ? ["Document hash (SHA-256)", contract.documentHash] : null,
        contract.signedDocumentHash ? ["Signed hash (SHA-256)", contract.signedDocumentHash] : null,
      ].filter(Boolean) as [string, string][];
      const panelHeight = 16 + rows.length * 20;
      ensureSpace(panelHeight + 12);
      page.drawRectangle({
        x: MARGIN,
        y: y - panelHeight + 10,
        width: CONTENT_WIDTH,
        height: panelHeight,
        color: PANEL_BG,
        borderColor: LIGHT_BORDER,
        borderWidth: 0.5,
      });
      let py = y - 4;
      for (const [label, value] of rows) {
        page.drawText(label.toUpperCase(), { x: MARGIN + 10, y: py, size: 6, font: fontBold, color: MUTED });
        py -= 9;
        page.drawText(value, { x: MARGIN + 10, y: py, size: 7, font: fontMono, color: DARK_TEXT });
        py -= 11;
      }
      y = y - panelHeight + 2;
    }

    // ── Per-page footer (numbers need the final page count) ───────
    const pages = pdf.getPages();
    pages.forEach((p, i) => {
      p.drawLine({
        start: { x: MARGIN, y: 40 },
        end: { x: PAGE_WIDTH - MARGIN, y: 40 },
        thickness: 0.5,
        color: LIGHT_BORDER,
      });
      p.drawText("Blok Blok Studio", { x: MARGIN, y: 29, size: 7, font: fontBold, color: MUTED });
      p.drawText("blokblokstudio.com  ·  chase@blokblokstudio.com", { x: MARGIN + 62, y: 29, size: 7, font, color: FAINT });
      const pn = `Page ${i + 1} of ${pages.length}`;
      const pnw = font.widthOfTextAtSize(pn, 7);
      p.drawText(pn, { x: PAGE_WIDTH - MARGIN - pnw, y: 29, size: 7, font, color: MUTED });
    });

    const pdfBytes = await pdf.save();
    const clientName = contract.client.name.replace(/[^a-zA-Z0-9]/g, "-");
    const filename = `Blok-Blok-Studio-Agreement-${clientName}.pdf`;

    return new NextResponse(Buffer.from(pdfBytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (error) {
    console.error("PDF generation error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to generate PDF" },
      { status: 500 }
    );
  }
}
