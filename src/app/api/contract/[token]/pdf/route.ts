import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

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

    const PAGE_WIDTH = 612; // Letter
    const PAGE_HEIGHT = 792;
    const MARGIN = 60;
    const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
    const LINE_HEIGHT = 16;
    const FONT_SIZE = 10;
    const HEADING_SIZE = 14;
    const SECTION_SIZE = 11;

    let page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    let y = PAGE_HEIGHT - MARGIN;

    function ensureSpace(needed: number) {
      if (y - needed < MARGIN) {
        page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
        y = PAGE_HEIGHT - MARGIN;
      }
    }

    // Wrap text into lines that fit within maxWidth
    function wrapText(text: string, fontSize: number, currentFont: typeof font): string[] {
      const words = text.split(" ");
      const lines: string[] = [];
      let currentLine = "";

      for (const word of words) {
        const testLine = currentLine ? `${currentLine} ${word}` : word;
        const width = currentFont.widthOfTextAtSize(testLine, fontSize);
        if (width > CONTENT_WIDTH) {
          if (currentLine) lines.push(currentLine);
          currentLine = word;
        } else {
          currentLine = testLine;
        }
      }
      if (currentLine) lines.push(currentLine);
      return lines;
    }

    function drawWrappedText(text: string, fontSize: number, currentFont: typeof font, color = rgb(0.15, 0.15, 0.15)) {
      const lines = wrapText(text, fontSize, currentFont);
      for (const line of lines) {
        ensureSpace(LINE_HEIGHT);
        page.drawText(line, { x: MARGIN, y, size: fontSize, font: currentFont, color });
        y -= LINE_HEIGHT;
      }
    }

    // --- Header ---
    page.drawText("BLOK BLOK STUDIO", {
      x: MARGIN,
      y,
      size: 18,
      font: fontBold,
      color: rgb(0, 0, 0),
    });
    y -= 20;
    page.drawText("creative tech studio", {
      x: MARGIN,
      y,
      size: 9,
      font: fontItalic,
      color: rgb(0.5, 0.5, 0.5),
    });
    y -= 30;

    // --- Divider ---
    page.drawLine({
      start: { x: MARGIN, y },
      end: { x: PAGE_WIDTH - MARGIN, y },
      thickness: 1,
      color: rgb(0.85, 0.85, 0.85),
    });
    y -= 20;

    // --- Contract body ---
    const bodyLines = contract.contractBody.split("\n");

    for (const rawLine of bodyLines) {
      const trimmed = rawLine.trim();

      if (!trimmed) {
        y -= 8;
        continue;
      }

      // Main title
      if (trimmed === "SERVICE AGREEMENT") {
        ensureSpace(30);
        const titleWidth = fontBold.widthOfTextAtSize(trimmed, HEADING_SIZE);
        page.drawText(trimmed, {
          x: (PAGE_WIDTH - titleWidth) / 2,
          y,
          size: HEADING_SIZE,
          font: fontBold,
          color: rgb(0, 0, 0),
        });
        y -= 24;
        continue;
      }

      // Section headers
      if (/^SECTION \d+\./.test(trimmed) || trimmed === "ACKNOWLEDGMENT AND ACCEPTANCE") {
        ensureSpace(30);
        y -= 10;
        page.drawLine({
          start: { x: MARGIN, y: y + 6 },
          end: { x: PAGE_WIDTH - MARGIN, y: y + 6 },
          thickness: 0.5,
          color: rgb(0.85, 0.85, 0.85),
        });
        drawWrappedText(trimmed, SECTION_SIZE, fontBold, rgb(0, 0, 0));
        y -= 4;
        continue;
      }

      // Lettered items with prices
      if (/^[A-Z]\.\s/.test(trimmed) && trimmed.includes("$")) {
        ensureSpace(LINE_HEIGHT);
        drawWrappedText(trimmed, FONT_SIZE, fontBold, rgb(0.15, 0.15, 0.15));
        continue;
      }

      // Total line
      if (trimmed.startsWith("Total") && trimmed.includes("$")) {
        ensureSpace(LINE_HEIGHT + 10);
        y -= 4;
        page.drawLine({
          start: { x: MARGIN, y: y + 6 },
          end: { x: PAGE_WIDTH - MARGIN, y: y + 6 },
          thickness: 0.5,
          color: rgb(0.85, 0.85, 0.85),
        });
        drawWrappedText(trimmed, SECTION_SIZE, fontBold, rgb(0, 0, 0));
        continue;
      }

      // Regular text
      drawWrappedText(trimmed, FONT_SIZE, font);
    }

    // --- Signature blocks ---
    y -= 20;
    ensureSpace(120);
    page.drawLine({
      start: { x: MARGIN, y },
      end: { x: PAGE_WIDTH - MARGIN, y },
      thickness: 1,
      color: rgb(0.85, 0.85, 0.85),
    });
    y -= 24;

    page.drawText("SIGNATURES", {
      x: MARGIN,
      y,
      size: SECTION_SIZE,
      font: fontBold,
      color: rgb(0, 0, 0),
    });
    y -= 24;

    // Provider signature
    if (contract.providerSignedName) {
      page.drawText("Provider:", { x: MARGIN, y, size: 9, font: fontBold, color: rgb(0.4, 0.4, 0.4) });
      y -= LINE_HEIGHT;
      page.drawText(contract.providerSignedName, { x: MARGIN, y, size: 16, font: fontItalic, color: rgb(0, 0, 0) });
      y -= LINE_HEIGHT;
      if (contract.providerSignedAt) {
        page.drawText(
          `Signed: ${contract.providerSignedAt.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })}`,
          { x: MARGIN, y, size: 8, font, color: rgb(0.5, 0.5, 0.5) }
        );
        y -= LINE_HEIGHT;
      }
      y -= 12;
    }

    // Client signature
    if (contract.signedName) {
      ensureSpace(60);
      page.drawText("Client:", { x: MARGIN, y, size: 9, font: fontBold, color: rgb(0.4, 0.4, 0.4) });
      y -= LINE_HEIGHT;

      // If there's a drawn signature, embed it
      if (contract.signatureData) {
        try {
          const base64Data = contract.signatureData.replace(/^data:image\/png;base64,/, "");
          const sigBytes = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
          const sigImage = await pdf.embedPng(sigBytes);
          const sigDims = sigImage.scale(0.35);
          ensureSpace(sigDims.height + 20);
          page.drawImage(sigImage, {
            x: MARGIN,
            y: y - sigDims.height,
            width: sigDims.width,
            height: sigDims.height,
          });
          y -= sigDims.height + 8;
        } catch {
          // Fallback to typed name if signature image fails
          page.drawText(contract.signedName, { x: MARGIN, y, size: 16, font: fontItalic, color: rgb(0, 0, 0) });
          y -= LINE_HEIGHT;
        }
      } else {
        page.drawText(contract.signedName, { x: MARGIN, y, size: 16, font: fontItalic, color: rgb(0, 0, 0) });
        y -= LINE_HEIGHT;
      }

      page.drawText(`Name: ${contract.signedName}`, { x: MARGIN, y, size: 8, font, color: rgb(0.5, 0.5, 0.5) });
      y -= 12;
      if (contract.signedAt) {
        page.drawText(
          `Signed: ${contract.signedAt.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })}`,
          { x: MARGIN, y, size: 8, font, color: rgb(0.5, 0.5, 0.5) }
        );
        y -= 12;
      }
    }

    // --- Document integrity footer ---
    y -= 16;
    ensureSpace(40);
    page.drawLine({
      start: { x: MARGIN, y: y + 4 },
      end: { x: PAGE_WIDTH - MARGIN, y: y + 4 },
      thickness: 0.5,
      color: rgb(0.9, 0.9, 0.9),
    });
    y -= 8;

    if (contract.documentHash) {
      page.drawText(`Document Hash: ${contract.documentHash}`, {
        x: MARGIN, y, size: 6, font, color: rgb(0.7, 0.7, 0.7),
      });
      y -= 10;
    }
    if (contract.signedDocumentHash) {
      page.drawText(`Signed Hash: ${contract.signedDocumentHash}`, {
        x: MARGIN, y, size: 6, font, color: rgb(0.7, 0.7, 0.7),
      });
    }

    const pdfBytes = await pdf.save();
    const clientName = contract.client.name.replace(/[^a-zA-Z0-9]/g, "-");
    const filename = `Blok-Blok-Studio-Agreement-${clientName}.pdf`;

    return new NextResponse(pdfBytes, {
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
