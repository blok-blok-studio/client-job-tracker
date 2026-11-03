import { PDFDocument, PDFFont, PDFImage, PDFPage, PDFName, PDFString, StandardFonts, rgb, RGB } from "pdf-lib";
import fs from "fs";
import path from "path";
import { PROOF, STUDIO } from "./proof";
import { SECTION_KEYS, SECTION_META, type PitchSections, type PitchStat } from "./types";

// A 16:9 pitch deck. The team supplies the research; this adds the Blok Blok
// wordmark and the brand's logo on every page, the case-study cards and the
// booking link. Standard fonts only (WinAnsi), so text goes through safe().

export interface PitchPdfInput {
  kind: "INTERNAL" | "BRAND";
  title: string;
  brandName: string;
  brandWebsite: string | null;
  brandIndustry: string | null;
  brandColor: string | null;
  recipient: string | null;
  authorName: string;
  authorEmail: string | null;
  sections: PitchSections;
  stats: PitchStat[];
  proof: string[];
  logo: Uint8Array | null; // PNG
  images: Array<{ data: Uint8Array; width: number; height: number; caption: string | null }>; // JPEG
  date: Date;
}

const W = 960;
const H = 540;
const M = 56;
const BLUE1 = rgb(0.145, 0.38, 0.847); // #2561D8
const BLUE2 = rgb(0.008, 0.031, 0.529); // #020887
const INK = rgb(0.1, 0.1, 0.1);
const MUTED = rgb(0.42, 0.42, 0.42);
const FAINT = rgb(0.62, 0.62, 0.62);
const RULE = rgb(0.86, 0.86, 0.86);
const PANEL = rgb(0.96, 0.965, 0.98);
const WHITE = rgb(1, 1, 1);

export function safe(text: string): string {
  return text
    .replace(/€/g, "EUR ")
    .replace(/[–—−]/g, "-")
    .replace(/[‘’‚]/g, "'")
    .replace(/[“”„]/g, '"')
    .replace(/…/g, "...")
    .replace(/[•·]/g, "-")
    .replace(/ /g, " ")
    .replace(/\r/g, "")
    .replace(/\t/g, "  ")
    .replace(/[^\n -~¡-ÿ]/g, "");
}

function hexColor(hex: string | null): RGB | null {
  if (!hex || !/^#[0-9a-fA-F]{6}$/.test(hex)) return null;
  const n = parseInt(hex.slice(1), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const out: string[] = [];
  for (const raw of text.split("\n")) {
    const words = raw.split(/ +/).filter(Boolean);
    if (words.length === 0) { out.push(""); continue; }
    let line = "";
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) <= width) { line = next; continue; }
      if (line) out.push(line);
      // a single word wider than the line: hard-break it
      let w = word;
      while (font.widthOfTextAtSize(w, size) > width && w.length > 1) {
        let cut = w.length - 1;
        while (cut > 1 && font.widthOfTextAtSize(w.slice(0, cut), size) > width) cut--;
        out.push(w.slice(0, cut));
        w = w.slice(cut);
      }
      line = w;
    }
    out.push(line);
  }
  return out;
}

function fit(img: PDFImage, maxW: number, maxH: number) {
  const s = Math.min(maxW / img.width, maxH / img.height);
  return { width: img.width * s, height: img.height * s };
}

function addLink(pdf: PDFDocument, page: PDFPage, x: number, y: number, w: number, h: number, uri: string) {
  const link = pdf.context.obj({
    Type: "Annot",
    Subtype: "Link",
    Rect: [x, y, x + w, y + h],
    Border: [0, 0, 0],
    A: { Type: "Action", S: "URI", URI: PDFString.of(uri) },
  });
  const ref = pdf.context.register(link);
  const annots = page.node.lookup(PDFName.of("Annots"));
  if (annots && "push" in annots) (annots as unknown as { push: (r: unknown) => void }).push(ref);
  else page.node.set(PDFName.of("Annots"), pdf.context.obj([ref]));
}

/** "- item" / "* item" lines become bullets; everything else is a paragraph line. */
function blocks(text: string): Array<{ bullet: boolean; text: string } | null> {
  return safe(text)
    .trim()
    .split("\n")
    .map((l) => l.trim())
    .map((l) => (l === "" ? null : /^[-*]\s+/.test(l) ? { bullet: true, text: l.replace(/^[-*]\s+/, "") } : { bullet: false, text: l }));
}

export async function renderPitchPdf(p: PitchPdfInput): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const brand = safe(p.brandName);
  const internal = p.kind === "INTERNAL";
  pdf.setTitle(safe(p.title));
  pdf.setAuthor(safe(`${p.authorName}, ${STUDIO.name}`));
  pdf.setSubject(internal ? `Internal pitch: ${brand}` : `Pitch for ${brand}`);
  pdf.setCreator(STUDIO.name);

  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const pub = (f: string) => fs.readFileSync(path.join(process.cwd(), "public", f));
  const markBlack = await pdf.embedPng(pub("bb_logo_wordmark_subhead_BLK_PNG.png"));
  const markWhite = await pdf.embedPng(pub("bb_logo_wordmark_subhead_WHT_PNG.png"));
  const brandLogo = p.logo ? await pdf.embedPng(p.logo).catch(() => null) : null;
  const accent = hexColor(p.brandColor) || BLUE1;
  const dateText = p.date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

  const text = (page: PDFPage, s: string, x: number, y: number, size: number, font: PDFFont, color: RGB = INK) =>
    page.drawText(safe(s), { x, y, size, font, color });

  // ---------- cover ----------
  {
    const page = pdf.addPage([W, H]);
    page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: BLUE2 });
    page.drawRectangle({ x: 0, y: 0, width: W, height: 10, color: accent });
    const m = fit(markWhite, 150, 80);
    page.drawImage(markWhite, { x: M, y: H - M - m.height, ...m });

    // brand card on the right
    const cw = 280, ch = 180, cx = W - M - cw, cy = H / 2 - ch / 2 - 10;
    page.drawRectangle({ x: cx, y: cy, width: cw, height: ch, color: WHITE });
    if (brandLogo) {
      const l = fit(brandLogo, cw - 60, ch - 60);
      page.drawImage(brandLogo, { x: cx + (cw - l.width) / 2, y: cy + (ch - l.height) / 2, ...l });
    } else {
      const lines = wrap(brand, bold, 26, cw - 40).slice(0, 3);
      const startY = cy + ch / 2 + ((lines.length - 1) * 32) / 2 - 9;
      lines.forEach((ln, i) => {
        const w = bold.widthOfTextAtSize(ln, 26);
        page.drawText(ln, { x: cx + (cw - w) / 2, y: startY - i * 32, size: 26, font: bold, color: INK });
      });
    }

    const leftW = cx - M - 40;
    let y = H / 2 + 70;
    text(page, internal ? "INTERNAL PITCH" : `A PITCH FOR ${brand.toUpperCase()}`, M, y, 11, bold, rgb(0.62, 0.72, 1));
    y -= 46;
    for (const ln of wrap(safe(p.title), bold, 36, leftW).slice(0, 4)) {
      page.drawText(ln, { x: M, y, size: 36, font: bold, color: WHITE });
      y -= 42;
    }
    y -= 6;
    const forLine = internal
      ? `For ${safe(p.recipient || "Chase Haynes")} - about ${brand}`
      : p.recipient ? `Prepared for ${safe(p.recipient)}, ${brand}` : `Prepared for ${brand}`;
    for (const ln of wrap(forLine, regular, 14, leftW)) { text(page, ln, M, y, 14, regular, rgb(0.85, 0.88, 1)); y -= 20; }
    text(page, `By ${p.authorName}, ${STUDIO.name}  |  ${dateText}`, M, M, 11, regular, rgb(0.7, 0.75, 0.95));
  }

  // ---------- content pages ----------
  let pageNo = 1;
  const footerFor = internal ? `Internal - ${brand}` : `Prepared for ${brand}`;
  const contentPage = () => {
    const page = pdf.addPage([W, H]);
    pageNo++;
    const m = fit(markBlack, 70, 38);
    page.drawImage(markBlack, { x: M, y: H - 26 - m.height, ...m });
    if (brandLogo) {
      const l = fit(brandLogo, 120, 34);
      page.drawImage(brandLogo, { x: W - M - l.width, y: H - 26 - l.height + (38 - l.height) / 2, ...l });
    } else {
      const w = bold.widthOfTextAtSize(brand, 12);
      page.drawText(brand, { x: W - M - w, y: H - 46, size: 12, font: bold, color: MUTED });
    }
    page.drawLine({ start: { x: M, y: H - 76 }, end: { x: W - M, y: H - 76 }, thickness: 0.8, color: RULE });
    page.drawRectangle({ x: M, y: H - 77.5, width: 48, height: 3, color: accent });
    text(page, footerFor, M, 26, 9, regular, FAINT);
    const n = String(pageNo);
    page.drawText(n, { x: W - M - regular.widthOfTextAtSize(n, 9), y: 26, size: 9, font: regular, color: FAINT });
    return page;
  };
  const TOP = H - 112;
  const BOTTOM = 60;

  // key numbers
  const stats = p.stats.filter((s) => s.value && s.label).slice(0, 4);
  if (stats.length) {
    const page = contentPage();
    text(page, internal ? "The numbers behind it" : "By the numbers", M, TOP - 6, 26, bold, BLUE2);
    const gap = 20;
    const tw = (W - 2 * M - gap * (stats.length - 1)) / stats.length;
    const th = 250, ty = TOP - 60 - th;
    stats.forEach((s, i) => {
      const x = M + i * (tw + gap);
      page.drawRectangle({ x, y: ty, width: tw, height: th, color: PANEL });
      page.drawRectangle({ x, y: ty + th - 4, width: tw, height: 4, color: accent });
      let size = 44;
      while (size > 20 && bold.widthOfTextAtSize(safe(s.value), size) > tw - 40) size -= 2;
      text(page, s.value, x + 20, ty + th - 40 - size, size, bold, BLUE1);
      let y = ty + th - 80 - size;
      for (const ln of wrap(safe(s.label), regular, 14, tw - 40).slice(0, 5)) { page.drawText(ln, { x: x + 20, y, size: 14, font: regular, color: INK }); y -= 19; }
      if (s.source) {
        let sy = ty + 20 + 12 * (wrap(safe(`Source: ${s.source}`), regular, 9, tw - 40).length - 1);
        for (const ln of wrap(safe(`Source: ${s.source}`), regular, 9, tw - 40).slice(0, 3)) { page.drawText(ln, { x: x + 20, y: sy, size: 9, font: regular, color: FAINT }); sy -= 12; }
      }
    });
  }

  // written sections, packed onto pages
  const BODY = 14, LH = 21, HEAD = 24, TW = W - 2 * M;
  let page: PDFPage | null = null;
  let y = 0;
  const ensure = (need: number) => {
    if (!page || y - need < BOTTOM) { page = contentPage(); y = TOP; return true; }
    return false;
  };
  for (const key of SECTION_KEYS) {
    const body = p.sections[key]?.trim();
    if (!body) continue;
    const heading = internal ? SECTION_META[key].internal : SECTION_META[key].brand;
    const fresh = ensure(HEAD + 20 + LH * 3);
    if (!fresh) y -= 22;
    page!.drawText(safe(heading), { x: M, y: y - HEAD, size: HEAD, font: bold, color: BLUE2 });
    y -= HEAD + 22;
    for (const b of blocks(body)) {
      if (!b) { y -= LH / 2; continue; }
      const indent = b.bullet ? 22 : 0;
      const lines = wrap(b.text, regular, BODY, TW - indent);
      lines.forEach((ln, i) => {
        if (ensure(LH)) {
          page!.drawText(safe(`${heading} (continued)`), { x: M, y: y - 14, size: 12, font: bold, color: FAINT });
          y -= 34;
        }
        if (b.bullet && i === 0) page!.drawCircle({ x: M + 6, y: y - BODY + 5, size: 2.6, color: accent });
        page!.drawText(ln, { x: M + indent, y: y - BODY, size: BODY, font: regular, color: INK });
        y -= LH;
      });
      y -= 4;
    }
  }

  // research screenshots, two per page
  for (let i = 0; i < p.images.length; i += 2) {
    const pg = contentPage();
    text(pg, i === 0 ? "From the research" : "From the research (continued)", M, TOP - 6, 26, bold, BLUE2);
    const pair = p.images.slice(i, i + 2);
    const gap = 24;
    const bw = pair.length === 1 ? TW : (TW - gap) / 2;
    const bh = 290;
    for (let j = 0; j < pair.length; j++) {
      const im = pair[j];
      const img = await pdf.embedJpg(im.data).catch(() => null);
      if (!img) continue;
      const s = fit(img, bw, bh);
      const x = M + j * (bw + gap) + (bw - s.width) / 2;
      const iy = TOP - 46 - bh + (bh - s.height);
      pg.drawRectangle({ x: x - 1, y: iy - 1, width: s.width + 2, height: s.height + 2, color: RULE });
      pg.drawImage(img, { x, y: iy, ...s });
      if (im.caption) {
        let cy = iy - 18;
        for (const ln of wrap(safe(im.caption), regular, 11, s.width).slice(0, 3)) { pg.drawText(ln, { x, y: cy, size: 11, font: regular, color: MUTED }); cy -= 15; }
      }
    }
  }

  // case studies
  const proof = PROOF.filter((c) => p.proof.includes(c.key));
  if (proof.length) {
    const pg = contentPage();
    text(pg, internal ? "Proof we can show them" : "Work we have done", M, TOP - 6, 26, bold, BLUE2);
    const cols = proof.length <= 2 ? proof.length : 2;
    const rows = Math.ceil(proof.length / cols);
    const gap = 20;
    const cw = (TW - gap * (cols - 1)) / cols;
    const ch = rows === 1 ? 250 : (TOP - 50 - BOTTOM - gap) / 2;
    proof.forEach((c, i) => {
      const col = i % cols, row = Math.floor(i / cols);
      const x = M + col * (cw + gap);
      const cy = TOP - 50 - (row + 1) * ch - row * gap;
      pg.drawRectangle({ x, y: cy, width: cw, height: ch, color: PANEL });
      pg.drawRectangle({ x, y: cy, width: 4, height: ch, color: BLUE1 });
      let yy = cy + ch - 30;
      pg.drawText(safe(c.client.toUpperCase()), { x: x + 24, y: yy, size: 10, font: bold, color: MUTED });
      yy -= 36;
      pg.drawText(safe(c.headline), { x: x + 24, y: yy, size: 28, font: bold, color: BLUE1 });
      yy -= 24;
      for (const ln of wrap(safe(c.detail), regular, 12, cw - 48).slice(0, 3)) { pg.drawText(ln, { x: x + 24, y: yy, size: 12, font: regular, color: INK }); yy -= 16; }
      pg.drawText(safe(c.site), { x: x + 24, y: cy + 18, size: 10, font: regular, color: FAINT });
    });
  }

  // closing
  {
    const pg = pdf.addPage([W, H]);
    pg.drawRectangle({ x: 0, y: 0, width: W, height: H, color: BLUE2 });
    pg.drawRectangle({ x: 0, y: 0, width: W, height: 10, color: accent });
    const m = fit(markWhite, 220, 120);
    pg.drawImage(markWhite, { x: M, y: H - M - m.height, ...m });
    let yy = H / 2 + 10;
    text(pg, internal ? "What happens next" : "Let's talk", M, yy, 34, bold, WHITE);
    yy -= 40;
    const ask = internal
      ? "Tell me if this is worth pursuing and I will set up the call."
      : `Book a call and we will walk you through how this would work for ${brand}.`;
    for (const ln of wrap(ask, regular, 16, 560)) { text(pg, ln, M, yy, 16, regular, rgb(0.85, 0.88, 1)); yy -= 22; }
    if (!internal) {
      yy -= 14;
      const label = "Book a call";
      const bw = bold.widthOfTextAtSize(label, 14) + 40;
      pg.drawRectangle({ x: M, y: yy - 14, width: bw, height: 36, color: WHITE });
      pg.drawText(label, { x: M + 20, y: yy - 1, size: 14, font: bold, color: BLUE2 });
      addLink(pdf, pg, M, yy - 14, bw, 36, STUDIO.booking);
      text(pg, STUDIO.booking.replace(/^https:\/\//, ""), M + bw + 16, yy + 2, 11, regular, rgb(0.7, 0.75, 0.95));
    }
    let cy = 110;
    text(pg, p.authorName, W - M - 300, cy, 14, bold, WHITE); cy -= 18;
    if (p.authorEmail) { text(pg, p.authorEmail, W - M - 300, cy, 12, regular, rgb(0.85, 0.88, 1)); cy -= 16; }
    text(pg, STUDIO.site, W - M - 300, cy, 12, regular, rgb(0.85, 0.88, 1));
    addLink(pdf, pg, W - M - 300, cy - 3, regular.widthOfTextAtSize(STUDIO.site, 12), 15, `https://${STUDIO.site}`);
    if (!internal) text(pg, STUDIO.about, M, 40, 10, regular, rgb(0.6, 0.66, 0.92));
  }

  return pdf.save();
}
