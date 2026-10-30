import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from "pdf-lib";
import fs from "fs";
import path from "path";
import prisma from "@/lib/prisma";
import { catalogSummary, PARTNER_WEBSITE_IDS, PARTNER_BRAND_GUIDE_ID, PARTNER_PLAN_IDS } from "@/lib/partner-catalog";
import { getSetting } from "@/lib/lifecycle/settings";

/**
 * The partner "kit": one PDF a sales partner hands to their reps. Everything
 * in it comes from the same catalog the contract and Stripe use, so a price
 * change here is a price change everywhere. No commission figures: those are
 * between Blok Blok and the partner, and the partner pays its reps its own way.
 */

const ORANGE = rgb(0.976, 0.451, 0.086);
const DARK = rgb(0.09, 0.09, 0.09);
const BODY = rgb(0.2, 0.2, 0.2);
const MUTED = rgb(0.45, 0.45, 0.45);
const LINE = rgb(0.88, 0.88, 0.88);
const PANEL = rgb(0.97, 0.97, 0.97);

export const DEFAULT_QUALIFICATION_CRITERIA = `A qualified call means all of these are true:
- A real, operating business (practice, clinic, local business) with a decision maker on the call: owner, partner, practice manager or marketing lead.
- They have said they want a new or rebuilt website, or a monthly plan, in the next 90 days.
- They have heard the starting price for the package they are interested in and did not object to it.
- They know the call is with Blok Blok Studio, a web design studio, and what it is about.
- They have confirmed a date and time, and the invite is on their calendar.
Not qualified: "just curious", no budget conversation, no decision maker, or a business that already works with Blok Blok.`;

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://blokblokstudio-clients.vercel.app";

export async function renderPartnerKit(partnerId: string): Promise<Uint8Array> {
  const partner = await prisma.partner.findUnique({
    where: { id: partnerId },
    select: { name: true, contactName: true, qualificationCriteria: true, country: true, bookingLink: true },
  });
  if (!partner) throw new Error("Partner not found");
  const bookingLink = partner.bookingLink || (await getSetting<string>("booking_link", ""));

  const catalog = catalogSummary();
  const websites = catalog.filter((p) => (PARTNER_WEBSITE_IDS as readonly string[]).includes(p.id));
  const brand = catalog.find((p) => p.id === PARTNER_BRAND_GUIDE_ID);
  const plans = catalog.filter((p) => (PARTNER_PLAN_IDS as readonly string[]).includes(p.id));

  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const W = 612;
  const H = 792;
  const M = 60;
  const CW = W - M * 2;
  const BOTTOM = M + 24;

  let logo: Awaited<ReturnType<typeof pdf.embedPng>> | null = null;
  try {
    const bytes = fs.readFileSync(path.join(process.cwd(), "public", "bb_logo_wordmark_subhead_BLK_PNG.png"));
    logo = await pdf.embedPng(bytes);
  } catch {
    logo = null;
  }

  let page!: PDFPage;
  let y = 0;
  let pages = 0;
  const today = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  function footer() {
    page.drawLine({ start: { x: M, y: M - 6 }, end: { x: W - M, y: M - 6 }, thickness: 0.5, color: LINE });
    page.drawText(`Blok Blok Studio partner kit for ${partner!.name}  ·  ${today}  ·  prices in USD`, {
      x: M,
      y: M - 20,
      size: 7.5,
      font,
      color: MUTED,
    });
    const pn = String(pages);
    page.drawText(pn, { x: W - M - font.widthOfTextAtSize(pn, 7.5), y: M - 20, size: 7.5, font, color: MUTED });
  }

  function newPage() {
    page = pdf.addPage([W, H]);
    pages++;
    page.drawRectangle({ x: 0, y: H - 5, width: W, height: 5, color: ORANGE });
    y = H - 64;
    footer();
  }

  function ensure(needed: number) {
    if (y - needed < BOTTOM) newPage();
  }

  function wrap(text: string, size: number, f: PDFFont, maxWidth = CW): string[] {
    const out: string[] = [];
    for (const para of text.split("\n")) {
      const words = para.split(" ");
      let line = "";
      for (const w of words) {
        const test = line ? `${line} ${w}` : w;
        if (f.widthOfTextAtSize(test, size) > maxWidth) {
          if (line) out.push(line);
          line = w;
        } else line = test;
      }
      out.push(line);
    }
    return out;
  }

  function text(t: string, size = 10, f: PDFFont = font, color = BODY, x = M, maxWidth = CW, lh = size * 1.5) {
    for (const line of wrap(t, size, f, maxWidth)) {
      ensure(lh);
      page.drawText(line, { x, y, size, font: f, color });
      y -= lh;
    }
  }

  function h1(t: string) {
    ensure(40);
    page.drawText(t.toUpperCase(), { x: M, y, size: 9, font: bold, color: ORANGE });
    y -= 22;
  }

  function h2(t: string) {
    ensure(30);
    page.drawText(t, { x: M, y, size: 15, font: bold, color: DARK });
    y -= 22;
  }

  function bullet(t: string) {
    const size = 9.5;
    const lh = 14;
    const lines = wrap(t, size, font, CW - 16);
    ensure(lh * lines.length);
    page.drawCircle({ x: M + 4, y: y + 3.5, size: 1.6, color: ORANGE });
    lines.forEach((line, i) => {
      page.drawText(line, { x: M + 16, y, size, font, color: BODY });
      y -= lh;
      if (i < lines.length - 1) ensure(lh);
    });
  }

  function gap(n = 10) {
    y -= n;
  }

  function priceRow(name: string, price: string, note: string) {
    ensure(34);
    page.drawRectangle({ x: M, y: y - 8, width: CW, height: 30, color: PANEL });
    page.drawText(name, { x: M + 10, y: y + 6, size: 10.5, font: bold, color: DARK });
    page.drawText(note, { x: M + 10, y: y - 5, size: 8.5, font, color: MUTED });
    const pw = bold.widthOfTextAtSize(price, 11);
    page.drawText(price, { x: W - M - 10 - pw, y: y + 2, size: 11, font: bold, color: ORANGE });
    y -= 36;
  }

  const usd = (n: number) => `$${n.toLocaleString("en-US")}`;

  // ── Cover ──────────────────────────────────────────────────────────────
  newPage();
  if (logo) {
    const lw = 180;
    const lh = (logo.height / logo.width) * lw;
    page.drawImage(logo, { x: M, y: H - 80 - lh, width: lw, height: lh });
    y = H - 110 - lh;
  }
  page.drawText("PARTNER KIT", { x: M, y, size: 9, font: bold, color: ORANGE });
  y -= 30;
  page.drawText("Selling Blok Blok Studio", { x: M, y, size: 28, font: bold, color: DARK });
  y -= 36;
  text(`Prepared for ${partner.name}${partner.contactName ? ` and the team led by ${partner.contactName}` : ""}. Everything a rep needs to introduce, qualify and close a Blok Blok website or plan: what we build, what it costs, what is included, how a deal gets signed and paid, and how to use the partner portal.`, 11, font, BODY, M, CW, 17);
  gap(14);
  text(`Prices in this kit are the current partner price list for ${partner.country === "US" ? "the United States" : partner.country}. Blok Blok sends a replacement kit whenever a price or package changes; the newest kit always wins. Quote only what is in this document.`, 9.5, font, MUTED, M, CW, 14);
  gap(26);

  h1("What Blok Blok builds");
  text("Blok Blok Studio is a creative tech studio. We design and build custom websites for practices and small businesses, then keep them running, visible and converting with monthly plans. Every site is custom designed, mobile first, fast, and built on a modern stack we host and maintain. There are no templates and no page builders.", 10, font, BODY, M, CW, 15);
  gap(8);
  bullet("Custom websites: 5, 10 or 15+ pages, built in about 4 to 12 weeks depending on size.");
  bullet("Brand strategy guide: logo, colors, typography and a guide, for practices that need an identity before the site.");
  bullet("Monthly plans: website upkeep, local visibility (SEO, reviews, listings), and practice support (AI reception, booking chat, reactivation).");
  bullet("Chase Haynes, founder, runs every sales call and approves every scope. The build team delivers.");

  // ── Price list ─────────────────────────────────────────────────────────
  newPage();
  h1("Price list");
  h2("Websites and brand");
  for (const p of websites) priceRow(p.name, usd(p.price), `${p.timeline}. ${p.description}`);
  if (brand) priceRow(brand.name, usd(brand.price), `${brand.timeline}. ${brand.description}`);
  gap(6);
  h2("Monthly plans");
  for (const p of plans) priceRow(p.name, `${usd(p.price)} / month`, p.description);
  gap(8);
  h1("How clients pay");
  bullet("Websites and brand guides: 50% deposit when the agreement is signed, 50% when the project is complete. Work starts when the deposit lands.");
  bullet("Plans: billed monthly by card or bank debit through Stripe. Base and Growth are month to month with 30 days notice. Premium has a 12-month term.");
  bullet("A plan usually starts when the site goes live; it can also be sold on its own to a practice that keeps its current site.");
  bullet("Third-party usage (telephony, SMS, AI minutes, ad spend, domains) is billed to the client's own accounts, never bundled into our fee. The client owns those accounts.");
  bullet("All payments go to Blok Blok Studio LLC through Stripe. Reps never take payment.");

  // ── Inclusions ─────────────────────────────────────────────────────────
  newPage();
  h1("What is included");
  for (const p of [...websites, ...(brand ? [brand] : [])]) {
    ensure(60);
    h2(`${p.name}  ·  ${usd(p.price)}`);
    text(p.description, 9.5, font, MUTED, M, CW, 14);
    gap(4);
    for (const d of p.deliverables) bullet(d);
    text(`Timeline: ${p.timeline}.`, 9, font, MUTED, M, CW, 13);
    gap(12);
  }
  for (const p of plans) {
    ensure(60);
    h2(`${p.name}  ·  ${usd(p.price)} / month`);
    text(p.description, 9.5, font, MUTED, M, CW, 14);
    gap(4);
    for (const d of p.deliverables) bullet(d);
    gap(12);
  }

  // ── Qualification ──────────────────────────────────────────────────────
  newPage();
  h1("Qualifying a practice");
  text("A booked call costs both sides time. Only book it when the practice meets the criteria below. If in doubt, register the practice in the portal and ask before booking.", 10, font, BODY, M, CW, 15);
  gap(8);
  const criteria = (partner.qualificationCriteria?.trim() || DEFAULT_QUALIFICATION_CRITERIA).split("\n");
  for (const line of criteria) {
    const t = line.trim();
    if (!t) continue;
    if (t.startsWith("-") || t.startsWith("•")) bullet(t.replace(/^[-•]\s*/, ""));
    else text(t, 10, bold, DARK, M, CW, 15);
  }
  gap(14);
  h1("Who to look for");
  bullet("Practices and local businesses whose current site is outdated, slow, not mobile friendly, or missing online booking and clear calls to action.");
  bullet("Owners who are opening, rebranding, adding a location, or have just hired a marketer and need a site that converts.");
  bullet("Businesses already spending on ads or social and sending that traffic to a weak website.");
  bullet("Not a fit: anyone who wants a template site for a few hundred dollars, or who needs it live in under three weeks.");

  // ── Portal ─────────────────────────────────────────────────────────────
  newPage();
  h1("Using the partner portal");
  text("Every rep has a personal portal link. It is the only place deals are tracked and the only way a practice is credited to you. Keep the link private; do not share it with practices.", 10, font, BODY, M, CW, 15);
  gap(8);
  h2("1. Register the practice first");
  text("Before the first call with Blok Blok, open your portal and register the practice: contact name, email, phone, business name and website. Registration is first come, first served. A practice already known to Blok Blok cannot be registered, and the portal will tell you straight away.", 10, font, BODY, M, CW, 15);
  gap(8);
  h2("2. Book the call");
  text(`Once qualified, book the practice a sales call with Chase${bookingLink ? ` using the link in your portal (also here: ${bookingLink})` : " using the link in your portal"}. Enter the practice's name and email so the invite goes to them, and add yourself if you want to sit in. Chase runs the call and the close. You will see the practice move from Registered to Contract sent, Signed, Deposit paid and Live in your portal.`, 10, font, BODY, M, CW, 15);
  text("Approved closers skip this step: you run the call on your own calendar and generate the contract from the portal when the practice says yes.", 10, font, BODY, M, CW, 15);
  gap(8);
  h2("3. Approved closers: generate the agreement on the call");
  text("Reps that Blok Blok has approved as closers see a Generate contract button on each practice. Pick the website size, add the brand guide and a plan if they want them, and press generate. The portal creates Blok Blok's standard Service Agreement and the Stripe deposit link, emails both to the practice, and shows you the links to paste into the call. Nothing in the agreement can be edited or discounted; if a practice needs something different, book Chase.", 10, font, BODY, M, CW, 15);
  gap(8);
  h2("4. What happens next");
  bullet("The practice signs the agreement online and pays the deposit by card or bank. Both show up in your portal as they happen.");
  bullet("Blok Blok sends the onboarding link, collects content and starts the build. You do not need to chase anything after the deposit.");
  bullet("If a practice goes quiet, tell your team lead. Blok Blok follows up with the practice directly.");
  gap(14);
  h1("Rules every rep follows");
  bullet("Quote only the prices and inclusions in this kit. No discounts, no custom scopes, no promises about rankings, patient volume or dates.");
  bullet("Be clear that the call and the agreement are with Blok Blok Studio, a web design studio.");
  bullet("Follow calling, texting and emailing rules: honor do-not-call requests immediately and keep a record. Never ask for or store patient information.");
  bullet("Never take payment or bank details from a practice. Payment is always through the Stripe link Blok Blok issues.");

  // ── Objections + contact ───────────────────────────────────────────────
  newPage();
  h1("Common questions");
  const faq: Array<[string, string]> = [
    ["Why not a cheaper template site?", "Templates look like templates and are slow to load, which costs conversions. Every Blok Blok site is designed around the practice, built for speed and mobile, and maintained by the people who built it."],
    ["Why does a 5-page site take four weeks?", "Design iterations with the practice, content collection, build, review and launch. Faster is possible when content is ready on day one; it is never rushed at the expense of quality."],
    ["What if the practice has no logo or brand?", "Add the brand strategy guide. It runs before or alongside the site, so the site launches with an identity instead of a placeholder."],
    ["Do they have to take a plan?", "No. Plans are optional. Base keeps the site healthy; Growth gets the practice found locally; Premium adds AI reception and reactivation. Most practices that want results take Growth."],
    ["Who do they talk to after signing?", "Blok Blok directly: onboarding, content, feedback rounds and launch are all handled by the studio. Reps stay in the loop through the portal."],
    ["Can they pay in full up front?", "Yes, by paying the deposit link and the completion link back to back. The agreement still reads 50/50."],
  ];
  for (const [q, a] of faq) {
    ensure(50);
    text(q, 10.5, bold, DARK, M, CW, 15);
    text(a, 9.5, font, BODY, M, CW, 14);
    gap(8);
  }
  gap(10);
  h1("Contact");
  text("Chase Haynes, Founder, Blok Blok Studio LLC", 10, bold, DARK, M, CW, 15);
  text("chase@blokblokstudio.com", 10, font, BODY, M, CW, 15);
  text(`Partner portal: ${APP_URL}/partner/your-link`, 9.5, font, MUTED, M, CW, 14);

  return pdf.save();
}
