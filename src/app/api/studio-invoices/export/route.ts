import { NextRequest, NextResponse } from "next/server";
import { zipSync, strToU8 } from "fflate";
import prisma from "@/lib/prisma";
import type { StudioInvoice } from "@prisma/client";
import { requireOwner, handleError } from "../_shared";
import { loadInvoiceSettings } from "@/lib/invoicing/settings";
import { buildInvoiceView } from "@/lib/invoicing/view";
import { renderInvoicePdf } from "@/lib/invoicing/invoice-pdf";
import { buildStatementView, renderStatementPdf } from "@/lib/invoicing/partner-statement";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

function csvCell(v: unknown): string {
  let s = v == null ? "" : String(v);
  // A client name like "=HYPERLINK(...)" must not run as a formula when the
  // advisor opens the file in Excel: neutralise leading formula characters.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * GET ?year=2026&month=11&format=csv|zip
 * The monthly pack for BD Berlin Digital Tax: a CSV log of every issued
 * invoice (number · client · amount · currency · issue · due · paid · method)
 * and, with format=zip, every invoice PDF of the month alongside it.
 * Drafts are never included; voided invoices are (the number exists).
 */
export async function GET(request: NextRequest) {
  const { session, denied } = await requireOwner();
  if (denied || !session) return denied;
  try {
    const sp = new URL(request.url).searchParams;
    const year = Number(sp.get("year"));
    const month = sp.get("month") ? Number(sp.get("month")) : null; // 1..12 or null = whole year
    const format = sp.get("format") === "zip" ? "zip" : "csv";
    if (!year || year < 2000 || year > 2100) return NextResponse.json({ success: false, error: "year required" }, { status: 400 });
    if (month !== null && (month < 1 || month > 12)) return NextResponse.json({ success: false, error: "month must be 1-12" }, { status: 400 });

    const from = new Date(Date.UTC(year, month ? month - 1 : 0, 1));
    const to = month ? new Date(Date.UTC(year, month, 1)) : new Date(Date.UTC(year + 1, 0, 1));
    // Prisma include-type inference is broken repo-wide: cast the include result
    const rows = (await prisma.studioInvoice.findMany({
      where: { status: { not: "DRAFT" }, issueDate: { gte: from, lt: to } },
      include: { client: { select: { name: true, company: true } } },
      orderBy: [{ year: "asc" }, { sequence: "asc" }],
    })) as unknown as Array<StudioInvoice & { client: { name: string; company: string | null } }>;

    const header = ["number", "client", "company", "amount", "currency", "net", "vat_rate", "vat_amount", "vat_scheme", "issue_date", "due_date", "paid_date", "method", "status", "template", "sent_at", "sent_to", "content_hash"];
    const lines = [header.join(",")];
    for (const r of rows) {
      lines.push(
        [
          r.number,
          r.client.name,
          r.client.company || "",
          Number(r.total).toFixed(2),
          r.currency,
          Number(r.subtotal).toFixed(2),
          Number(r.vatRate).toFixed(2),
          Number(r.vatAmount).toFixed(2),
          r.vatScheme,
          r.issueDate?.toISOString().slice(0, 10) || "",
          r.dueDate?.toISOString().slice(0, 10) || "",
          r.paidAt?.toISOString().slice(0, 10) || "",
          r.status === "PAID" ? r.paidMethod || "bank" : r.paymentMethod === "STRIPE" ? "stripe" : "bank",
          r.status,
          r.template,
          r.sentAt?.toISOString() || "",
          r.sentTo || "",
          r.contentHash || "",
        ]
          .map(csvCell)
          .join(",")
      );
    }
    const csv = "﻿" + lines.join("\n") + "\n";
    const label = month ? `${year}-${String(month).padStart(2, "0")}` : String(year);

    await prisma.activityLog.create({ data: { actor: session.name, action: "invoice_export", details: `Invoice ${format.toUpperCase()} export for ${label} (${rows.length} invoices)` } }).catch(() => {});

    if (format === "csv") {
      return new NextResponse(csv, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="blokblok-invoices-${label}.csv"`,
          "Cache-Control": "no-store",
        },
      });
    }

    const settings = await loadInvoiceSettings();
    const files: Record<string, Uint8Array> = { [`invoices-${label}.csv`]: strToU8(csv) };
    for (const r of rows) {
      const view = buildInvoiceView(r, settings);
      const pdf = await renderInvoicePdf(view);
      const who = (r.client.company || r.client.name).replace(/[^\w.-]+/g, "_").slice(0, 40);
      files[`${r.number}_${who}${r.status === "VOID" ? "_VOID" : ""}.pdf`] = pdf;
    }
    // Partner commission statements (self-billing credit notes) of the same period
    const statements = await prisma.partnerStatement.findMany({ where: { issueDate: { gte: from, lt: to } }, orderBy: [{ year: "asc" }, { sequence: "asc" }] });
    if (statements.length) {
      const sLines = ["number,partner,net_usd,vat_rate,vat_usd,currency,issue_date,stripe_transfer,content_hash"];
      for (const st of statements) {
        const v = buildStatementView(st);
        sLines.push([v.number, v.partner.legalName || v.partner.name, v.net.toFixed(2), v.vatRate.toFixed(2), v.vatAmount.toFixed(2), v.currency, v.issueDate, v.stripeTransferId || "", v.contentHash || ""].map(csvCell).join(","));
        files[`partner-statements/${v.number}_${(v.partner.legalName || v.partner.name).replace(/[^\w.-]+/g, "_").slice(0, 40)}.pdf`] = await renderStatementPdf(v);
      }
      files[`partner-statements-${label}.csv`] = strToU8("\uFEFF" + sLines.join("\n") + "\n");
    }
    const zipped = zipSync(files, { level: 0 });
    return new NextResponse(Buffer.from(zipped), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="blokblok-invoices-${label}.zip"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return handleError(err, "Failed to export invoices");
  }
}
